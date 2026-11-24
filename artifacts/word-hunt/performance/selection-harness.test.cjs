// Run separately; this validates measurement infrastructure, not gameplay.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { cases, paths, states } = require('./selection-fixtures.cjs');
const { prepare } = require('./selection-bundle.cjs');
test('fixture matrix uses actual reachable grid/mode combinations', () => {
  assert.deepEqual(cases.map(c => c.id), ['8-classic', '10-classic', '10-time', '12-classic', '12-time']);
  assert.deepEqual(states, ['early', 'late', 'late-hint']);
  assert.ok(cases.every(c => c.progress.coins === 1400 && c.progress.completedDailyPuzzles.length === 0));
  for (const size of [8, 10, 12]) {
    const fixtures = paths(size);
    assert.equal(fixtures.length, 4);
    assert.ok(fixtures.some(f => f.points.some(([r, c]) => r >= size || c >= size)));
    assert.ok(fixtures.some(f => f.wait === 0));
  }
});
test('instrumentation fails closed when compiled module anchors change', () => {
  assert.throws(() => prepare('unsupported Metro bundle', true), /Snapshot anchor/);
  assert.throws(() => prepare('const isDaily = Boolean(daily);', false), /Snapshot anchor/);
});
test('application runtime does not import the performance harness', () => {
  const path = require('node:path');
  function visit(dir) {
    for (const file of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, file.name);
      if (file.isDirectory()) visit(full);
      else if (/\.[jt]sx?$/.test(file.name)) {
        assert.doesNotMatch(fs.readFileSync(full, 'utf8'), /__fixture|__measure|selection-browser|selection-bundle/);
      }
    }
  }
  for (const dir of ['app', 'components', 'context', 'game', 'services']) visit(path.join(__dirname, '..', dir));
});
