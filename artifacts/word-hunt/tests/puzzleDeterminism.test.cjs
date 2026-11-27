const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  root, originalFile, fixtureFile, loadSource, loadModule, generate, hash,
} = require('../scripts/benchmark-puzzle-generation.cjs');

const original = fs.readFileSync(originalFile, 'utf8');
const fixtures = JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
const newLevelFixtures = JSON.parse(fs.readFileSync(
  path.join(root, 'tests/fixtures/new-level-puzzle-hashes.json'), 'utf8'));
const api = loadModule('game/puzzle.ts');

test('golden fixtures preserve the generator and cover six introductions and all 22 categories', () => {
  assert.equal(hash(original), fixtures.originalSourceSha256);
  for (let step = 0; step < 6; step++) {
    assert.ok(fixtures.cases.some(input => input.group === `intro-${step}`));
  }
  const { CATEGORIES } = loadModule('data/categories.ts');
  assert.equal(CATEGORIES.length, 22);
  const additions = new Set(['mythology', 'kitchen', 'transport', 'buildings']);
  for (const category of CATEGORIES) {
    const fixtureCount = additions.has(category.id)
      ? newLevelFixtures.cases.filter(input => input.categoryId === category.id).length
      : fixtures.cases.filter(input => input.group === category.id).length;
    assert.ok(fixtureCount >= 4, category.id);
  }
  for (const category of ['countries', 'nature', 'technology', 'vegetables']) {
    assert.ok(fixtures.cases.filter(input => input.group === category).length >= 30, category);
  }
  assert.ok(fixtures.cases.some(input => input.seed === 'diagnosis:countries:52'));
  assert.ok(fixtures.cases.some(input => input.group === 'animals-first'));
  assert.ok(fixtures.cases.some(input => input.group === 'daily'));
});

test('new categories match deterministic puzzle hash fixtures across four seeds each', () => {
  const { CATEGORIES } = loadModule('data/categories.ts');
  assert.equal(newLevelFixtures.cases.length, 16);
  for (const input of newLevelFixtures.cases) {
    const category = CATEGORIES.find(item => item.id === input.categoryId);
    assert.ok(category, `Missing category ${input.categoryId}`);
    assert.equal(hash(JSON.stringify(api.generatePuzzle(category, input.seed))), input.sha256,
      `${input.categoryId}: ${input.seed}`);
  }
});

test('every complete generated output matches the pre-optimization fixture exactly', () => {
  for (const input of fixtures.cases) {
    const result = generate(api, input);
    assert.deepEqual(result, input.expected, `${input.group}: ${input.seed}`);
    assert.equal(JSON.stringify(result), JSON.stringify(input.expected), 'property and placement ordering is preserved');
    for (const word of result.words) {
      const actual = result.placements[word], expected = input.expected.placements[word];
      assert.deepEqual(actual.cells, expected.cells);
      assert.equal(Math.sign(actual.end.row - actual.start.row), Math.sign(expected.end.row - expected.start.row));
      assert.equal(Math.sign(actual.end.col - actual.start.col), Math.sign(expected.end.col - expected.start.col));
      assert.equal(api.lettersFor(result.grid, actual.cells), word);
    }
  }
});

test('random call counts and ordered random-state fingerprints match the original for every fixture', () => {
  const before = { arrays: 0, cells: 0, randomCalls: 0, randomHash: 0 };
  const after = { arrays: 0, cells: 0, randomCalls: 0, randomHash: 0 };
  const oldApi = loadSource(original, before);
  const newApi = loadSource(fs.readFileSync(path.join(root, 'game/puzzle.ts'), 'utf8'), after);
  for (const input of fixtures.cases) {
    Object.assign(before, { arrays: 0, cells: 0, randomCalls: 0, randomHash: 0 });
    Object.assign(after, { arrays: 0, cells: 0, randomCalls: 0, randomHash: 0 });
    assert.deepEqual(generate(oldApi, input), input.expected);
    assert.deepEqual(generate(newApi, input), input.expected);
    assert.equal(after.randomCalls, before.randomCalls, input.seed);
    assert.equal(after.randomHash, before.randomHash, input.seed);
    assert.ok(after.arrays <= before.arrays);
    assert.ok(after.cells <= before.cells);
  }
});

test('PRNG, shuffling and all exported grid/gesture helpers remain byte-for-byte unchanged', () => {
  const source = fs.readFileSync(path.join(root, 'game/puzzle.ts'), 'utf8');
  assert.equal(source.slice(source.indexOf('export function lineCells')), original.slice(original.indexOf('export function lineCells')));
  const randomSection = text => text.slice(text.indexOf('function seededRandom'), text.indexOf('function cellsFor'));
  assert.equal(randomSection(source), randomSection(original));
  const sizeSection = text => text.slice(0, text.indexOf('function seededRandom'));
  assert.equal(sizeSection(source), sizeSection(original));
});

test('overlapping letters and exhausted-retry errors preserve original results and random calls', () => {
  for (const input of [
    { category: { id: 'overlap', name: 'Overlap', words: ['AAAAA', 'AAAA', 'AAA'] }, seed: 'overlap' },
    { category: { id: 'too-long', name: 'Too long', words: ['ABCDEFGHIJKLM'] }, seed: 'exhaust-retries' },
    { category: { id: 'no-directions', name: 'No directions', words: ['CAT'] }, seed: 'empty-directions', options: { directions: [] } },
  ]) {
    const counts = () => ({ arrays: 0, cells: 0, randomCalls: 0, randomHash: 0 });
    const before = counts(), after = counts();
    const oldApi = loadSource(original, before);
    const newApi = loadSource(fs.readFileSync(path.join(root, 'game/puzzle.ts'), 'utf8'), after);
    const outcome = generator => {
      try { return { puzzle: generate(generator, input) }; }
      catch (error) { return { error: error.message }; }
    };
    assert.deepEqual(outcome(newApi), outcome(oldApi), input.seed);
    assert.equal(after.randomCalls, before.randomCalls, input.seed);
    assert.equal(after.randomHash, before.randomHash, input.seed);
    if (input.category.id === 'too-long') {
      assert.ok(before.arrays > 0);
      assert.equal(after.arrays, 0, 'failed candidates allocate no cell paths, even across every retry');
    }
  }
});
