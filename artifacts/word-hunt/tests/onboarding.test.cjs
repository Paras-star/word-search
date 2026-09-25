const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadTypeScript(relativePath, mockRequire = () => {
  throw new Error('Unexpected runtime import');
}) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(mockRequire, module, module.exports);
  return module.exports;
}

function storageHarness(initial = {}) {
  const values = new Map(Object.entries(initial));
  let failure = 'none';
  const storage = {
    getItem: async (key) => values.get(key) ?? null,
    multiGet: async (keys) => keys.map((key) => [key, values.get(key) ?? null]),
    setItem: async (key, value) => {
      if (failure === 'before') throw new Error('Storage unavailable');
      values.set(key, value);
      if (failure === 'after') throw new Error('Storage response lost');
    },
  };
  const api = loadTypeScript('services/storage.ts', (name) => {
    if (name === '@react-native-async-storage/async-storage') return { __esModule: true, default: storage };
    if (name === '@/game/daily') {
      return loadTypeScript('game/daily.ts', (dependency) => {
        if (dependency === '@/data/dailyWords') return loadTypeScript('data/dailyWords.ts');
        throw new Error(`Unexpected daily runtime import: ${dependency}`);
      });
    }
    throw new Error(`Unexpected runtime import: ${name}`);
  });
  return { api, values, fail: (mode) => { failure = mode; } };
}

test('fresh progress starts at 50 and persists across a reload', async () => {
  const { api, values } = storageHarness();
  const fresh = await api.loadProgress();
  assert.deepEqual(fresh, { coins: 50, completedLevels: [], onboardingStep: 0 });
  assert.ok(values.has('@word-hunt/progress-v2'));
  assert.deepEqual(await api.loadProgress(), fresh);
});

test('each of six steps earns 10 once, survives reloads, and ends at 110', async () => {
  const { api } = storageHarness();
  let progress = await api.loadProgress();
  for (let step = 0; step < 6; step++) {
    assert.throws(() => api.advanceOnboarding(progress, step + 1), /not available/);
    const next = api.advanceOnboarding(progress, step);
    await api.saveProgress(next);
    progress = await api.loadProgress();
    assert.equal(progress.coins, 60 + step * 10);
    assert.equal(progress.onboardingStep, step + 1);
    assert.equal(api.advanceOnboarding(progress, step), null);
  }
  assert.equal(progress.coins, 110);
  assert.equal(progress.onboardingStep, 6);
  assert.equal(api.advanceOnboarding(progress, 5), null);
});

test('save failure remains retryable, including a response lost after a write', async () => {
  const { api, fail } = storageHarness();
  const fresh = await api.loadProgress();
  fail('before');
  await assert.rejects(api.saveProgress(api.advanceOnboarding(fresh, 0)));
  fail('none');
  assert.deepEqual(await api.loadProgress(), fresh);
  const earned = api.advanceOnboarding(fresh, 0);
  fail('after');
  await assert.rejects(api.saveProgress(earned));
  fail('none');
  const reloaded = await api.loadProgress();
  assert.equal(reloaded.coins, 60);
  assert.equal(reloaded.onboardingStep, 1);
  assert.equal(api.advanceOnboarding(reloaded, 0), null);
});

test('legacy saved players retain their exact coins and skip onboarding', async () => {
  for (const savedCoins of ['0', '50', '350', '425']) {
    const { api, values } = storageHarness({
      '@word-hunt/coins': savedCoins,
      '@word-hunt/completed-levels': '["animals","food"]',
    });
    const migrated = await api.loadProgress();
    assert.deepEqual(migrated, { coins: Number(savedCoins), completedLevels: ['animals', 'food'], onboardingStep: 6 });
    assert.equal(values.get('@word-hunt/coins'), savedCoins);
    assert.deepEqual(await api.loadProgress(), migrated);
  }
  const { api } = storageHarness({ '@word-hunt/completed-levels': '[]' });
  assert.deepEqual(await api.loadProgress(), { coins: 50, completedLevels: [], onboardingStep: 6 });
});

test('invalid saved progress is not silently reset', async () => {
  const { api } = storageHarness({ '@word-hunt/progress-v2': '{"coins":-10,"completedLevels":[],"onboardingStep":0}' });
  await assert.rejects(api.loadProgress(), /invalid/);
});

test('six deterministic onboarding puzzles honor word count and placement restrictions', () => {
  const { generatePuzzle } = loadTypeScript('game/puzzle.ts');
  const { ONBOARDING_STEPS } = loadTypeScript('game/onboarding.ts');
  assert.deepEqual(ONBOARDING_STEPS.map((step) => step.words.length), [5, 5, 7, 9, 12, 15]);
  ONBOARDING_STEPS.forEach((step, index) => {
    const category = { id: step.id, name: step.label, emoji: '', words: step.words };
    const first = generatePuzzle(category, step.seed, step.options);
    assert.deepEqual(generatePuzzle(category, step.seed, step.options), first);
    let diagonals = 0;
    let reverses = 0;
    for (const word of step.words) {
      const placement = first.placements[word];
      assert.ok(placement, `missing ${word}`);
      assert.equal(placement.cells.map(({ row, col }) => first.grid[row][col]).join(''), word);
      const row = Math.sign(placement.end.row - placement.start.row);
      const col = Math.sign(placement.end.col - placement.start.col);
      if (row !== 0 && col !== 0) diagonals++;
      if (col < 0 || (col === 0 && row < 0)) reverses++;
    }
    if (index < 2) assert.equal(diagonals, 0);
    if (index >= 2) assert.ok(diagonals > 0, `step ${index} needs diagonal words`);
    if (index < 4) assert.equal(reverses, 0);
    if (index === 4) assert.ok(reverses >= 1 && reverses <= 2);
    if (index === 5) assert.ok(reverses >= 2 && reverses <= 3);
  });
});