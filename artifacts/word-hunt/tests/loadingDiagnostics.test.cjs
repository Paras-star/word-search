const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function logger({ dev = true, throws = false } = {}) {
  let now = 0;
  const exports = {}, records = [];
  const js = ts.transpileModule(fs.readFileSync(path.join(root, 'services/loadingDiagnostics.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('exports', '__DEV__', 'performance', 'console', js)(
    exports, dev, { now: () => now }, {
      info(prefix, value) {
        if (throws) throw Error('Console unavailable');
        assert.equal(prefix, '[Word Hunt loading]');
        records.push(JSON.parse(value));
      },
    },
  );
  return { ...exports, records, at(value) { now = value; } };
}

test('temporary diagnostics record stage durations and distinguish first/subsequent reward visits', () => {
  const h = logger();
  h.at(100); h.logLoading('puzzle.complete', { categoryId: 'animals', kind: 'category' });
  h.at(140); h.logLoading('puzzle.reward-navigation', { categoryId: 'animals' });
  h.at(180); h.logLoading('reward.mount', { categoryId: 'animals' });
  h.at(200); h.logLoading('chest.closed-display');
  h.at(900); h.logLoading('chest.assets-prepare-complete');
  h.at(950); h.logLoading('chest.renderer-ready');
  h.at(1100); h.logLoading('chest.animation-start');
  const first = h.records.at(-1);
  assert.equal(first.rewardVisit, 1);
  assert.equal(first.sinceCompletionMs, 1000);
  assert.equal(first.sinceRewardMountMs, 920);
  assert.equal(h.records.find(r => r.event === 'chest.closed-display').sinceRewardMountMs, 20);
  h.logLoading('reward.unmount');
  h.at(2000); h.logLoading('puzzle.complete', { categoryId: 'food', kind: 'category' });
  h.at(2050); h.logLoading('reward.mount', { categoryId: 'food' });
  h.at(2060); h.logLoading('chest.assets-cache-hit');
  h.at(2100); h.logLoading('chest.animation-start');
  assert.equal(h.records.at(-1).rewardVisit, 2);
  assert.equal(h.records.at(-1).rewardCategory, 'food');
  assert.equal(h.records.at(-1).sinceCompletionMs, 100);
  assert.equal(h.records.at(-1).sinceRewardMountMs, 50);
  h.logLoading('reward.unmount'); h.logLoading('background.mode-entry');
  assert.equal(h.records.at(-1).rewardActive, false);
});

test('a reward route loaded without its completion never borrows another category completion time', () => {
  const h = logger();
  h.logLoading('puzzle.complete', { categoryId: 'animals', kind: 'category' });
  h.at(100); h.logLoading('reward.mount', { categoryId: 'food' });
  assert.equal(h.records.at(-1).sinceCompletionMs, null);
});

test('prepared references have stable diagnostic IDs without retaining native image ownership', () => {
  const h = logger(), image = {}, other = {};
  assert.equal(h.loadingImageId(null), null);
  assert.equal(h.loadingImageId(image), 1);
  assert.equal(h.loadingImageId(image), 1);
  assert.equal(h.loadingImageId(other), 2);
  const source = fs.readFileSync(path.join(root, 'services/loadingDiagnostics.ts'), 'utf8');
  assert.match(source, /new WeakMap/);
  assert.doesNotMatch(source, /AsyncStorage|setTimeout|requestIdleCallback|loadAsync|fetch\(/);
});

test('diagnostics are disabled outside development and cannot throw into application callbacks', () => {
  const production = logger({ dev: false });
  production.logLoading('puzzle.complete', { categoryId: 'animals', kind: 'category' });
  assert.equal(production.loadingImageId({}), null);
  assert.equal(production.records.length, 0);
  const brokenConsole = logger({ throws: true });
  assert.doesNotThrow(() => brokenConsole.logLoading('reward.mount', { categoryId: 'animals' }));
  assert.equal(brokenConsole.loadingError('Image failed https://example.invalid/asset?query=value\nretry'), 'Image failed [asset] retry');
});

test('all requested observation points are wired without background display gating or new preparation scheduling', () => {
  for (const [file, events] of [
    ['app/results.tsx', ['background.onboarding-continue']],
    ['app/mode.tsx', ['background.mode-entry']],
    ['app/game.tsx', ['background.game-entry', 'background.source-commit', 'background.reference-received',
      'background.display', 'background.display-error', 'puzzle.complete', 'puzzle.reward-navigation']],
    ['app/reward.tsx', ['reward.mount', 'reward.data-ready', 'chest.open-request']],
    ['services/animalBackgroundPreparation.ts', ['background.prepare-start', 'background.prepare-complete', 'background.prepare-error']],
    ['services/chestPreparation.ts', ['chest.assets-prepare-start', 'chest.assets-prepare-complete']],
    ['components/ChestReveal.native.tsx', ['chest.closed-display', 'chest.renderer-ready', 'chest.animation-start']],
  ]) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const event of events) assert.ok(source.includes(`'${event}'`), `${file}: ${event}`);
  }
  const game = fs.readFileSync(path.join(root, 'app/game.tsx'), 'utf8');
  assert.match(game, /source=\{animalBackground \?\? ANIMALS_BACKGROUND_SOURCE\}/);
  assert.match(game, /usesCategoryBackground = rawOnboardingStep === undefined && rawDailyDate === undefined/);
  const native = fs.readFileSync(path.join(root, 'components/ChestReveal.native.tsx'), 'utf8');
  assert.match(native, /return afterChestDisplay\(prepare\)/);
  assert.match(native, /duration: CHEST_DURATION_MS/);
});
