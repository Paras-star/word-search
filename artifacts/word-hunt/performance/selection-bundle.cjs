const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
function replaceOnce(source, from, to) {
  assert.equal(source.split(from).length, 2, `Snapshot anchor must occur once: ${from.slice(0, 90)}`);
  return source.replace(from, to);
}

// Never write transformed code into app/, components/, or a Metro source file.
// Both arms get identical state-setup/readback hooks. Only the instrumented arm
// gets function-entry counters, body timing and a React commit hook.
function prepare(bundle, instrumented) {
  let code = bundle;
  const anchor = '    const isDaily = Boolean(daily);';
  code = replaceOnce(code, anchor, `
    window.__fixture = {
      read: () => ({
        puzzle, selectedCells: selectedCellsRef.current, hintCells, foundWords, foundPaths,
        foundColors: [...foundCellColors], timeLeft, hints, score,
        bounds: gridBoundsRef.current,
      }),
      setup: (late, seconds) => {
        if (hintTimeout.current) clearTimeout(hintTimeout.current);
        hintTimeout.current = null;
        const words = late ? puzzle.words.slice(0, -1) : [];
        setFoundWords(words);
        setFoundPaths(Object.fromEntries(words.map(word => [word, puzzle.placements[word].cells])));
        setSelectedCells([]); selectedCellsRef.current = [];
        setHintCells([]); setHints(3); setScore(0);
        setFeedback('idle'); setTimeLeft(seconds);
      },
      hint: useHint,
    };
    ${instrumented ? 'window.__measure.paths.push({t: performance.now(), selected: selectedCells, hint: hintCells, timeLeft});' : ''}
${anchor}`);
  if (instrumented) {
    for (const name of ['GridCell', 'PuzzleGrid', 'WordTargets', 'Header', 'CoinPill', 'RewardedAdButton']) {
      code = replaceOnce(code, `function ${name}(t0) {`,
        `function ${name}(t0) { window.__measure.count('${name}');`);
    }
    code = replaceOnce(code, '  function GameSession({\n    params\n  }) {',
      `  function GameSession({\n    params\n  }) {
      window.__measure.count('GameSession');
      const __bodyStart = performance.now(); try {`);
    code = replaceOnce(code, '  }\n  _s4(GameSession,',
      `    } finally { window.__measure.bodies.push({t: performance.now(), ms: performance.now() - __bodyStart}); }
  }
  _s4(GameSession,`);
  }
  return code;
}
module.exports = { hash, prepare };
