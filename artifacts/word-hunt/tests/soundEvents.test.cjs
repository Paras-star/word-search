const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const gameSource = fs.readFileSync(path.join(root, 'app/game.tsx'), 'utf8');
const gameAst = ts.createSourceFile('game.tsx', gameSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function callback(name, bindings) {
  let declaration;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(gameAst) === name) declaration = node;
    ts.forEachChild(node, visit);
  }
  visit(gameAst);
  assert.ok(declaration, `Missing screen callback: ${name}`);
  const output = ts.transpileModule(`const ${declaration.getText(gameAst)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText;
  return new Function(...Object.keys(bindings), `${output}; return ${name};`)(...Object.values(bindings));
}

const sameCell = (a, b) => a.row === b.row && a.col === b.col;

test('letter-tap cues only fire for newly added cells, including the first granted cell', () => {
  const sounds = [];
  const ref = { current: [] };
  const grantSelection = callback('grantSelection', {
    selectedCellsRef: ref,
    setSelectedCells: () => {},
    sameCell,
    playSound: sound => sounds.push(sound),
  });

  grantSelection({ row: 0, col: 0 });
  grantSelection({ row: 0, col: 0 });
  assert.deepEqual(sounds, ['drag']);

  const updateSelection = callback('updateSelection', {
    selectedCellsRef: ref,
    puzzle: { size: 6 },
    sameCell,
    lineCells: (_start, end) => Array.from({ length: end.col + 1 }, (_, col) => ({ row: 0, col })),
    nearCurrentLine: () => [],
    setSelectedCells: () => {},
    playSound: sound => sounds.push(sound),
  });
  updateSelection({ row: 0, col: 2 });
  updateSelection({ row: 0, col: 2 });
  assert.deepEqual(sounds, ['drag', 'drag', 'drag']);
  updateSelection({ row: 0, col: 1 }); // Shortening the selection adds no letters.
  updateSelection({ row: 0, col: 2 }); // Only the newly added endpoint is sounded.
  assert.deepEqual(sounds, ['drag', 'drag', 'drag', 'drag']);
});

function release({ word, selection, cancelled = false, bonusSet = new Set() }) {
  const state = { found: [], paths: {}, score: 0, feedback: 'idle', sounds: [], bonuses: [], selected: selection };
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
    BONUS_WORDS: bonusSet,
    bonusWords: [],
    setBonusWords: update => { state.bonuses = update(state.bonuses); },
  })(cancelled);
  return state;
}

test('invalid-selection cue excludes harmless one-cell touches and responder cancellation', () => {
  const oneCell = release({ word: 'A', selection: [{ row: 0, col: 0 }] });
  assert.deepEqual(oneCell.sounds, []);
  assert.equal(oneCell.feedback, 'wrong');

  const cancelledAttempt = release({
    word: 'DOG',
    selection: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }],
    cancelled: true,
  });
  assert.deepEqual(cancelledAttempt.sounds, []);
  assert.equal(cancelledAttempt.feedback, 'wrong');

  const releasedAttempt = release({
    word: 'DOG',
    selection: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }],
  });
  assert.deepEqual(releasedAttempt.sounds, ['wrong']);
  assert.equal(releasedAttempt.feedback, 'wrong');
});

test('normal and bonus discoveries use one distinct cue each', () => {
  const selection = [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }];
  const normalWord = release({ word: 'CAT', selection });
  assert.deepEqual(normalWord.sounds, ['correct']);

  const bonusWord = release({ word: 'DOG', selection, bonusSet: new Set(['DOG']) });
  assert.deepEqual(bonusWord.bonuses, ['DOG']);
  assert.deepEqual(bonusWord.sounds, ['bonus']);
});

test('a consumed hint cues once and a depleted hint does not cue', () => {
  const sounds = [];
  let hints = 1;
  const useHint = callback('useHint', {
    hints,
    foundWords: [],
    puzzle: { words: ['CAT'], placements: { CAT: { cells: [{ row: 0, col: 0 }] } } },
    setHints: update => { hints = update(hints); },
    setHintCells: () => {},
    hintSoundUsesRemaining: { current: 1 },
    hintTimeout: { current: null },
    clearTimeout: () => {},
    setTimeout: () => 1,
    playSound: sound => sounds.push(sound),
  });
  useHint();
  useHint(); // A rapid duplicate from the same render must not sound without another hint.
  assert.equal(hints, 0);
  assert.deepEqual(sounds, ['hint']);

  const depletedHint = callback('useHint', {
    hints,
    foundWords: [],
    puzzle: { words: ['CAT'], placements: { CAT: { cells: [] } } },
    setHints: () => assert.fail('A depleted hint should not be consumed'),
    setHintCells: () => {},
    hintTimeout: { current: null },
    clearTimeout: () => {},
    setTimeout: () => 1,
    playSound: sound => sounds.push(sound),
  });
  depletedHint();
  assert.deepEqual(sounds, ['hint']);
});

test('completion, coin, and dumpling sounds are tied to persisted reward stages', () => {
  assert.match(gameSource, /await completeLevel\(category\.id\);\s*completionStage\.current = 2;\s*if \(!completionSoundPlayed\.current\)/);
  assert.match(gameSource, /onPanResponderTerminate: \(\) => endSelection\(true\)/);

  const providerSource = fs.readFileSync(path.join(root, 'context/GameProvider.tsx'), 'utf8');
  assert.match(providerSource, /await saveProgress\(next\);\s*if \(amount > 0\) playSound\('coins'\)/);
  assert.equal((providerSource.match(/playSound\('coins'\)/g) || []).length, 3);
  assert.match(providerSource, /if \(!next\) \{[\s\S]*?return false;[\s\S]*?\}\s*await saveProgress\(next\);\s*playSound\('coins'\)/);

  const rewardSource = fs.readFileSync(path.join(root, 'app/reward.tsx'), 'utf8');
  assert.match(rewardSource, /mounted\.current = false;\s*stopDumplingSounds\(\)/);
  assert.match(rewardSource, /if \(mounted\.current\) setStage\('revealed'\)/);
  assert.match(rewardSource, /<ChestReveal opening=\{stage !== 'basket'\}/);
  const chestSource = fs.readFileSync(path.join(root, 'components/ChestReveal.tsx'), 'utf8');
  assert.match(chestSource, /const CUE = 'chestOpening'/);
  assert.match(chestSource, /await startSound\(CUE\)/);
  assert.match(chestSource, /playDumplingSound\('rarityReveal', d\.rarity\)/);
  for (const obsolete of ['opening', 'reveal', 'basketAppearance', 'anticipation', 'basketMovement', 'collection']) {
    assert.doesNotMatch(rewardSource + chestSource, new RegExp(`playDumplingSound\\('${obsolete}'`));
  }
  assert.ok(
    chestSource.indexOf('await startSound(CUE)') < chestSource.indexOf('const t0 = Date.now()')
      && /if \(!mounted\.current \|\| completed\.current\) return/.test(chestSource),
    'the exact clip starts before the source frame clock and completion is guarded',
  );
});