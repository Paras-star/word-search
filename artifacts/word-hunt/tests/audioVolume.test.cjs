const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const tick = () => new Promise(resolve => setImmediate(resolve));
const musicFile = 'luceris-relaxing-590397.mp3';
const events = ['drag', 'correct', 'bonus', 'wrong', 'hint', 'tap', 'coins', 'complete',
  'opening', 'reveal', 'chestOpening', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

function harness({ os = 'android', loaded = true, rejectPlay = false, missingNative = false } = {}) {
  const players = [], warnings = [], modes = [], windowListeners = new Map(), documentListeners = new Map();
  let reject = rejectPlay;
  const document = { visibilityState: 'visible',
    addEventListener: (name, fn) => documentListeners.set(name, fn),
    removeEventListener: name => documentListeners.delete(name) };
  const window = { addEventListener: (name, fn) => windowListeners.set(name, fn),
    removeEventListener: name => windowListeners.delete(name) };
  function create(source) {
    const listeners = new Set();
    const player = { source, isLoaded: loaded, readyState: loaded ? 2 : 0, currentTime: 0,
      volume: 1, loop: false, starts: 0, pauses: 0, seeks: 0, removed: false, playing: false,
      seekTo: async () => { player.seeks++; player.currentTime = 0; },
      play: () => {
        player.starts++;
        if (reject) { reject = false; return Promise.reject(new Error('Autoplay blocked')); }
        player.playing = true;
        return Promise.resolve();
      },
      pause: () => { player.pauses++; player.playing = false; },
      remove: () => { player.removed = true; player.playing = false; },
      addListener: (_, fn) => { listeners.add(fn); return { remove: () => listeners.delete(fn) }; },
      addEventListener: (_, fn) => listeners.add(fn),
      removeEventListener: (_, fn) => listeners.delete(fn),
      removeAttribute: () => { player.removed = true; },
      load: () => {},
      ready: () => {
        player.isLoaded = true; player.readyState = 2;
        for (const fn of [...listeners]) fn({ isLoaded: true });
      },
      listeners,
    };
    players.push(player);
    return player;
  }
  const source = fs.readFileSync(path.join(root, 'services/audio.ts'), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  const req = name => {
    if (name === 'react-native') return { Platform: { OS: os } };
    if (name === 'expo-asset') return { Asset: { fromModule: value => ({ uri: value }) } };
    if (name === 'expo-audio') {
      if (missingNative) throw new Error('Native module missing');
      return { createAudioPlayer: create, setAudioModeAsync: async mode => { modes.push(mode); } };
    }
    if (name.endsWith('.mp3') || name.endsWith('.m4a') || name.endsWith('.wav')) return path.basename(name);
    throw new Error(`Unexpected import: ${name}`);
  };
  function Audio(uri) { return create(uri); }
  new Function('require', 'exports', 'module', 'Audio', 'window', 'document', 'console', js)(
    req, module.exports, module, Audio, window, document, { warn: (...args) => warnings.push(args) },
  );
  return { service: module.exports, players, warnings, modes, windowListeners, documentListeners, document };
}

test('bundled music is the exact unmodified uploaded MP3', () => {
  const bytes = fs.readFileSync(path.join(root, 'assets/sounds', musicFile));
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),
    'fdd9ef9a33e44ecc74c4e97975317bfdf4b2ed495479fddbd1368bebb8e1038a');
});

test('one looping music player survives repeated starts/navigation without seeking or restarting', async () => {
  const h = harness();
  h.service.initializeAudio();
  const first = h.service.startBackgroundMusic();
  assert.equal(h.service.startBackgroundMusic(), first);
  await first;
  const music = h.players.find(p => p.source === musicFile);
  assert.equal(music.volume, 0.5);
  assert.equal(music.loop, true);
  music.currentTime = 74;
  for (let i = 0; i < 8; i++) {
    h.service.initializeAudio();
    await h.service.startBackgroundMusic();
  }
  assert.equal(h.players.length, 17);
  assert.equal(music.starts, 1);
  assert.equal(music.currentTime, 74);
  assert.equal(music.seeks, 0);
  assert.equal(h.modes[0].shouldPlayInBackground, false);
  h.service.disposeAudio();
  assert.ok(h.players.every(p => p.removed));
});

test('the 15 original effects and extracted chest cue receive live volume changes independently of music', async () => {
  const h = harness();
  h.service.initializeAudio();
  await h.service.startBackgroundMusic();
  const music = h.players.find(p => p.source === musicFile);
  const effects = h.players.filter(p => p.source !== musicFile);
  h.service.setSoundEffectsVolume(0.23);
  assert.equal(effects.length, 16);
  assert.ok(effects.every(p => p.volume === 0.23));
  assert.equal(music.volume, 0.5);
  h.service.setMusicVolume(0.67);
  assert.equal(music.volume, 0.67);
  assert.ok(effects.every(p => p.volume === 0.23));
  for (const event of events) await h.service.startSound(event);
  assert.ok(effects.every(p => p.starts === 1 && p.volume === 0.23));
  const starts = h.players.map(p => p.starts), seeks = h.players.map(p => p.seeks);
  h.service.setMusicVolume(0);
  h.service.setSoundEffectsVolume(0);
  assert.ok(h.players.every(p => p.volume === 0));
  assert.deepEqual(h.players.map(p => p.starts), starts);
  assert.deepEqual(h.players.map(p => p.seeks), seeks);
  assert.equal(music.playing, true); // Silent playback preserves the timeline on unmute.
  h.service.disposeAudio();
});

test('saved volumes also apply to players created lazily or after disposal', async () => {
  const h = harness();
  h.service.setSoundEffectsVolume(0);
  h.service.setMusicVolume(0.12);
  await h.service.startSound('hint');
  await h.service.startBackgroundMusic();
  assert.equal(h.players[0].volume, 0);
  assert.equal(h.players[1].volume, 0.12);
  h.service.disposeAudio();
  h.service.initializeAudio();
  await h.service.startBackgroundMusic();
  assert.ok(h.players.filter(p => !p.removed && p.source !== musicFile).every(p => p.volume === 0));
  assert.equal(h.players.at(-1).volume, 0.12);
  assert.equal(h.players.filter(p => !p.removed && p.source === musicFile).length, 1);
  h.service.disposeAudio();
});

test('background pauses music and effects; foreground resumes only music at its existing position', async () => {
  const h = harness();
  h.service.initializeAudio();
  await h.service.startBackgroundMusic();
  await h.service.startSound('correct');
  const music = h.players.find(p => p.source === musicFile);
  music.currentTime = 55;
  h.service.setAudioForeground(false);
  assert.ok(h.players.every(p => !p.playing));
  await h.service.startBackgroundMusic();
  assert.equal(music.starts, 1);
  h.service.setAudioForeground(true);
  await tick();
  assert.equal(music.starts, 2);
  assert.equal(music.currentTime, 55);
  assert.equal(music.seeks, 0);
  assert.ok(h.players.filter(p => p.source !== musicFile).every(p => !p.playing));
  h.service.disposeAudio();
});

test('background/unmount cancels music loading and prevents a late start', async () => {
  for (const dispose of [false, true]) {
    const h = harness({ loaded: false });
    const pending = h.service.startBackgroundMusic();
    const music = h.players[0];
    assert.equal(music.listeners.size, 1);
    if (dispose) h.service.disposeAudio();
    else h.service.setAudioForeground(false);
    music.ready();
    await pending;
    assert.equal(music.starts, 0);
    assert.equal(music.listeners.size, 0);
    if (!dispose) {
      h.service.setAudioForeground(true);
      await tick();
      assert.equal(music.starts, 1);
      h.service.disposeAudio();
    }
  }
});

test('stopping dumpling/effect cues never interrupts the independent music player', async () => {
  const h = harness();
  await h.service.startBackgroundMusic();
  const music = h.players[0];
  h.service.stopSounds(['opening', 'reveal', 'Rare']);
  h.service.stopSounds();
  assert.equal(music.playing, true);
  assert.equal(music.pauses, 0);
  h.service.disposeAudio();
});

test('web player uses live independent volumes and retries blocked autoplay after a user gesture', async () => {
  const h = harness({ os: 'web', rejectPlay: true });
  h.service.initializeAudio();
  await h.service.startBackgroundMusic();
  const music = h.players.find(p => p.source === musicFile);
  assert.equal(music.playing, false);
  assert.equal(h.warnings.length, 1);
  h.windowListeners.get('pointerdown')();
  await tick();
  assert.equal(music.playing, true);
  assert.equal(music.loop, true);
  h.service.setMusicVolume(0);
  h.service.setSoundEffectsVolume(0.4);
  assert.equal(music.volume, 0);
  assert.ok(h.players.filter(p => p !== music).every(p => p.volume === 0.4));
  h.document.visibilityState = 'hidden';
  h.documentListeners.get('visibilitychange')();
  assert.equal(music.playing, false);
  h.service.setAudioForeground(true); // A stale app-state event cannot override hidden visibility.
  await tick();
  assert.equal(music.playing, false);
  h.document.visibilityState = 'visible';
  h.documentListeners.get('visibilitychange')();
  await tick();
  assert.equal(music.playing, true);
  h.service.disposeAudio();
  assert.equal(h.windowListeners.size, 0);
  assert.equal(h.documentListeners.size, 0);
  assert.ok(h.players.every(p => p.removed));
});

test('native music failures resolve safely without blocking existing sound/gameplay calls', async () => {
  const h = harness({ missingNative: true });
  await assert.doesNotReject(h.service.startBackgroundMusic());
  await assert.doesNotReject(h.service.startSound('correct'));
  h.service.setMusicVolume(0);
  h.service.setSoundEffectsVolume(0);
  h.service.disposeAudio();
  const playing = harness({ rejectPlay: true });
  await assert.doesNotReject(playing.service.startBackgroundMusic());
  await assert.doesNotReject(playing.service.startSound('correct'));
  assert.equal(playing.players.find(p => p.source === 'word-found.mp3').starts, 1);
  playing.service.disposeAudio();
});

test('invalid volumes cannot corrupt either player category', async () => {
  const h = harness();
  assert.throws(() => h.service.setMusicVolume(NaN), /finite/);
  assert.throws(() => h.service.setSoundEffectsVolume(Infinity), /finite/);
  h.service.setMusicVolume(4);
  h.service.setSoundEffectsVolume(-3);
  await h.service.startBackgroundMusic();
  await h.service.startSound('tap');
  assert.equal(h.players[0].volume, 1);
  assert.equal(h.players[1].volume, 0);
  h.service.disposeAudio();
});

test('root owns music lifetime, not screen navigation or individual rewards', () => {
  const layout = fs.readFileSync(path.join(root, 'app/_layout.tsx'), 'utf8');
  assert.match(layout, /initializeAudioSettings\(\)\.then/);
  assert.match(layout, /if \(!mounted\) return/);
  assert.match(layout, /void startBackgroundMusic\(\)/);
  assert.match(layout, /setAudioForeground\(state === 'active'\)/);
  assert.match(layout, /disposeAudio\(\)/);
  for (const file of ['categories', 'game', 'results', 'reward', 'collection']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, `app/${file}.tsx`), 'utf8'),
      /startBackgroundMusic|disposeAudio|initializeAudio\(/);
  }
});