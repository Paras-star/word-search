const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load(file, mocks = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require', 'module', 'exports', js)(name => {
    assert.ok(Object.hasOwn(mocks, name), `Unexpected runtime import: ${name}`);
    return mocks[name];
  }, module, module.exports);
  return module.exports;
}
const { CATEGORIES, getCategory } = load('data/categories.ts');
const { generatePuzzle, lineCells, lettersFor } = load('game/puzzle.ts');
const { isCategoryUnlocked, nextCategoryId } = load('game/progression.ts');
const { scoreFoundWord } = load('game/scoring.ts', { '@/constants/homePalette': { homeColors: {} } });
const expected = {
  emotions: ['COURAGE', 'CURIOSITY', 'PATIENCE', 'HONESTY', 'KINDNESS', 'JEALOUSY', 'WONDER', 'ANXIETY', 'PRIDE', 'EMPATHY', 'RESILIENCE', 'LOYALTY', 'HUMILITY', 'OPTIMISM', 'FEAR', 'GRATITUDE'],
  workshop: ['HAMMER', 'WRENCH', 'SCREWDRIVER', 'PLIERS', 'CHISEL', 'DRILL', 'HACKSAW', 'CLAMP', 'ANVIL', 'SOLDERING', 'SANDPAPER', 'LEVELER', 'RIVET', 'PULLEY', 'VISE', 'TAPEMEASURE'],
};
const original = CATEGORIES.filter(category => !Object.hasOwn(expected, category.id));

function screenDeclaration(name, bindings) {
  const ast = ts.createSourceFile('game.tsx', read('app/game.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let declaration;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) declaration = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(declaration, `Missing screen declaration ${name}`);
  const js = ts.transpileModule(`const ${declaration.getText(ast)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return new Function(...Object.keys(bindings), `${js};return ${name};`)(...Object.values(bindings));
}

test('new categories follow Anatomy in exact order with 16 exact, unique targets each', () => {
  assert.equal(CATEGORIES.length, 18);
  assert.equal(new Set(CATEGORIES.map(category => category.id)).size, 18);
  assert.deepEqual(CATEGORIES.slice(-3).map(category => category.id), ['human-anatomy', 'emotions', 'workshop']);
  assert.equal(getCategory('emotions').name, 'Emotions');
  assert.equal(getCategory('workshop').name, 'Workshop');
  const oldWords = new Set(original.flatMap(category => category.words));
  const allNew = Object.values(expected).flat();
  assert.equal(new Set(allNew).size, 32);
  for (const [id, words] of Object.entries(expected)) {
    assert.equal(getCategory(id).words.length, 16);
    assert.deepEqual(getCategory(id).words, words);
    assert.ok(words.every(word => !oldWords.has(word)));
  }
  assert.match(read('app/categories.tsx'), /<FlatList data=\{CATEGORIES\}/);
});

test('all 16 original category records and seeded puzzles are unchanged', () => {
  const sha = value => crypto.createHash('sha256').update(value).digest('hex');
  assert.equal(sha(JSON.stringify(original)), '3610cb3099d9eff8b02c4c6cbbce36decce8ab891c723034448d4181f2e0f366');
  const hash = crypto.createHash('sha256');
  for (const category of original) for (const seed of [undefined, `${category.id}:preservation`]) {
    hash.update(JSON.stringify(generatePuzzle(category, seed)));
  }
  assert.equal(hash.digest('hex'), '30d8afc129ae146e140bbcd05b90f7d9ddc9f1a8382251d5cd938b6fe39e7c47');
});

for (const [id, words] of Object.entries(expected)) {
  test(`${id}: all 16 targets generate and can be selected in either direction across 50 seeds`, () => {
    const category = getCategory(id);
    const before = JSON.stringify(category);
    for (let seed = 0; seed < 50; seed++) {
      const puzzle = generatePuzzle(category, seed === 0 ? undefined : `${id}:test:${seed}`);
      assert.equal(puzzle.size, 12);
      assert.deepEqual(puzzle.words, words);
      assert.equal(Object.keys(puzzle.placements).length, 16);
      assert.ok(puzzle.grid.every(row => row.length === 12 && row.every(letter => /^[A-Z]$/.test(letter))));
      for (const word of words) {
        const placed = puzzle.placements[word];
        assert.equal(placed.cells.length, word.length);
        assert.deepEqual(lineCells(placed.start, placed.end, puzzle.size), placed.cells);
        assert.equal(lettersFor(puzzle.grid, placed.cells), word);
        assert.equal(lettersFor(puzzle.grid, lineCells(placed.end, placed.start, 12)).split('').reverse().join(''), word);
      }
    }
    assert.equal(JSON.stringify(category), before);
    assert.deepEqual(generatePuzzle(category), generatePuzzle(category));
  });
}

test('Tape Measure displays naturally while remaining one eleven-letter normalized target', () => {
  const category = getCategory('workshop');
  const labels = category.words.map(word => category.wordLabels?.[word] ?? word);
  assert.equal(labels.filter(label => label === 'Tape Measure').length, 1);
  assert.ok(!category.words.includes('TAPE') && !category.words.includes('MEASURE'));
  assert.equal('Tape Measure'.replace(/\s/g, '').toUpperCase(), 'TAPEMEASURE');
  assert.equal(generatePuzzle(category).placements.TAPEMEASURE.cells.length, 11);
  assert.match(read('app/game.tsx'), /wordLabels=\{category\.wordLabels\}/);
  assert.match(read('app/game.tsx'), /\{wordLabels\?\.\[word\] \?\? word\}/);
});

test('the actual screen handler solves every new word once, with normal scoring and found paths', () => {
  for (const id of Object.keys(expected)) for (const reverse of [false, true]) {
    const puzzle = generatePuzzle(getCategory(id));
    const state = { found: [], paths: {}, score: 0, sounds: [] };
    const foundRef = { current: [] }, selection = { current: [] };
    const solve = screenDeclaration('endSelection', {
      puzzle, foundRef, selectedCellsRef: selection, completionStarted: { current: false },
      setSelectedCells() {},
      lettersFor, BONUS_WORDS: new Set(), bonusWords: [],
      setFoundWords(fn) { state.found = fn(state.found); foundRef.current = state.found; },
      setFoundPaths(fn) { state.paths = fn(state.paths); },
      setScore(fn) { state.score = fn(state.score); },
      scoreFoundWord, playSound(sound) { state.sounds.push(sound); }, setFeedback() {},
      setBonusWords() { assert.fail('A target must not become a bonus word'); },
    });
    for (const word of expected[id]) {
      const cells = puzzle.placements[word].cells;
      selection.current = reverse ? [...cells].reverse() : cells;
      solve();
      assert.deepEqual(state.paths[word], cells, word);
    }
    assert.deepEqual(state.found, expected[id]);
    assert.equal(state.score, expected[id].reduce(score => scoreFoundWord(score, true), 0));
    assert.equal(state.sounds.filter(sound => sound === 'correct').length, 16);
    selection.current = puzzle.placements[expected[id][0]].cells;
    solve();
    assert.equal(state.found.length, 16, 'repeat selection cannot increment completion');
  }
});

test('the actual hint handler highlights Tape Measure as one complete target and spends one hint', () => {
  const puzzle = generatePuzzle(getCategory('workshop'));
  let hints = 3, highlight;
  const useHint = screenDeclaration('useHint', {
    puzzle, hints, foundRef: { current: puzzle.words.filter(word => word !== 'TAPEMEASURE') },
    hintTimeout: { current: null }, adPaused: { current: false },
    completionStarted: { current: false }, activePuzzleKey: { current: puzzle.id },
    setHints(fn) { hints = fn(hints); }, setHintCells(cells) { highlight = cells; },
    setTimeout() { return 1; }, playSound() {},
  });
  useHint();
  assert.equal(hints, 2);
  assert.deepEqual(highlight, puzzle.placements.TAPEMEASURE.cells);
  assert.equal(lettersFor(puzzle.grid, highlight), 'TAPEMEASURE');
});

test('saved category IDs unlock Anatomy → Emotions → Workshop without altering earlier progression', () => {
  const anatomyIndex = CATEGORIES.findIndex(category => category.id === 'human-anatomy');
  const emotionIndex = anatomyIndex + 1, workshopIndex = anatomyIndex + 2;
  assert.equal(nextCategoryId('human-anatomy', CATEGORIES), 'emotions');
  assert.equal(nextCategoryId('emotions', CATEGORIES), 'workshop');
  assert.equal(nextCategoryId('workshop', CATEGORIES), undefined);
  assert.equal(isCategoryUnlocked(emotionIndex, [], CATEGORIES), false);
  assert.equal(isCategoryUnlocked(workshopIndex, ['human-anatomy'], CATEGORIES), false);
  assert.equal(isCategoryUnlocked(emotionIndex, ['human-anatomy'], CATEGORIES), true);
  assert.equal(isCategoryUnlocked(workshopIndex, ['human-anatomy', 'emotions'], CATEGORIES), true);
  for (let i = 0; i < original.length; i++) for (let count = 0; count <= original.length; count++) {
    const completed = original.slice(0, count).map(category => category.id);
    assert.equal(isCategoryUnlocked(i, completed, CATEGORIES), isCategoryUnlocked(i, completed, original));
  }
  // The same ID-based rule continues to work if another category is added later.
  const extended = [...CATEGORIES, { id: 'future-category' }];
  assert.equal(nextCategoryId('workshop', extended), 'future-category');
  assert.equal(isCategoryUnlocked(extended.length - 1, ['workshop'], extended), true);
});

test('both new levels use the existing expanded word-list layout without changing other levels', () => {
  for (const id of Object.keys(expected)) {
    assert.equal(screenDeclaration('expandedWordCount', {
      onboarding: undefined, daily: undefined, categoryId: id, getCategory,
    }), 16);
    assert.equal(screenDeclaration('expandedWordCount', {
      onboarding: undefined, daily: {}, categoryId: id, getCategory,
    }), 0);
  }
});
