const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
function load(file, requireMock, extras = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', ...Object.keys(extras), js)(
    requireMock, module, module.exports, ...Object.values(extras),
  );
  return module.exports;
}

function harness({ os = 'android', missingNative = false, failCreate = false, loaded = true, failSeek = false, failPlay = false } = {}) {
  const created = [], played = [], warnings = [], modes = [];
  function create(source) {
    if (failCreate) throw new Error('Failed to create player');
    const listeners = new Set();
    const player = {
      source, isLoaded: loaded, pauses: 0, removed: false,
      seekTo: async (seconds) => {
        assert.equal(seconds, 0);
        if (failSeek) throw new Error('Seek failure');
      },
      play: () => {
        if (failPlay) throw new Error('Playback failure');
        played.push(source);
      },
      pause: () => { player.pauses += 1; },
      remove: () => { player.removed = true; },
      addListener: (event, callback) => {
        assert.equal(event, 'playbackStatusUpdate');
        listeners.add(callback);
        return { remove: () => listeners.delete(callback) };
      },
      ready: () => {
        player.isLoaded = true;
        for (const callback of [...listeners]) callback({ isLoaded: true });
      },
      listeners,
    };
    created.push(player);
    return player;
  }
  const service = load('services/audio.ts', (name) => {
    if (name === 'react-native') return { Platform: { OS: os } };
    if (name === 'expo-asset') return { Asset: { fromModule: source => ({ uri: source }) } };
    if (name === 'expo-audio') {
      if (missingNative) throw new Error('Native module unavailable');
      return {
        createAudioPlayer: create,
        setAudioModeAsync: async mode => { modes.push(mode); },
      };
    }
    if (name.endsWith('.mp3') || name.endsWith('.m4a') || name.endsWith('.wav')) {
      assert.ok(fs.existsSync(path.resolve(root, 'services', name)), `Missing bundled asset: ${name}`);
      return path.basename(name);
    }
    throw new Error(`Unexpected require: ${name}`);
  }, { console: { warn: (...args) => warnings.push(args) } });
  return { service, created, played, warnings, modes };
}

test('all 15 original effects plus extracted chest audio are bundled and cached', async () => {
  const h = harness();
  h.service.initializeAudio();
  h.service.initializeAudio();
  assert.equal(h.created.length, 16);
  assert.equal(h.created.filter(player => player.source.endsWith('.mp3')).length, 15);
  assert.equal(new Set(h.created.map(player => player.source)).size, 16);
  assert.equal(h.modes.length, 1);
  assert.equal(h.modes[0].interruptionMode, 'mixWithOthers');
  await h.service.startSound('correct');
  await h.service.startSound('correct');
  assert.deepEqual(h.played, ['word-found.mp3', 'word-found.mp3']);
  assert.equal(h.created.length, 16);
  h.service.disposeAudio();
  assert.ok(h.created.every(player => player.removed));
});

test('Android chest is preloaded and rewound before interaction; fast start is synchronous without a seek or new player', async () => {
  const h = harness({ os: 'android' });
  h.service.initializeAudio();
  const chest = h.created.find(p => p.source === 'chest-opening.m4a');
  const originalSeek = chest.seekTo;
  let seeks = 0;
  chest.seekTo = seconds => { seeks++; return originalSeek(seconds); };
  const first = h.service.prepareChestAudio();
  assert.equal(h.service.prepareChestAudio(), first, 'concurrent preparation shares one operation');
  await first;
  assert.equal(seeks, 1);
  const count = h.created.length;
  h.service.playPreparedChestSound();
  assert.deepEqual(h.played, ['chest-opening.m4a'], 'play is invoked in the caller stack, not a promise queue');
  assert.equal(seeks, 1);
  assert.equal(h.created.length, count);
  h.service.stopSounds(['chestOpening']);
  h.service.playPreparedChestSound();
  assert.equal(h.played.length, 1, 'cancelled readiness cannot be reused');
  await h.service.prepareChestAudio();
  assert.equal(seeks, 2);
  h.service.playPreparedChestSound();
  assert.equal(h.played.length, 2);
  assert.equal(h.created.length, count, 're-entry reuses the one cached player');
  h.service.disposeAudio();
  assert.ok(h.created.every(p => p.removed));
});

test('prepared chest cannot play before its native seek completes', async () => {
  const h = harness({ os: 'android' });
  h.service.initializeAudio();
  const chest = h.created.find(p => p.source === 'chest-opening.m4a');
  let seekFinished;
  chest.seekTo = () => new Promise(resolve => { seekFinished = resolve; });
  const preparing = h.service.prepareChestAudio();
  await Promise.resolve();
  h.service.playPreparedChestSound();
  assert.equal(h.played.length, 0);
  seekFinished();
  await preparing;
  h.service.playPreparedChestSound();
  assert.equal(h.played.length, 1);
  h.service.disposeAudio();
});

test('distinct accepted letters each start a cue through one cached player, including synchronous additions', async () => {
  const h = harness();
  const first = h.service.startSound('drag');
  const second = h.service.startSound('drag');
  assert.notEqual(first, second);
  await Promise.all([first, second]);
  assert.deepEqual(h.played, ['letter-tap.mp3', 'letter-tap.mp3']);
  assert.equal(h.created.length, 1);
  await h.service.startSound('drag');
  assert.equal(h.played.length, 3);
  h.service.disposeAudio();
});

test('actual selection callbacks reject duplicate cells but preserve every newly added letter cue', async () => {
  const h = harness();
  const source = fs.readFileSync(path.join(root, 'app/game.tsx'), 'utf8');
  const ast = ts.createSourceFile('game.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function callback(name, bindings) {
    let declaration;
    function visit(node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) declaration = node;
      ts.forEachChild(node, visit);
    }
    visit(ast);
    assert.ok(declaration);
    const js = ts.transpileModule(`const ${declaration.getText(ast)};`, {
      compilerOptions: { target: ts.ScriptTarget.ES2020 },
    }).outputText;
    return new Function(...Object.keys(bindings), `${js}; return ${name};`)(...Object.values(bindings));
  }
  const ref = { current: [] };
  const bindings = {
    selectedCellsRef: ref,
    sameCell: (a, b) => a.row === b.row && a.col === b.col,
    setSelectedCells: () => {},
    playSound: h.service.playSound,
    puzzle: { size: 6 },
    lineCells: (_start, end) => Array.from({ length: end.col + 1 }, (_, col) => ({ row: 0, col })),
    nearCurrentLine: () => [],
  };
  const grant = callback('grantSelection', bindings);
  const update = callback('updateSelection', bindings);
  grant({ row: 0, col: 0 });
  grant({ row: 0, col: 0 }); // Duplicate notification adds no sound.
  update({ row: 0, col: 2 }); // Adds two distinct letters synchronously.
  update({ row: 0, col: 2 }); // Repeated endpoint adds no sound.
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.played, ['letter-tap.mp3', 'letter-tap.mp3', 'letter-tap.mp3']);
  assert.equal(h.created.length, 1);
  h.service.disposeAudio();
});

test('normal, bonus, invalid, hint, button, coin and completion events map to distinct final files', async () => {
  const h = harness();
  for (const event of ['correct', 'bonus', 'wrong', 'hint', 'tap', 'coins', 'complete']) {
    await h.service.startSound(event);
  }
  assert.deepEqual(h.played, [
    'word-found.mp3', 'bonus-word.mp3', 'invalid-selection.mp3', 'hint-used.mp3',
    'button-click.mp3', 'coin-reward.mp3', 'level-complete.mp3',
  ]);
  await h.service.startSound('countdown');
  await h.service.startSound('gameOver');
  assert.equal(h.played.length, 7);
  h.service.disposeAudio();
});

test('missing native module, player creation, seek and playback failures never reject gameplay calls', async () => {
  for (const options of [{ missingNative: true }, { failCreate: true }, { failSeek: true }, { failPlay: true }]) {
    const h = harness(options);
    assert.doesNotThrow(() => h.service.playSound('tap'));
    await assert.doesNotReject(h.service.startSound('tap'));
    assert.equal(h.played.length, 0);
    assert.ok(h.warnings.length > 0);
    h.service.disposeAudio();
  }
});

test('loading waits for readiness and unsubscribes; cancellation prevents late playback', async () => {
  const h = harness({ loaded: false });
  const started = h.service.startSound('reveal');
  await Promise.resolve();
  assert.equal(h.created[0].listeners.size, 1);
  assert.equal(h.played.length, 0);
  h.created[0].ready();
  await started;
  assert.equal(h.created[0].listeners.size, 0);
  assert.deepEqual(h.played, ['dumpling-reveal.mp3']);

  const cancelled = h.service.startSound('Rare');
  await Promise.resolve();
  const rarity = h.created[1];
  h.service.stopSounds(['Rare']);
  rarity.ready();
  await cancelled;
  assert.equal(rarity.listeners.size, 0);
  assert.deepEqual(h.played, ['dumpling-reveal.mp3']);
  h.service.disposeAudio();
});

test('app disposal cancels pending loading and releases all cached players', async () => {
  const h = harness({ loaded: false });
  h.service.initializeAudio();
  const pending = h.service.startSound('opening');
  h.service.disposeAudio();
  await pending;
  assert.equal(h.played.length, 0);
  assert.ok(h.created.every(player => player.removed && player.listeners.size === 0));
  await h.service.startSound('tap');
  assert.equal(h.created.length, 16);
});

test('dumpling cue starts preserve opening -> reveal -> exactly one actual rarity', async () => {
  for (const rarity of ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary']) {
    const h = harness();
    const dumpling = load('services/dumplingAudio.ts', name => {
      assert.equal(name, './audio');
      return h.service;
    });
    const requests = [
      dumpling.playDumplingSound('opening'),
      dumpling.playDumplingSound('reveal'),
      dumpling.playDumplingSound('rarityReveal', rarity),
    ];
    await Promise.all(requests);
    assert.deepEqual(h.played, [
      'dumpling-opening.mp3', 'dumpling-reveal.mp3', `${rarity.toLowerCase()}-rarity.mp3`,
    ]);
    await dumpling.playDumplingSound('rarityReveal');
    assert.equal(h.played.length, 3);
    dumpling.stopDumplingSounds();
    h.service.disposeAudio();
  }
});

test('leaving the reward screen cancels queued reveal/rarity cues', async () => {
  const h = harness({ loaded: false });
  const dumpling = load('services/dumplingAudio.ts', () => h.service);
  const pending = [
    dumpling.playDumplingSound('opening'),
    dumpling.playDumplingSound('reveal'),
    dumpling.playDumplingSound('rarityReveal', 'Legendary'),
  ];
  await Promise.resolve();
  await Promise.resolve(); // Opening is now waiting for its asset to load.
  dumpling.stopDumplingSounds();
  await Promise.all(pending);
  assert.equal(h.played.length, 0);
  h.service.disposeAudio();
});

test('backgrounding cancels pending and queued cues without replaying them on foreground', async () => {
  const h = harness({ loaded: false });
  const dumpling = load('services/dumplingAudio.ts', () => h.service);
  const pending = [
    dumpling.playDumplingSound('opening'),
    dumpling.playDumplingSound('reveal'),
    dumpling.playDumplingSound('rarityReveal', 'Legendary'),
  ];
  await Promise.resolve();
  await Promise.resolve();
  h.service.setAudioForeground(false);
  dumpling.stopDumplingSounds();
  await h.service.startSound('coins');
  h.service.setAudioForeground(true);
  for (const player of h.created) player.ready();
  await Promise.all(pending);
  assert.deepEqual(h.played, []);
  const buttonStarted = h.service.startSound('tap');
  await Promise.resolve();
  const button = h.created.find(player => player.source === 'button-click.mp3');
  button.ready();
  await buttonStarted;
  assert.deepEqual(h.played, ['button-click.mp3']);
  assert.equal(button.listeners.size, 0);
  h.service.disposeAudio();
});

test('browser autoplay rejection is handled and a server render without Audio stays safe', async () => {
  const warnings = [];
  let webPlayer;
  class BrowserAudio {
    constructor() { this.readyState = 4; webPlayer = this; }
    play() { return Promise.reject(new Error('Autoplay denied')); }
    pause() {}
    removeAttribute() {}
    load() {}
  }
  const requireWeb = name => {
    if (name === 'react-native') return { Platform: { OS: 'web' } };
    if (name === 'expo-asset') return { Asset: { fromModule: source => ({ uri: source }) } };
    if (name.endsWith('.mp3') || name.endsWith('.m4a') || name.endsWith('.wav')) return path.basename(name);
    throw new Error('Native audio must not be imported on web');
  };
  const web = load('services/audio.ts', requireWeb, {
    Audio: BrowserAudio, console: { warn: (...args) => warnings.push(args) },
  });
  await assert.doesNotReject(web.startSound('tap'));
  assert.equal(webPlayer.currentTime, 0);
  assert.equal(warnings.length, 1);
  web.disposeAudio();
  const server = load('services/audio.ts', requireWeb, { Audio: undefined });
  assert.doesNotThrow(() => server.initializeAudio());
  await assert.doesNotReject(server.startSound('tap'));
  server.disposeAudio();
});