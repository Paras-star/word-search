// Run with: node --expose-gc artifacts/word-hunt/scripts/benchmark-puzzle-generation.cjs
// --capture-fixtures is a one-time, exclusive-write capture BEFORE editing puzzle.ts.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { performance, PerformanceObserver } = require('node:perf_hooks');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const fixtureDir = path.join(root, 'tests/fixtures');
const originalFile = path.join(fixtureDir, 'puzzle-generator-original.ts.txt');
const fixtureFile = path.join(fixtureDir, 'puzzle-generation.json');
const hash = source => crypto.createHash('sha256').update(source).digest('hex');

function loadSource(source, allocationStats) {
  let code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  if (allocationStats) {
    assert.ok(code.includes('function cellsFor(word, start, direction) {'));
    code = code.replace('function cellsFor(word, start, direction) {',
      'function cellsFor(word, start, direction) { __stats.arrays++; __stats.cells += word.length;');
    const randomReturn = 'return ((state >>> 0) % 100000) / 100000;';
    assert.ok(code.includes(randomReturn));
    code = code.replace(randomReturn,
      '__stats.randomCalls++; __stats.randomHash = (Math.imul(__stats.randomHash, 31) ^ state) >>> 0; ' + randomReturn);
  }
  const module = { exports: {} };
  new Function('require', 'module', 'exports', '__stats', code)(name => {
    throw Error(`Unexpected runtime dependency: ${name}`);
  }, module, module.exports, allocationStats);
  return module.exports;
}

function loadModule(file) {
  return loadSource(fs.readFileSync(path.join(root, file), 'utf8'));
}

function inputs() {
  const { CATEGORIES } = loadModule('data/categories.ts');
  const { ONBOARDING_STEPS } = loadModule('game/onboarding.ts');
  const { getPuzzleCategory } = loadModule('game/puzzleConfig.ts');
  const cases = [], keys = new Set();
  const add = (group, category, seed, options) => {
    const key = `${group}:${seed}`;
    if (!keys.has(key)) {
      keys.add(key);
      cases.push({ group, category, seed, ...(options ? { options } : {}) });
    }
  };
  ONBOARDING_STEPS.forEach((step, index) => add(`intro-${index}`,
    { id: `onboarding-${index}`, name: step.label, words: step.words }, step.seed, step.options));
  for (const category of CATEGORIES) {
    add(category.id, category, `${category.id}:default`);
    for (let index = 0; index < 30; index++) {
      add(category.id, category, `diagnosis:${category.id}:${index}`);
    }
  }
  for (const index of [31, 47, 50, 52, 57]) {
    const category = CATEGORIES.find(item => item.id === 'countries');
    add('countries-difficult', category, `diagnosis:countries:${index}`);
  }
  const initialAnimals = getPuzzleCategory(CATEGORIES[0], []);
  for (let index = 0; index < 4; index++) {
    add('animals-first', initialAnimals, index === 0 ? 'animals:default' : `diagnosis:animals:${index - 1}`);
  }
  // Daily data/rules remain untouched; exercise the shared generator on its exact inputs.
  const dailySource = fs.readFileSync(path.join(root, 'game/daily.ts'), 'utf8')
    .replace("import { DAILY_WORDS } from '@/data/dailyWords';", '');
  const dailyCode = ts.transpileModule(dailySource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const dailyModule = { exports: {} };
  new Function('module', 'exports', 'DAILY_WORDS', dailyCode)(
    dailyModule, dailyModule.exports, loadModule('data/dailyWords.ts').DAILY_WORDS);
  for (let day = 19; day <= 24; day++) {
    const key = `2026-11-${day}`;
    add('daily', dailyModule.exports.dailyCategory(key), dailyModule.exports.dailySeed(key));
  }
  return cases;
}

function fixtureInputs() {
  const difficult = new Set(['countries', 'nature', 'technology', 'vegetables']);
  return inputs().filter(item => !item.seed.startsWith(`diagnosis:${item.group}:`)
    || difficult.has(item.group)
    || Number(item.seed.split(':').at(-1)) < 3);
}

function generate(api, input) {
  return api.generatePuzzle(input.category, input.seed, input.options);
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n: sorted.length,
    median: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
    max: sorted.at(-1),
  };
}

async function gcProfile(api, cases) {
  if (!global.gc) return { unavailable: 'Run node with --expose-gc' };
  global.gc();
  await new Promise(resolve => setImmediate(resolve));
  const entries = [];
  const observer = new PerformanceObserver(list => entries.push(...list.getEntries()));
  observer.observe({ entryTypes: ['gc'] });
  const start = performance.now();
  for (const input of cases) generate(api, input);
  const end = performance.now();
  await new Promise(resolve => setImmediate(() => setImmediate(resolve)));
  observer.disconnect();
  const measured = entries.filter(entry => entry.startTime >= start && entry.startTime < end);
  return { calls: cases.length, wallMs: end - start, collections: measured.length,
    gcMs: measured.reduce((sum, entry) => sum + entry.duration, 0) };
}

async function benchmark() {
  const originalSource = fs.readFileSync(originalFile, 'utf8');
  const fixtures = JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
  assert.equal(hash(originalSource), fixtures.originalSourceSha256);
  const original = loadSource(originalSource);
  const optimized = loadModule('game/puzzle.ts');
  const cases = inputs();
  for (const input of cases) assert.deepEqual(generate(optimized, input), generate(original, input), input.seed);
  const groups = [...new Set(cases.map(item => item.group))];
  const samples = new Map(groups.map(group => [group, { before: [], after: [], seeds: new Map() }]));
  const allBefore = [], allAfter = [];
  // Explicit warmup for both versions. Compilation and output comparison are untimed.
  for (const group of groups) {
    const input = cases.find(item => item.group === group);
    for (let turn = 0; turn < 3; turn++) { generate(original, input); generate(optimized, input); }
  }
  const passes = 3;
  const timingCases = cases.flatMap(input => Array(input.group.startsWith('intro-') ? 10 : 1).fill(input));
  for (let pass = 0; pass < passes; pass++) {
    for (const input of timingCases) {
      const pair = {};
      for (const name of (pass % 2 === 0 ? ['before', 'after'] : ['after', 'before'])) {
        const start = performance.now();
        generate(name === 'before' ? original : optimized, input);
        pair[name] = performance.now() - start;
      }
      const row = samples.get(input.group);
      row.before.push(pair.before); row.after.push(pair.after);
      allBefore.push(pair.before); allAfter.push(pair.after);
      if (!row.seeds.has(input.seed)) row.seeds.set(input.seed, { before: [], after: [] });
      const seed = row.seeds.get(input.seed);
      seed.before.push(pair.before); seed.after.push(pair.after);
    }
  }
  const percent = (before, after) => 100 * (before - after) / before;
  const rows = groups.map(group => {
    const sample = samples.get(group), before = stats(sample.before), after = stats(sample.after);
    return { group, before, after, medianImprovementPercent: percent(before.median, after.median),
      p95ImprovementPercent: percent(before.p95, after.p95) };
  });
  const difficultSeeds = ['countries', 'nature', 'technology', 'vegetables', 'countries-difficult'].flatMap(group =>
    [...samples.get(group).seeds].map(([seed, sample]) => ({ group, seed,
      before: stats(sample.before), after: stats(sample.after) }))
      .sort((a, b) => b.before.median - a.before.median).slice(0, 3));
  const allocation = {};
  for (const [name, source] of [['before', originalSource], ['after', fs.readFileSync(path.join(root, 'game/puzzle.ts'), 'utf8')]]) {
    const counts = { arrays: 0, cells: 0, randomCalls: 0, randomHash: 0 };
    const api = loadSource(source, counts);
    for (const fixture of fixtures.cases) {
      assert.deepEqual(generate(api, fixture), fixture.expected, fixture.seed);
    }
    allocation[name] = counts;
  }
  assert.equal(allocation.before.randomCalls, allocation.after.randomCalls);
  assert.equal(allocation.before.randomHash, allocation.after.randomHash);
  const overallBefore = stats(allBefore), overallAfter = stats(allAfter);
  const totalBefore = allBefore.reduce((a, b) => a + b, 0);
  const totalAfter = allAfter.reduce((a, b) => a + b, 0);
  const report = {
    conditions: { node: process.version, platform: process.platform, arch: process.arch,
      passes, distinctInputs: cases.length, introRepeatsPerPass: 10,
      timedSamplesPerVersion: timingCases.length * passes,
      pairOrder: 'alternating by pass', gcExposed: !!global.gc,
      note: 'Node/V8 only; no React, native decoding, navigation or Android measurements' },
    fixtureCount: fixtures.cases.length, rows, difficultSeeds,
    overall: { before: overallBefore, after: overallAfter,
      medianImprovementPercent: percent(overallBefore.median, overallAfter.median),
      p95ImprovementPercent: percent(overallBefore.p95, overallAfter.p95),
      totalBeforeMs: totalBefore, totalAfterMs: totalAfter,
      totalImprovementPercent: percent(totalBefore, totalAfter) },
    allocation,
    gc: { before: await gcProfile(original, cases), after: await gcProfile(optimized, cases) },
  };
  console.log(JSON.stringify(report, null, 2));
}

if (require.main === module) {
  if (process.argv.includes('--capture-fixtures')) {
    assert.ok(!fs.existsSync(originalFile) && !fs.existsSync(fixtureFile), 'Refusing to overwrite original fixtures');
    const source = fs.readFileSync(path.join(root, 'game/puzzle.ts'), 'utf8');
    const api = loadSource(source);
    const captured = fixtureInputs().map(input => ({ ...input, expected: generate(api, input) }));
    fs.mkdirSync(fixtureDir, { recursive: true });
    fs.writeFileSync(originalFile, source, { flag: 'wx' });
    fs.writeFileSync(fixtureFile, '{\n"version":1,\n"originalSourceSha256":' + JSON.stringify(hash(source))
      + ',\n"cases":[\n' + captured.map(item => JSON.stringify(item)).join(',\n') + '\n]\n}\n', { flag: 'wx' });
    console.log(`Captured ${captured.length} full original outputs; source SHA256 ${hash(source)}`);
  } else {
    benchmark().catch(error => { console.error(error); process.exitCode = 1; });
  }
}

module.exports = { root, originalFile, fixtureFile, loadSource, loadModule, generate, hash };
