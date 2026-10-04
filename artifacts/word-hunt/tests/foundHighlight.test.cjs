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

const highlightModule = { exports: {} };
const highlightSource = fs.readFileSync(path.join(root, 'game/foundHighlights.ts'), 'utf8');
const highlightCode = ts.transpileModule(highlightSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
new Function('exports', 'require', 'module', highlightCode)(highlightModule.exports, require, highlightModule);
const { FOUND_WORD_COLORS, buildFoundHighlights } = highlightModule.exports;
const colors = { primary: '#175C6C', accent: '#FFF0D0', card: '#FFFEFA' };
const cell = { row: 0, col: 0 };

function style({ found = false, selected = false, hint = false, index = 0 } = {}) {
  return callback('getCellStyle', {
    cellKey: ({ row, col }) => `${row}-${col}`,
    foundCellColors: new Map(found ? [['0-0', FOUND_WORD_COLORS[index % FOUND_WORD_COLORS.length]]] : []),
    selectedKeys: new Set(selected ? ['0-0'] : []),
    hintKeys: new Set(hint ? ['0-0'] : []),
    colors,
  })(cell);
}

test('found cells use each requested pastel for both fill and border, distinct from normal and active cells', () => {
  assert.deepEqual(FOUND_WORD_COLORS, [
    '#F8D7B5', '#F2B8D0', '#B8C9EE', '#D5E7B8',
    '#B8DDD8', '#D2C4EE', '#B9E0D0', '#F3DFB0',
  ]);
  FOUND_WORD_COLORS.forEach((color, index) => {
    assert.deepEqual(style({ found: true, index }), { backgroundColor: color, borderColor: color });
    assert.notEqual(color, style().backgroundColor);
    assert.notEqual(color, style({ selected: true }).backgroundColor);
  });
});

test('active selection and hint precedence remain unchanged on found cells', () => {
  assert.deepEqual(style({ found: true, selected: true }), {
    backgroundColor: colors.primary, borderColor: colors.primary, borderRadius: 4,
  });
  assert.deepEqual(style({ found: true, hint: true }), { backgroundColor: colors.accent });
  assert.deepEqual(style(), { backgroundColor: colors.card });
});

function pathsFor(words) {
  return Object.fromEntries(words.map((word, index) => [word, [
    { row: index * 3, col: 0 }, { row: index * 3, col: 1 }, { row: index * 3, col: 2 },
  ]]));
}

test('every cell receives its word color and the palette cycles deterministically after eight discoveries', () => {
  const words = Array.from({ length: 20 }, (_, index) => `WORD${index}`);
  const paths = pathsFor(words);
  const highlights = buildFoundHighlights(words, paths);
  words.forEach((word, index) => {
    const expected = FOUND_WORD_COLORS[index % FOUND_WORD_COLORS.length];
    assert.equal(highlights.wordColors.get(word), expected);
    paths[word].forEach(({ row, col }) => assert.equal(highlights.cellColors.get(`${row}-${col}`), expected));
  });
  assert.equal(highlights.cellColors.size, 60);
  assert.deepEqual(buildFoundHighlights(words, paths), highlights);
});

test('colors remain stable after rerenders, path-record reordering, and further discoveries', () => {
  const words = ['CAT', 'DOG', 'OWL'];
  const paths = pathsFor([...words, 'FOX']);
  const initial = buildFoundHighlights(words, paths);
  assert.deepEqual(buildFoundHighlights(words, { OWL: paths.OWL, CAT: paths.CAT, DOG: paths.DOG }), initial);
  assert.deepEqual(buildFoundHighlights(words, paths), initial);
  const later = buildFoundHighlights([...words, 'FOX'], paths);
  initial.wordColors.forEach((color, word) => assert.equal(later.wordColors.get(word), color));
  initial.cellColors.forEach((color, key) => assert.equal(later.cellColors.get(key), color));
});

test('palette reuse avoids matching neighboring found paths when another color is available', () => {
  const words = Array.from({ length: 9 }, (_, index) => `WORD${index}`);
  const paths = pathsFor(words);
  paths.WORD8 = [{ row: 1, col: 0 }, { row: 1, col: 1 }, { row: 1, col: 2 }];
  const highlights = buildFoundHighlights(words, paths);
  assert.notEqual(highlights.wordColors.get('WORD8'), highlights.wordColors.get('WORD0'));
  assert.equal(highlights.wordColors.get('WORD8'), FOUND_WORD_COLORS[1]);
  assert.deepEqual(buildFoundHighlights(words, paths), highlights);
});

test('all eight occupied neighboring colors fall back deterministically without losing any highlight', () => {
  const neighbors = [
    { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 },
    { row: 1, col: 0 }, { row: 1, col: 2 },
    { row: 2, col: 0 }, { row: 2, col: 1 }, { row: 2, col: 2 },
  ];
  const words = neighbors.map((_, index) => `WORD${index}`);
  const paths = Object.fromEntries(words.map((word, index) => [word, [neighbors[index]]]));
  paths.CENTER = [{ row: 1, col: 1 }];
  const highlights = buildFoundHighlights([...words, 'CENTER'], paths);
  assert.equal(highlights.wordColors.get('CENTER'), FOUND_WORD_COLORS[0]);
  assert.equal(highlights.cellColors.size, 9);
});

test('intersections retain the first word color while every later path cell stays highlighted', () => {
  const paths = {
    CAT: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }],
    DOG: [{ row: 0, col: 1 }, { row: 1, col: 1 }, { row: 2, col: 1 }],
  };
  const highlights = buildFoundHighlights(['CAT', 'DOG'], paths);
  assert.equal(highlights.cellColors.get('0-1'), highlights.wordColors.get('CAT'));
  assert.equal(highlights.cellColors.get('1-1'), highlights.wordColors.get('DOG'));
  assert.equal(highlights.cellColors.get('2-1'), highlights.wordColors.get('DOG'));
  assert.notEqual(highlights.wordColors.get('CAT'), highlights.wordColors.get('DOG'));
  assert.equal(highlights.cellColors.size, 5);
});

test('the screen uses discovery-ordered highlights, without altering word-list or letter styling', () => {
  const words = ['CAT', 'DOG'];
  const paths = pathsFor(words);
  const actual = callback('foundCellColors', {
    useMemo: build => build(),
    buildFoundHighlights,
    foundWords: words,
    foundPaths: paths,
  });
  assert.deepEqual(actual, buildFoundHighlights(words, paths).cellColors);
  assert.match(source, /name=\{foundWords\.includes\(word\) \? 'check' : 'circle'\}/);
  assert.match(source, /color=\{foundWords\.includes\(word\) \? colors\.success : colors\.border\}/);
  assert.match(source, /textDecorationLine: foundWords\.includes\(word\) \? 'line-through' : 'none'/);
  assert.match(source, /color: selectedKeys\.has\(`\$\{rowIndex\}-\$\{colIndex\}`\) \? '#FFFFFF' : colors\.foreground/);
});

test('all pastel fills keep strong contrast against the unchanged dark letter color', () => {
  function luminance(hex) {
    const channels = hex.slice(1).match(/../g).map(part => parseInt(part, 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  }
  const paletteSource = fs.readFileSync(path.join(root, 'constants/homePalette.ts'), 'utf8');
  const palette = { exports: {} };
  const compiled = ts.transpileModule(paletteSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  new Function('exports', compiled)(palette.exports);
  const ink = luminance(palette.exports.homeColors.ink);
  FOUND_WORD_COLORS.forEach(color => assert.ok((luminance(color) + 0.05) / (ink + 0.05) >= 4.5));
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