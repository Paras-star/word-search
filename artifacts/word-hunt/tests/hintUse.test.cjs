const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'app/game.tsx'), 'utf8');
const ast = ts.createSourceFile('game.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function callback(name, bindings) {
  let declaration;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) declaration = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(declaration, `Missing actual screen handler ${name}`);
  const js = ts.transpileModule(`const ${declaration.getText(ast)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return new Function(...Object.keys(bindings), `${js};return ${name};`)(...Object.values(bindings));
}
const benefits = {};
new Function('exports', ts.transpileModule(fs.readFileSync(path.join(root, 'services/rewardedBenefits.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText)(benefits);

function harness(startingHints = 3) {
  const cells = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }];
  const state = { hints: startingHints, highlight: [], sounds: [], timers: [], earned: null, requests: 0 };
  const bindings = {
    puzzle: { id: 'puzzle', grid: [['C', 'A', 'T']], words: ['CAT'], placements: { CAT: { cells } } },
    foundRef: { current: [] },
    hintTimeout: { current: null },
    adPaused: { current: false },
    completionStarted: { current: false },
    activePuzzleKey: { current: 'puzzle' },
    setHints: update => { state.hints = update(state.hints); },
    setHintCells: value => { state.highlight = value; },
    playSound: sound => state.sounds.push(sound),
    setTimeout(fn, delay) { const timer = { fn, delay }; state.timers.push(timer); return timer; },
    createHintReward: benefits.createHintReward,
    foundWords: [],
    hintAd: {
      loading: false,
      watch(earned) { state.earned = earned; state.requests++; return Promise.resolve('closed'); },
    },
    startTime: { current: Date.now() },
  };
  return {
    state, bindings, cells,
    use() { return callback('useHint', { ...bindings, hints: state.hints }); },
    watch() { return callback('watchHintAd', bindings)(); },
    expire() { state.timers.at(-1).fn(); },
  };
}

test('a hint consumes exactly one balance unit, highlights a valid unfound word, and expires after 1500ms', () => {
  const h = harness();
  h.use()();
  assert.equal(h.state.hints, 2);
  assert.deepEqual(h.state.highlight, h.cells);
  assert.deepEqual(h.state.sounds, ['hint']);
  assert.equal(h.state.timers[0].delay, 1500);
  h.expire();
  assert.deepEqual(h.state.highlight, []);
  assert.equal(h.bindings.hintTimeout.current, null);
  h.use()();
  assert.equal(h.state.hints, 1);
});

test('rapid duplicate taps from the same render cannot consume twice or replay the hint sound', () => {
  const h = harness(1);
  const tap = h.use();
  tap(); tap(); tap();
  assert.equal(h.state.hints, 0);
  assert.equal(h.state.timers.length, 1);
  assert.deepEqual(h.state.sounds, ['hint']);
  h.expire();
  h.use()();
  assert.equal(h.state.hints, 0);
  assert.equal(h.state.timers.length, 1);
});

for (const reason of ['empty', 'found', 'missing-placement', 'bad-placement', 'wrong-letters', 'ad', 'complete', 'blurred']) {
  test(`no hint is consumed when no valid action is available: ${reason}`, () => {
    const h = harness(reason === 'empty' ? 0 : 3);
    if (reason === 'found') h.bindings.foundRef.current = ['CAT'];
    if (reason === 'missing-placement') h.bindings.puzzle.placements = {};
    if (reason === 'bad-placement') h.bindings.puzzle.placements.CAT.cells = [{ row: 8, col: 1 }];
    if (reason === 'wrong-letters') h.bindings.puzzle.grid = [['D', 'O', 'G']];
    if (reason === 'ad') h.bindings.adPaused.current = true;
    if (reason === 'complete') h.bindings.completionStarted.current = true;
    if (reason === 'blurred') h.bindings.activePuzzleKey.current = null;
    h.use()();
    assert.equal(h.state.hints, reason === 'empty' ? 0 : 3);
    assert.deepEqual(h.state.highlight, []);
    assert.deepEqual(h.state.sounds, []);
    assert.equal(h.state.timers.length, 0);
  });
}

test('an already found word is excluded even when stale rendered state still lists it as unfound', () => {
  const h = harness();
  h.bindings.puzzle.words = ['DOG', 'CAT'];
  h.bindings.puzzle.placements.DOG = { cells: h.cells };
  h.bindings.foundRef.current = ['DOG'];
  h.use()();
  assert.equal(h.state.hints, 2);
  assert.deepEqual(h.state.highlight, h.cells);
});

test('rewarded additions and manual use operate on the same balance, without automatic highlights or duplicate grants', async () => {
  for (const starting of [0, 3]) {
    const h = harness(starting);
    h.watch();
    await Promise.resolve();
    assert.equal(h.state.hints, starting, 'opening or closing an ad cannot grant a hint');
    assert.deepEqual(h.state.highlight, []);
    assert.equal(h.state.earned(), true);
    assert.equal(h.state.earned(), false);
    assert.equal(h.state.hints, starting + 3);
    assert.deepEqual(h.state.highlight, []);
    h.use()();
    assert.equal(h.state.hints, starting + 2);
    h.expire();
    h.watch();
    await Promise.resolve();
    h.state.earned();
    assert.equal(h.state.hints, starting + 5);
    assert.deepEqual(h.state.highlight, []);
    h.use()();
    assert.equal(h.state.hints, starting + 4);
  }
});
