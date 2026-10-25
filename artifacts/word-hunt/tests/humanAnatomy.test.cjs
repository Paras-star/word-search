const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
function load(relative, requireMock = () => { throw new Error('Unexpected runtime import'); }) {
  const module = { exports: {} };
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', js)(requireMock, module, module.exports);
  return module.exports;
}
const { CATEGORIES, getCategory } = load('data/categories.ts');
const { generatePuzzle, getGridSize, lineCells, lettersFor } = load('game/puzzle.ts');
const { getPuzzleCategory } = load('game/puzzleConfig.ts');
const { isCategoryUnlocked, nextCategoryId } = load('game/progression.ts');
const anatomy = getCategory('human-anatomy');
const expectedWords = [
  'SKULL', 'SPINE', 'RIBCAGE', 'SHOULDER', 'ELBOW', 'WRIST', 'KNUCKLE', 'THIGH',
  'ANKLE', 'HEEL', 'MUSCLE', 'TENDON', 'CARTILAGE', 'LUNG', 'KIDNEY', 'PANCREAS',
];
const existing = CATEGORIES.filter(category => category.id !== 'human-anatomy');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

test('exactly one Human Anatomy category follows Vegetables with the exact 16 targets in order', () => {
  assert.equal(CATEGORIES.length, 16);
  assert.equal(CATEGORIES.filter(category => category.id === 'human-anatomy').length, 1);
  assert.equal(CATEGORIES.findIndex(category => category.id === 'human-anatomy'),
    CATEGORIES.findIndex(category => category.id === 'vegetables') + 1);
  assert.equal(anatomy.name, 'Human Anatomy');
  assert.equal(anatomy.emoji, '🧠');
  assert.deepEqual(anatomy.words, expectedWords);
  assert.equal(new Set(anatomy.words).size, 16);
  assert.equal(sha256(JSON.stringify(existing)),
    '70016dd12e6b20dcfdbc12d148238545e63364e09dd7721b6a9856ec8faf7d27',
    'all previous category IDs, labels, emoji, target lists and ordering must remain unchanged');
});

test('the existing rules modestly increase the grid from Vegetables 10×10 to Anatomy 12×12', () => {
  assert.equal(getGridSize(getCategory('vegetables').words), 10);
  assert.equal(getGridSize(anatomy.words), 12);
  assert.strictEqual(getPuzzleCategory(anatomy, []), anatomy);
  assert.strictEqual(getPuzzleCategory(anatomy, ['human-anatomy']), anatomy);
  assert.equal(generatePuzzle(anatomy).size, 12);
});

test('all 16 targets, including CARTILAGE, are placeable and selectable forward and backward across 100 seeds', () => {
  const before = JSON.stringify(anatomy);
  for (let index = 0; index < 100; index++) {
    const puzzle = generatePuzzle(anatomy, index === 0 ? undefined : `human-anatomy:regression:${index}`);
    assert.equal(puzzle.categoryId, 'human-anatomy');
    assert.deepEqual(puzzle.words, expectedWords);
    assert.equal(Object.keys(puzzle.placements).length, 16);
    assert.equal(puzzle.grid.length, 12);
    assert.ok(puzzle.grid.every(row => row.length === 12 && row.every(letter => /^[A-Z]$/.test(letter))));
    for (const word of expectedWords) {
      const placement = puzzle.placements[word];
      assert.equal(placement.cells.length, word.length, word);
      assert.ok(placement.cells.every(cell => cell.row >= 0 && cell.row < 12 && cell.col >= 0 && cell.col < 12), word);
      assert.equal(new Set(placement.cells.map(cell => `${cell.row}:${cell.col}`)).size, word.length);
      assert.deepEqual(lineCells(placement.start, placement.end, puzzle.size), placement.cells, word);
      assert.equal(lettersFor(puzzle.grid, lineCells(placement.start, placement.end, 12)), word);
      assert.equal(lettersFor(puzzle.grid, lineCells(placement.end, placement.start, 12)).split('').reverse().join(''), word);
    }
  }
  assert.equal(JSON.stringify(anatomy), before, 'generation must not mutate category data');
  assert.deepEqual(generatePuzzle(anatomy), generatePuzzle(anatomy), 'reopening the same seed must be stable');
});

test('default and alternate seeded puzzles for every existing category remain identical', () => {
  const hash = crypto.createHash('sha256');
  for (const category of existing) {
    for (const seed of [undefined, `${category.id}:preservation`]) {
      hash.update(JSON.stringify(generatePuzzle(category, seed)));
    }
  }
  assert.equal(hash.digest('hex'), '5f4649a603da7df4acd7df08a7f085539183ee778f7f1f42fab523921fc07571');
});

test('Vegetables unlocks Anatomy using saved category IDs without changing any existing unlock', () => {
  const index = CATEGORIES.findIndex(category => category.id === anatomy.id);
  assert.equal(isCategoryUnlocked(index, [], CATEGORIES), false);
  assert.equal(isCategoryUnlocked(index, existing.slice(0, -1).map(category => category.id), CATEGORIES), false);
  assert.equal(isCategoryUnlocked(index, ['vegetables'], CATEGORIES), true);
  assert.equal(nextCategoryId('vegetables', CATEGORIES), anatomy.id);
  assert.equal(nextCategoryId(anatomy.id, CATEGORIES), undefined);
  for (let i = 0; i < existing.length; i++) {
    for (let completed = 0; completed <= existing.length; completed++) {
      const ids = existing.slice(0, completed).map(category => category.id);
      assert.equal(isCategoryUnlocked(i, ids, CATEGORIES), isCategoryUnlocked(i, ids, existing));
    }
  }
});

test('existing progress reloads without resets and Anatomy completes through the unchanged provider callbacks', async () => {
  const saved = { coins: 425, completedLevels: existing.map(category => category.id), onboardingStep: 6 };
  const values = new Map([['@word-hunt/progress-v2', JSON.stringify(saved)],
    ['@word-hunt/dumpling-rewards-v1', '{"ownedDumplingIds":["existing"],"rewards":[]}']]);
  const originalCollection = values.get('@word-hunt/dumpling-rewards-v1');
  const daily = load('game/daily.ts', name => {
    assert.equal(name, '@/data/dailyWords');
    return load('data/dailyWords.ts');
  });
  const storage = load('services/storage.ts', name => {
    if (name === '@/game/daily') return daily;
    assert.equal(name, '@react-native-async-storage/async-storage');
    return { __esModule: true, default: {
      getItem: async key => values.get(key) ?? null,
      setItem: async (key, value) => values.set(key, value),
    } };
  });
  assert.deepEqual(await storage.loadProgress(), saved);
  const providerSource = fs.readFileSync(path.join(root, 'context/GameProvider.tsx'), 'utf8');
  const ast = ts.createSourceFile('provider.tsx', providerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function providerAction(name) {
    let initializer;
    function visit(node) {
      if (ts.isPropertyAssignment(node) && node.name.getText(ast) === name) initializer = node.initializer;
      ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(initializer, `Missing actual provider action: ${name}`);
    const js = ts.transpileModule(`const action = ${initializer.getText(ast)};`, {
      compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText;
    return new Function('queueSave', 'loadProgress', 'saveProgress', 'installProgress', 'playSound', `${js};return action;`)(
      fn => fn(), storage.loadProgress, storage.saveProgress, () => {}, () => {},
    );
  }
  await providerAction('awardCoins')(50);
  await providerAction('completeLevel')(anatomy.id);
  await providerAction('completeLevel')(anatomy.id);
  assert.deepEqual(await storage.loadProgress(), {
    ...saved, coins: 475, completedLevels: [...saved.completedLevels, anatomy.id],
  });
  assert.equal(values.get('@word-hunt/dumpling-rewards-v1'), originalCollection);
});

test('only Anatomy uses the existing expanded target layout; other level dimensions stay unchanged', () => {
  const source = fs.readFileSync(path.join(root, 'app/game.tsx'), 'utf8');
  const ast = ts.createSourceFile('game.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const names = ['expandedWordCount', 'extraWordHeight', 'boardSize'];
  const declarations = [];
  function visit(node) {
    if (ts.isVariableDeclaration(node) && names.includes(node.name.getText(ast))) declarations.push(`const ${node.getText(ast)};`);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.equal(declarations.length, 3);
  const js = ts.transpileModule(declarations.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  function layout(categoryId, onboarding, daily, height = 667) {
    return new Function('categoryId', 'onboarding', 'daily', 'getCategory', 'width', 'height', 'top', 'bottom',
      'GAME_PADDING', 'BOARD_MAX_WIDTH', 'NON_BOARD_HEIGHT', `${js};return {expandedWordCount, extraWordHeight, boardSize};`)(
      categoryId, onboarding, daily, getCategory, 375, height, 24, 20, 16, 380, 350,
    );
  }
  assert.deepEqual(layout(anatomy.id), { expandedWordCount: 16, extraWordHeight: 87, boardSize: 186 });
  assert.match(source, /styles\.words, expandedWordCount > 0 && \{ maxHeight: Math\.ceil\(expandedWordCount \/ 3\) \* 29, overflow: 'visible' \}/);
  for (const category of existing) {
    assert.deepEqual(layout(category.id), { expandedWordCount: 0, extraWordHeight: 0, boardSize: 273 });
  }
  assert.equal(layout(anatomy.id, undefined, {}).expandedWordCount, 0, 'daily puzzles must not use Anatomy layout');
  assert.deepEqual(layout(anatomy.id, { words: ['MAP', 'KEY', 'BAG', 'CUP', 'BED'] }), {
    expandedWordCount: 5, extraWordHeight: 0, boardSize: 225,
  });
});
