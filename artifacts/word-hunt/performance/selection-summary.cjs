const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { cases, states } = require('./selection-fixtures.cjs');
const { hash } = require('./selection-bundle.cjs');
const dir = path.resolve(process.argv[2]);
const report = JSON.parse(fs.readFileSync(path.join(dir, 'results.json')));
assert.ok(report.completedAt, 'A failed or interrupted run must not produce accepted evidence');
assert.equal(report.runs.length, cases.length * 2, 'Partial measurements are not evidence');
const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return +sorted[Math.ceil(sorted.length * p) - 1].toFixed(2);
};
const distribution = values => ({ n: values.length, p50: percentile(values, .5), p95: percentile(values, .95), max: percentile(values, 1) });
const countDiff = (start, end) => Object.fromEntries(
  ['GameSession', 'PuzzleGrid', 'GridCell', 'WordTargets', 'Header', 'CoinPill', 'RewardedAdButton']
    .map(name => [name, (end[name] || 0) - (start[name] || 0)]));
function summarize(run, windows) {
  const inside = entries => entries.filter(e => windows.some(w => e.t >= w.start && e.t <= w.end));
  const frames = inside(run.metrics.frames), tasks = inside(run.metrics.tasks), events = inside(run.metrics.events);
  return {
    bodies: distribution(inside(run.metrics.bodies).map(e => e.ms)),
    subtreeRender: distribution(inside(run.metrics.commits).map(e => e.ms)),
    frames: { ...distribution(frames.map(e => e.ms)), gaps: frames.filter(e => e.ms > 25).length },
    longTasks: distribution(tasks.map(e => e.ms)),
    events: Object.fromEntries(['touchstart', 'touchmove', 'touchend'].map(type => [type, events.filter(e => e.type === type).length])),
    inputAge: distribution(events.filter(e => e.type === 'touchmove').map(e => e.age)),
  };
}
const summary = { source: report.manifest.sourceHash, bundle: report.manifest.id, browser: report.browser, rows: [], countdowns: [] };
for (const fixture of cases) {
  const measured = report.runs.find(r => r.id === fixture.id && r.instrumented);
  const control = report.runs.find(r => r.id === fixture.id && !r.instrumented);
  assert.ok(measured && control);
  assert.deepEqual(measured.puzzle, control.puzzle);
  for (const run of [measured, control]) {
    assert.deepEqual(run.saved, fixture.progress);
    assert.deepEqual(run.errors, []);
    assert.deepEqual(run.metrics.writes, []);
  }
  for (const state of states) {
    const a = measured.states.find(s => s.state === state), b = control.states.find(s => s.state === state);
    assert.equal(a.observations.length, 8);
    assert.equal(b.observations.length, 8);
    assert.deepEqual(a.baseline.puzzle, b.baseline.puzzle);
    assert.deepEqual(a.baseline.foundWords, b.baseline.foundWords);
    const counts = countDiff({}, {});
    for (let i = 0; i < 8; i++) {
      const x = a.observations[i], y = b.observations[i];
      assert.equal(x.gesture, y.gesture);
      assert.equal(x.repetition, y.repetition);
      assert.deepEqual(x.checkpoints, y.checkpoints, `${fixture.id}/${state}/${x.gesture}: control selection mismatch`);
      // Same path must be delivered regardless of early/late presentation state.
      assert.deepEqual(x.checkpoints, measured.states[0].observations[i].checkpoints);
      const diff = countDiff(x.before.counts, x.after.counts);
      for (const name of Object.keys(counts)) counts[name] += diff[name];
      assert.deepEqual(x.before.state.hintCells, y.before.state.hintCells);
      assert.deepEqual(x.after.state.foundColors, y.after.state.foundColors);
    }
    const windows = data => data.observations.map(o => ({ start: o.before.t, end: o.after.t }));
    const instrumentedSummary = summarize(measured, windows(a)), controlSummary = summarize(control, windows(b));
    assert.deepEqual(instrumentedSummary.events, controlSummary.events, `${fixture.id}/${state}: delivered event mismatch`);
    assert.ok(instrumentedSummary.subtreeRender.n > 0, 'Commit hook did not observe GameSession');
    assert.ok(counts.GridCell > 0, 'Function-entry probes did not run');
    if (state !== 'late-hint') {
      // Four paths twice: each selects and restores exactly N cells, including
      // the diagonal's reverse traversal. Found fills must not expand this work.
      assert.ok(counts.GridCell <= fixture.size * 16, 'Selection rebuilt unaffected cells');
    } else {
      const hintedCells = a.observations[0].before.state.hintCells.length;
      assert.ok(counts.GridCell <= fixture.size * 16 + 8 * hintedCells, 'Hints rebuilt unaffected cells');
    }
    for (const name of ['WordTargets', 'Header', 'CoinPill', 'RewardedAdButton']) assert.equal(counts[name], 0, `Unchanged ${name} unexpectedly rendered`);
    summary.rows.push({
      id: fixture.id, state, puzzleHash: hash(JSON.stringify(measured.puzzle)),
      foundWords: a.baseline.foundWords.length, totalWords: measured.puzzle.words.length,
      foundCells: a.baseline.foundColors.length, totalCells: fixture.size ** 2,
      counts, instrumented: instrumentedSummary, control: controlSummary,
      // Hint windows deliberately include 1.5-second expiry tails. Do not compare
      // their frame denominators or total render counts with shorter early windows.
      windowMs: a.observations.reduce((sum, o) => sum + o.after.t - o.before.t, 0),
    });
  }
  if (fixture.mode === 'time') {
    for (const run of [measured, control]) {
      assert.deepEqual(run.countdown.ticks.map(t => t.state.timeLeft), Array.from({ length: 30 }, (_, i) => 30 - i));
      assert.ok(run.countdown.ticks.every(t => t.state.foundWords.length === run.puzzle.words.length - 1));
      assert.deepEqual(run.countdown.swipes.map(s => s.remaining), [28, 22, 16, 10]);
    }
    assert.deepEqual(measured.countdown.swipes.map(s => s.checkpoints), control.countdown.swipes.map(s => s.checkpoints));
    const counts = countDiff(measured.countdown.start.counts, measured.countdown.end.counts);
    for (const name of ['WordTargets', 'Header', 'CoinPill', 'RewardedAdButton']) assert.equal(counts[name], 0);
    const idleTicks = [];
    for (const remaining of [24, 20, 14, 8, 6, 4, 2]) {
      const first = measured.countdown.ticks.find(t => t.state.timeLeft === remaining);
      const next = measured.countdown.ticks.find(t => t.state.timeLeft === remaining - 1);
      const diff = countDiff(first.counts, next.counts);
      assert.equal(diff.PuzzleGrid, 0, `Idle timer tick rebuilt grid at ${remaining}`);
      assert.equal(diff.GridCell, 0, `Idle timer tick rebuilt cells at ${remaining}`);
      idleTicks.push({ from: remaining, to: remaining - 1, counts: diff });
    }
    summary.countdowns.push({
      id: fixture.id, counts, idleTicks,
      instrumented: summarize(measured, [{ start: measured.countdown.start.t, end: measured.countdown.end.t }]),
      control: summarize(control, [{ start: control.countdown.start.t, end: control.countdown.end.t }]),
      durationMs: measured.countdown.end.t - measured.countdown.start.t,
    });
  }
}
fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
console.log('Matched puzzles, paths, hints, found fills, delivered events and unchanged synthetic storage.');
console.log('Case / state | found cells | body p50/p95 | subtree p50/p95 | game/grid/cell entries | instrumented gaps/intervals | control gaps/intervals');
for (const r of summary.rows) {
  const a = r.instrumented, b = r.control;
  console.log(`${r.id}/${r.state} | ${r.foundCells}/${r.totalCells} | ${a.bodies.p50}/${a.bodies.p95} | ${a.subtreeRender.p50}/${a.subtreeRender.p95} | ${r.counts.GameSession}/${r.counts.PuzzleGrid}/${r.counts.GridCell} | ${a.frames.gaps}/${a.frames.n} | ${b.frames.gaps}/${b.frames.n}`);
}
console.log('Final countdown:', JSON.stringify(summary.countdowns, null, 2));
