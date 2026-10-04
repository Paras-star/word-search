const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function harness({ saved = null, failRead = false, failSave = false } = {}) {
  const data = new Map(saved === null ? [] : [['@word-hunt/audio-settings-v1', saved]]);
  const calls = [], persisted = [], warnings = [];
  const storage = {
    getItem: async key => { if (failRead) throw new Error('Read failure'); return data.get(key) ?? null; },
    setItem: async (key, raw) => {
      if (failSave) throw new Error('Save failure');
      await new Promise(resolve => setImmediate(resolve));
      persisted.push({ key, raw });
      data.set(key, raw);
    },
  };
  function reload() {
    const source = fs.readFileSync(path.join(root, 'services/audioSettings.ts'), 'utf8');
    const js = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const module = { exports: {} };
    new Function('require', 'exports', 'module', 'console', js)(name => {
      if (name === '@react-native-async-storage/async-storage') return { __esModule: true, default: storage };
      if (name === './audio') return {
        setMusicVolume: value => calls.push(['music', value]),
        setSoundEffectsVolume: value => calls.push(['effects', value]),
      };
      throw new Error(`Unexpected import: ${name}`);
    }, module.exports, module, { warn: (...args) => warnings.push(args) });
    return module.exports;
  }
  return { service: reload(), reload, data, calls, persisted, warnings,
    allowSave: () => { failSave = false; } };
}

test('default volumes hydrate once without overwriting game progress or writing preferences', async () => {
  const h = harness();
  const a = h.service.initializeAudioSettings(), b = h.service.initializeAudioSettings();
  assert.equal(a, b);
  await a;
  assert.deepEqual(h.service.getAudioSettings(), {
    musicVolume: 0.5, soundEffectsVolume: 1, hydrated: true, saving: false, error: null,
  });
  assert.deepEqual(h.calls, [['music', 0.5], ['effects', 1]]);
  assert.equal(h.persisted.length, 0);
});

test('slider changes update only the intended live volume and persist both choices after restart', async () => {
  const h = harness();
  h.data.set('@word-hunt/progress-v2', '{"coins":180,"onboardingStep":6}');
  await h.service.initializeAudioSettings();
  h.calls.length = 0;
  h.service.setAudioVolume('musicVolume', 0);
  assert.deepEqual(h.calls, [['music', 0]]);
  h.service.setAudioVolume('soundEffectsVolume', 0.34);
  assert.deepEqual(h.calls, [['music', 0], ['effects', 0.34]]);
  await h.service.flushAudioSettings();
  assert.equal(h.service.getAudioSettings().saving, false);
  assert.equal(h.data.get('@word-hunt/progress-v2'), '{"coins":180,"onboardingStep":6}');
  assert.ok(h.persisted.every(p => p.key === h.service.AUDIO_SETTINGS_KEY));
  const reopened = h.reload();
  await reopened.initializeAudioSettings();
  assert.equal(reopened.getAudioSettings().musicVolume, 0);
  assert.equal(reopened.getAudioSettings().soundEffectsVolume, 0.34);
  assert.deepEqual(h.calls.slice(-2), [['music', 0], ['effects', 0.34]]);
});

test('rapid interleaved slider writes are serialized and retain the latest pair', async () => {
  const h = harness();
  await h.service.initializeAudioSettings();
  for (let i = 0; i <= 20; i++) {
    h.service.setAudioVolume('musicVolume', i / 20);
    h.service.setAudioVolume('soundEffectsVolume', 1 - i / 20);
  }
  assert.equal(h.service.getAudioSettings().musicVolume, 1);
  assert.equal(h.service.getAudioSettings().soundEffectsVolume, 0);
  await h.service.flushAudioSettings();
  assert.deepEqual(JSON.parse(h.data.get(h.service.AUDIO_SETTINGS_KEY)), {
    musicVolume: 1, soundEffectsVolume: 0,
  });
  assert.equal(h.service.getAudioSettings().error, null);
});

test('save failures are visible, never reject gameplay, and can be retried successfully', async () => {
  const h = harness({ failSave: true });
  await h.service.initializeAudioSettings();
  h.service.setAudioVolume('musicVolume', 0.23);
  await assert.doesNotReject(h.service.flushAudioSettings());
  assert.equal(h.service.getAudioSettings().musicVolume, 0.23);
  assert.match(h.service.getAudioSettings().error, /could not be saved/);
  assert.equal(h.service.getAudioSettings().saving, false);
  h.allowSave();
  h.service.retryAudioSettingsSave();
  await h.service.flushAudioSettings();
  assert.equal(h.service.getAudioSettings().error, null);
  assert.equal(JSON.parse(h.data.get(h.service.AUDIO_SETTINGS_KEY)).musicVolume, 0.23);
});

test('corrupt or inaccessible preferences are reported without silently overwriting saved data', async () => {
  for (const options of [
    { saved: 'not json' }, { saved: '{"musicVolume":-1,"soundEffectsVolume":1}' },
    { saved: '{"musicVolume":0.5,"soundEffectsVolume":"0"}' }, { failRead: true },
  ]) {
    const h = harness(options);
    await assert.doesNotReject(h.service.initializeAudioSettings());
    const settings = h.service.getAudioSettings();
    assert.equal(settings.hydrated, true);
    assert.equal(settings.musicVolume, 0.5);
    assert.equal(settings.soundEffectsVolume, 1);
    assert.match(settings.error, /could not be loaded/);
    assert.equal(h.persisted.length, 0);
  }
});

test('invalid changes are ignored until hydration; later changes clamp to the valid range', async () => {
  const h = harness();
  h.service.setAudioVolume('musicVolume', 0);
  assert.equal(h.calls.length, 0);
  await h.service.initializeAudioSettings();
  h.service.setAudioVolume('musicVolume', NaN);
  h.service.setAudioVolume('soundEffectsVolume', Infinity);
  h.service.setAudioVolume('musicVolume', -1);
  h.service.setAudioVolume('soundEffectsVolume', 5);
  await h.service.flushAudioSettings();
  assert.equal(h.service.getAudioSettings().musicVolume, 0);
  assert.equal(h.service.getAudioSettings().soundEffectsVolume, 1);
});

test('subscriptions publish stable snapshots and detach when the UI unmounts', async () => {
  const h = harness();
  await h.service.initializeAudioSettings();
  assert.equal(h.service.getAudioSettings(), h.service.getAudioSettings());
  let changes = 0;
  const stop = h.service.subscribeAudioSettings(() => changes++);
  h.service.setAudioVolume('musicVolume', 0.22);
  await h.service.flushAudioSettings();
  assert.ok(changes >= 2);
  stop();
  const before = changes;
  h.service.setAudioVolume('soundEffectsVolume', 0.1);
  await h.service.flushAudioSettings();
  assert.equal(changes, before);
});

test('actual slider gesture callbacks map measured positions and drags to both endpoints', () => {
  const source = fs.readFileSync(path.join(root, 'components/VolumeSlider.tsx'), 'utf8');
  const ast = ts.createSourceFile('VolumeSlider.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function callback(name, bindings) {
    let node;
    function visit(n) {
      if (ts.isVariableDeclaration(n) && n.name.getText(ast) === name) node = n;
      ts.forEachChild(n, visit);
    }
    visit(ast);
    assert.ok(node, `Missing ${name}`);
    const js = ts.transpileModule(`const ${node.getText(ast)};`, {
      compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText;
    return new Function(...Object.keys(bindings), `${js}; return ${name};`)(...Object.values(bindings));
  }
  const values = [], cb = { current: { onChange: value => values.push(value), disabled: false } };
  const widthRef = { current: 228 }, startX = { current: 0 };
  const setFrom = callback('setFrom', { widthRef, cb, THUMB: 28, clamp: n => Math.max(0, Math.min(1, n)) });
  const pan = callback('pan', { setFrom, cb, startX, useRef: value => ({ current: value }),
    PanResponder: { create: handlers => handlers } });
  pan.onPanResponderGrant({ nativeEvent: { locationX: 114 } });
  pan.onPanResponderMove({}, { dx: -100 });
  pan.onPanResponderMove({}, { dx: 100 });
  assert.deepEqual(values, [0.5, 0, 1]);
  cb.current.disabled = true;
  assert.equal(pan.onStartShouldSetPanResponder(), false);
  setFrom(114);
  assert.equal(values.length, 3);
  assert.match(source, /pointerEvents="none" style=\{\[styles\.thumb/);
  assert.match(source, /height: 48/);
  assert.match(source, /accessibilityRole="adjustable"/);
  assert.match(source, /ArrowRight/);
});

test('Home opens only the settings modal, keeps navigation intact, and close plays no duplicate click', () => {
  const home = fs.readFileSync(path.join(root, 'app/index.tsx'), 'utf8');
  const modal = fs.readFileSync(path.join(root, 'components/AudioSettingsModal.tsx'), 'utf8');
  assert.match(home, /playSound\('tap'\); setSettingsOpen\(true\)/);
  assert.match(home, /testID="settings-button"/);
  assert.match(home, /router\.push\('\/daily'\)/);
  assert.match(home, /router\.push\('\/categories'\)/);
  assert.match(home, /router\.push\('\/collection'\)/);
  assert.match(modal, /onRequestClose=\{onClose\}/);
  assert.match(modal, /SoftButton onPress=\{onClose\} suppressClickSound/);
  assert.match(modal, /setAudioVolume\('musicVolume', v\)/);
  assert.match(modal, /setAudioVolume\('soundEffectsVolume', v\)/);
});