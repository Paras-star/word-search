const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app/game.tsx'), 'utf8');
const ast = ts.createSourceFile('game.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

// Exercise the screen's actual callbacks without mounting React Native.
function callback(name, bindings) {
  let declaration;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) declaration = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(declaration, `Missing screen callback: ${name}`);
  const output = ts.transpileModule(`const ${declaration.getText(ast)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return new Function(...Object.keys(bindings), `${output}; return ${name};`)(...Object.values(bindings));
}

const homeColors = { goldSoft: '#FFF0D0', gold: '#B77024' };
const colors = { primary: '#175C6C', accent: '#FFF0D0', card: '#FFFEFA' };
const cell = { row: 0, col: 0 };

function style({ found = false, selected = false, hint = false, index = 0 } = {}) {
  return callback('getCellStyle', {
    cellKey: ({ row, col }) => `${row}-${col}`,
    foundCellColors: new Map(found ? [['0-0', index]] : []),
    selectedKeys: new Set(selected ? ['0-0'] : []),
    hintKeys: new Set(hint ? ['0-0'] : []),
    colors,
    homeColors,
  })(cell);
}

test('found cells have a consistent gold fill and border, distinct from ordinary and active cells', () => {
  assert.deepEqual(style({ found: true }), { backgroundColor: homeColors.goldSoft, borderColor: homeColors.gold });
  assert.deepEqual(style({ found: true, index: 12 }), style({ found: true }));
  assert.notEqual(style({ found: true }).backgroundColor, style().backgroundColor);
  assert.notEqual(style({ found: true }).backgroundColor, style({ selected: true }).backgroundColor);
});

test('active selection and hint precedence remain unchanged on found cells', () => {
  assert.deepEqual(style({ found: true, selected: true }), {
    backgroundColor: colors.primary, borderColor: colors.primary, borderRadius: 4,
  });
  assert.deepEqual(style({ found: true, hint: true }), { backgroundColor: colors.accent });
  assert.deepEqual(style(), { backgroundColor: colors.card });
});

function release(word, alreadyFound = []) {
  const state = { found: [...alreadyFound], paths: {}, score: 0, feedback: 'idle', sounds: [], selected: [cell] };
  const selection = [cell, { row: 0, col: 1 }, { row: 0, col: 2 }];
  const ref = { current: selection };
  callback('endSelection', {
    selectedCellsRef: ref,
    setSelectedCells: value => { state.selected = value; },
    completionStarted: { current: false },
    lettersFor: () => word,
    puzzle: { grid: [], words: ['CAT'] },
    foundRef: { current: state.found },
    setFoundWords: update => { state.found = update(state.found); },
    setFoundPaths: update => { state.paths = update(state.paths); },
    setScore: update => { state.score = update(state.score); },
    scoreFoundWord: (score, target) => score + (target ? 10 : 5),
    playSound: sound => state.sounds.push(sound),
    setFeedback: value => { state.feedback = value; },
    BONUS_WORDS: new Set(),
    bonusWords: [],
    setBonusWords: () => assert.fail('Unexpected bonus word'),
  })();
  assert.deepEqual(ref.current, []);
  assert.deepEqual(state.selected, []);
  return { state, selection };
}

test('forward and reverse target selections still record paths and score once', () => {
  for (const word of ['CAT', 'TAC']) {
    const { state, selection } = release(word);
    assert.deepEqual(state.found, ['CAT']);
    assert.deepEqual(state.paths.CAT, word === 'CAT' ? selection : [...selection].reverse());
    assert.equal(state.score, 10);
    assert.deepEqual(state.sounds, ['correct']);
  }
});

test('duplicate and invalid selections do not become new found highlights or earn points', () => {
  for (const [word, found] of [['CAT', ['CAT']], ['DOG', []]]) {
    const { state } = release(word, found);
    assert.deepEqual(state.found, found);
    assert.deepEqual(state.paths, {});
    assert.equal(state.score, 0);
    assert.equal(state.feedback, 'wrong');
  }
});