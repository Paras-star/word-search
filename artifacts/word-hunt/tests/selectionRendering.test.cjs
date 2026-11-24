const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../app/game.tsx'), 'utf8');
const ast = ts.createSourceFile('game.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const expected = require('./fixtures/selection-logic-hashes.json');
const printer = ts.createPrinter();
const declarations = new Map();
const actual = { effects: [] };
const hash = node => crypto.createHash('sha256')
  .update(printer.printNode(ts.EmitHint.Unspecified, node, ast)).digest('hex');
function visit(node) {
  if (ts.isVariableDeclaration(node)) {
    const name = node.name.getText(ast);
    declarations.set(name, node);
    if (name in expected) {
      let value = node.initializer;
      // Only these wrappers were authorized; their actual callback bodies must
      // remain identical to the pre-experiment source.
      if (['refreshGridBounds', 'watchHintAd'].includes(name) && ts.isCallExpression(value)) {
        assert.equal(value.expression.getText(ast), 'useCallback');
        value = value.arguments[0];
      }
      actual[name] = hash(value);
    }
  }
  if (ts.isFunctionDeclaration(node) && node.name?.text in expected) actual[node.name.text] = hash(node);
  if (ts.isIfStatement(node) && node.expression.getText(ast).startsWith('activePuzzle.current?.categoryId')) {
    actual.puzzleInstallation = hash(node);
  }
  if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) &&
    ['useEffect', 'useFocusEffect'].includes(node.expression.expression.getText(ast))) actual.effects.push(hash(node));
  ts.forEachChild(node, visit);
}
visit(ast);

test('render isolation preserves the original input, geometry, generation, rules, timer and audio logic', () => {
  assert.deepEqual(actual, expected);
});

const React = { createElement(type, props, ...children) { return { type, props: { ...props, children } }; } };
const styles = new Proxy({}, { get: (_, key) => key });
const colors = { primary: 'selected', accent: 'hint', card: 'card', border: 'border', foreground: 'ink' };
const bindings = {
  React, memo: fn => ({ type: fn }), useMemo: fn => fn(),
  View: 'View', Text: 'Text', Platform: { OS: 'web' }, styles,
  useColors: () => colors, cellKey: ({ row, col }) => `${row}-${col}`,
};
function load(name, extras = {}) {
  const js = ts.transpileModule(`const ${declarations.get(name).getText(ast)};`, {
    compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const deps = { ...bindings, ...extras };
  return new Function(...Object.keys(deps), `${js};return ${name};`)(...Object.values(deps));
}
const GridCell = load('GridCell');
const PuzzleGrid = load('PuzzleGrid', { GridCell });
function render(size, extras = {}) {
  const gridContentRef = { current: null }, onLayout = () => {}, onMove = () => {};
  const props = {
    puzzle: { grid: Array.from({ length: size }, () => Array(size).fill('A')) },
    selectedCells: [], hintCells: [], foundCellColors: new Map(),
    gridContentRef, onLayout, panHandlers: { onResponderMove: onMove }, ...extras,
  };
  const tree = PuzzleGrid.type(props);
  return { props, tree, cells: tree.props.children[0].flatMap(row => row.props.children[0]) };
}
for (const size of [8, 10, 12]) {
  test(`${size}-grid keeps explicit rows, measured view and every responder prop`, () => {
    const { tree, props, cells } = render(size);
    assert.equal(tree.type, 'View');
    assert.equal(tree.props.ref, props.gridContentRef);
    assert.equal(tree.props.onLayout, props.onLayout);
    assert.equal(tree.props.onResponderMove, props.panHandlers.onResponderMove);
    assert.equal(tree.props.children[0].length, size);
    assert.equal(cells.length, size * size);
    for (const cell of cells) {
      assert.equal(cell.type, GridCell);
      assert.ok(Object.values(cell.props).filter(v => typeof v === 'object').every(v => Array.isArray(v)));
    }
  });
  test(`${size}-grid changes primitive props only for affected selection cells`, () => {
    const normal = render(size);
    const changed = render(size, { selectedCells: [{ row: 0, col: 0 }, { row: 0, col: 1 }] });
    assert.equal(changed.cells[0].props.backgroundColor, colors.primary);
    assert.equal(changed.cells[0].props.borderRadius, 4);
    assert.equal(changed.cells[0].props.color, '#FFFFFF');
    for (let i = 2; i < size * size; i++) assert.deepEqual(changed.cells[i].props, normal.cells[i].props);
    const cleared = render(size);
    assert.deepEqual(cleared.cells.map(c => c.props), normal.cells.map(c => c.props));
  });
}

test('selection, hints and found fills keep their original priority and restore on clearing', () => {
  const foundCellColors = new Map([['0-0', 'pastel']]);
  const cell = extras => render(8, { foundCellColors, ...extras }).cells[0].props;
  assert.equal(cell({}).backgroundColor, 'pastel');
  assert.equal(cell({ hintCells: [{ row: 0, col: 0 }] }).backgroundColor, 'hint');
  assert.equal(cell({ hintCells: [{ row: 0, col: 0 }] }).borderColor, 'border');
  assert.equal(cell({ hintCells: [{ row: 0, col: 0 }], selectedCells: [{ row: 0, col: 0 }] }).backgroundColor, 'selected');
  assert.equal(cell({}).borderColor, 'pastel');
  const tree = GridCell.type(cell({}));
  assert.equal(tree.props.children[0].props.children[0], 'A');
});
