const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app/game.tsx'), 'utf8');
const ast = ts.createSourceFile('game.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function declaration(name, kind = 'variable') {
  let found;
  function visit(node) {
    if (kind === 'function' && ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    if (kind === 'variable' && ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found, `Missing ${kind} ${name}`);
  return found;
}

function loadFunction(name, bindings, kind = 'variable') {
  const node = declaration(name, kind);
  const code = ts.transpileModule(`${kind === 'function' ? node.getText(ast) : `const ${node.getText(ast)};`}; return ${name};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return new Function(...Object.keys(bindings), code)(...Object.values(bindings));
}

function loadPuzzle() {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, 'game/puzzle.ts'), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function('require', 'module', 'exports', code)(() => { throw Error('Unexpected import'); }, module, module.exports);
  return module.exports;
}

const puzzle = loadPuzzle();
const sameCell = (a, b) => a.row === b.row && a.col === b.col;
function selectionHarness(start, grid, words) {
  const state = { selected: [start], found: [], paths: {}, score: 0, feedback: 'idle' };
  const selectedCellsRef = { current: [start] };
  const update = loadFunction('updateSelection', {
    selectedCellsRef, puzzle: { size: grid.length }, sameCell, lineCells: puzzle.lineCells,
    nearCurrentLine: loadFunction('nearCurrentLine', { lineCells: puzzle.lineCells }, 'function'),
    setSelectedCells: cells => { state.selected = cells; },
    playSound: () => {},
  });
  const end = loadFunction('endSelection', {
    selectedCellsRef, completionStarted: { current: false },
    setSelectedCells: cells => { state.selected = cells; },
    lettersFor: puzzle.lettersFor,
    puzzle: { grid, words },
    foundRef: { current: state.found },
    setFoundWords: update => { state.found = update(state.found); },
    setFoundPaths: update => { state.paths = update(state.paths); },
    setScore: update => { state.score = update(state.score); },
    scoreFoundWord: score => score + 10,
    playSound: () => {},
    setFeedback: value => { state.feedback = value; },
    BONUS_WORDS: new Set(),
    bonusWords: [],
    setBonusWords: () => assert.fail('unexpected bonus word'),
  });
  return { state, selectedCellsRef, update, end };
}

function blankGrid(size = 6) { return Array.from({ length: size }, () => Array(size).fill('X')); }

test('first off-axis diagonal movement snaps only to its nearest one-cell diagonal path', () => {
  const h = selectionHarness({ row: 1, col: 1 }, blankGrid(), []);
  h.update({ row: 2, col: 3 });
  assert.deepEqual(h.selectedCellsRef.current, [{ row: 1, col: 1 }, { row: 2, col: 2 }]);
  h.update({ row: 3, col: 4 });
  assert.deepEqual(h.selectedCellsRef.current, [
    { row: 1, col: 1 }, { row: 2, col: 2 }, { row: 3, col: 3 },
  ]);
});

test('exact horizontal, vertical and diagonal paths preserve their mapped cells', () => {
  for (const [start, end, expected] of [
    [{ row: 1, col: 1 }, { row: 1, col: 4 }, [[1, 1], [1, 2], [1, 3], [1, 4]]],
    [{ row: 1, col: 1 }, { row: 4, col: 1 }, [[1, 1], [2, 1], [3, 1], [4, 1]]],
    [{ row: 1, col: 1 }, { row: 4, col: 4 }, [[1, 1], [2, 2], [3, 3], [4, 4]]],
  ]) {
    const h = selectionHarness(start, blankGrid(), []);
    h.update(end);
    assert.deepEqual(h.selectedCellsRef.current.map(({ row, col }) => [row, col]), expected);
  }
});

test('large off-axis and non-linear paths remain rejected and cannot complete a word', () => {
  const grid = blankGrid();
  grid[1][1] = 'C';
  grid[2][2] = 'A';
  grid[3][3] = 'T';
  const h = selectionHarness({ row: 1, col: 1 }, grid, ['CAT']);
  h.update({ row: 3, col: 5 });
  assert.deepEqual(h.selectedCellsRef.current, [{ row: 1, col: 1 }]);
  h.update({ row: 4, col: 2 });
  assert.deepEqual(h.selectedCellsRef.current, [{ row: 1, col: 1 }]);
  h.end();
  assert.deepEqual(h.state.found, []);
  assert.equal(h.state.score, 0);
});

test('a slightly off-axis diagonal drag completes only the exact letters on its snapped path', () => {
  const grid = blankGrid();
  grid[1][1] = 'C';
  grid[2][2] = 'A';
  grid[3][3] = 'T';
  const h = selectionHarness({ row: 1, col: 1 }, grid, ['CAT']);
  h.update({ row: 2, col: 3 });
  h.update({ row: 3, col: 4 });
  assert.equal(puzzle.lettersFor(grid, h.selectedCellsRef.current), 'CAT');
  h.end();
  assert.deepEqual(h.state.found, ['CAT']);
  assert.deepEqual(h.state.paths.CAT, [
    { row: 1, col: 1 }, { row: 2, col: 2 }, { row: 3, col: 3 },
  ]);
  assert.equal(h.state.score, 10);
});

test('web mouse and touch page coordinates and native viewport coordinates map to the same cell', () => {
  const bounds = { x: 20, y: 100, width: 400, height: 400 };
  const event = { nativeEvent: { pageX: 240, pageY: 620 } };
  for (const inputType of ['mouse', 'touch']) {
    const webCell = loadFunction('cellFromEvent', {
      gridBoundsRef: { current: bounds },
      puzzle: { size: 10 },
      Platform: { OS: 'web' },
      window: { scrollX: 0, scrollY: 260 },
      gridCellFromPoint: puzzle.gridCellFromPoint,
    });
    assert.deepEqual(webCell(event), { row: 6, col: 5 }, `${inputType} event after page scroll`);
  }
  const nativeCell = loadFunction('cellFromEvent', {
    gridBoundsRef: { current: bounds },
    puzzle: { size: 10 },
    Platform: { OS: 'android' },
    window: { scrollX: 0, scrollY: 260 },
    gridCellFromPoint: puzzle.gridCellFromPoint,
  });
  assert.deepEqual(nativeCell({ nativeEvent: { pageX: 240, pageY: 360 } }), { row: 6, col: 5 });
});
