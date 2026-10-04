import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import type { AudioPlayer } from 'expo-audio';

// Static requires let Metro bundle the original MP3s for offline mobile use.
const sources = {
  drag: require('../assets/sounds/letter-tap.mp3'),
  correct: require('../assets/sounds/word-found.mp3'),
  bonus: require('../assets/sounds/bonus-word.mp3'),
  wrong: require('../assets/sounds/invalid-selection.mp3'),
  hint: require('../assets/sounds/hint-used.mp3'),
  tap: require('../assets/sounds/button-click.mp3'),
  coins: require('../assets/sounds/coin-reward.mp3'),
  complete: require('../assets/sounds/level-complete.mp3'),
  opening: require('../assets/sounds/dumpling-opening.mp3'),
  reveal: require('../assets/sounds/dumpling-reveal.mp3'),
  chestOpening: Platform.OS === 'web'
    ? require('../assets/chest-animation/chest-opening.wav')
    : require('../assets/chest-animation/chest-opening.m4a'),
  Common: require('../assets/sounds/common-rarity.mp3'),
  Uncommon: require('../assets/sounds/uncommon-rarity.mp3'),
  Rare: require('../assets/sounds/rare-rarity.mp3'),
  Epic: require('../assets/sounds/epic-rarity.mp3'),
  Legendary: require('../assets/sounds/legendary-rarity.mp3'),
} as const;

export type SoundEvent = keyof typeof sources | 'countdown' | 'gameOver';
type Player = Pick<AudioPlayer, 'isLoaded' | 'seekTo' | 'pause' | 'remove'> & {
  volume: number;
  loop: boolean;
  play: () => void | Promise<void>;
  onLoaded: (callback: () => void) => { remove: () => void };
};
type Entry = {
  player: Player;
  version: number;
  pending: Promise<void> | null;
  cancelLoading?: () => void;
};

const players = new Map<keyof typeof sources, Entry | null>();
const musicSource = require('../assets/sounds/luceris-relaxing-590397.mp3');
let musicEntry: Entry | null = null;
let musicWanted = false;
let musicPlaying = false;
let musicVolume = 0.5;
let soundEffectsVolume = 1;
let removeWebListeners: (() => void) | undefined;
const warned = new Set<string>();
let nativeAudio: typeof import('expo-audio') | null | undefined;
let disposed = false;
let foreground = true;
const OPERATION_TIMEOUT = 2000;

function warnOnce(event: string, error: unknown): void {
  if (warned.has(event)) return;
  warned.add(event);
  console.warn(`[Word Hunt audio] ${event} unavailable; gameplay continues.`, error);
}

function getNativeAudio() {
  if (nativeAudio !== undefined) return nativeAudio;
  try {
    // Optional at runtime: an older native client must not crash on import.
    nativeAudio = require('expo-audio') as typeof import('expo-audio');
    void nativeAudio.setAudioModeAsync({
      interruptionMode: 'mixWithOthers',
      playsInSilentMode: true,
      shouldPlayInBackground: false,
    }).catch((error: unknown) => warnOnce('audio mode', error));
  } catch (error) {
    nativeAudio = null;
    warnOnce('native module', error);
  }
  return nativeAudio;
}

function createPlayer(source: number): Player | null {
  if (Platform.OS === 'web') {
    if (typeof Audio === 'undefined') return null;
    // expo-audio's web player discards HTMLMediaElement.play()'s promise.
    // Keep browser autoplay failures handled, using the same bundled assets.
    const media = new Audio(Asset.fromModule(source).uri);
    media.preload = 'auto';
    return {
      get isLoaded() { return media.readyState >= 2; },
      get volume() { return media.volume; },
      set volume(value) { media.volume = value; },
      get loop() { return media.loop; },
      set loop(value) { media.loop = value; },
      seekTo: async (seconds) => { media.currentTime = seconds; },
      play: () => media.play(),
      pause: () => media.pause(),
      remove: () => {
        media.pause();
        media.removeAttribute('src');
        media.load();
      },
      onLoaded: (callback) => {
        media.addEventListener('loadeddata', callback);
        return { remove: () => media.removeEventListener('loadeddata', callback) };
      },
    };
  }
  const audio = getNativeAudio();
  if (!audio) return null;
  const player = audio.createAudioPlayer(source, { updateInterval: 100 });
  return {
    get isLoaded() { return player.isLoaded; },
    get volume() { return player.volume; },
    set volume(value) { player.volume = value; },
    get loop() { return player.loop; },
    set loop(value) { player.loop = value; },
    seekTo: (seconds) => player.seekTo(seconds),
    play: () => player.play(),
    pause: () => player.pause(),
    remove: () => player.remove(),
    onLoaded: (callback) => player.addListener('playbackStatusUpdate', (status) => {
      if (status.isLoaded) callback();
    }),
  };
}

function getEntry(event: SoundEvent): Entry | null {
  // No final files were supplied for these legacy, previously silent cues.
  if (disposed || !foreground || event === 'countdown' || event === 'gameOver') return null;
  if (players.has(event)) return players.get(event) ?? null;
  let entry: Entry | null = null;
  try {
    const player = createPlayer(sources[event]);
    if (player) {
      entry = { player, version: 0, pending: null };
      applyVolume(player, soundEffectsVolume, event);
    }
  } catch (error) {
    warnOnce(event, error);
  }
  players.set(event, entry);
  return entry;
}

function ready(entry: Entry, timeout = OPERATION_TIMEOUT): Promise<void> {
  if (entry.player.isLoaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let subscription: { remove: () => void } | undefined;
    const finish = (error?: Error) => {
      clearTimeout(timer);
      subscription?.remove();
      entry.cancelLoading = undefined;
      if (error) reject(error);
      else resolve();
    };
    const timer = setTimeout(() => finish(new Error('Sound loading timed out')), timeout);
    entry.cancelLoading = () => finish();
    try {
      subscription = entry.player.onLoaded(() => finish());
      if (entry.player.isLoaded) finish();
    } catch (error) {
      finish(error instanceof Error ? error : new Error('Sound loading failed'));
    }
  });
}

async function bounded(operation: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Sound playback timed out')), OPERATION_TIMEOUT);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Resolves after playback starts, never after the full clip finishes. */
export function startSound(event: SoundEvent): Promise<void> {
  const entry = getEntry(event);
  if (!entry) return Promise.resolve();
  // Selection handlers already reject duplicate cells. Preserve every distinct
  // accepted cue, reusing one player and ordering starts, not clip completion.
  const version = entry.version;
  const pending = (entry.pending ?? Promise.resolve()).then(async () => {
    try {
      if (disposed || !foreground || version !== entry.version) return;
      await ready(entry);
      if (disposed || !foreground || version !== entry.version) return;
      entry.player.pause();
      await bounded(entry.player.seekTo(0));
      if (disposed || !foreground || version !== entry.version) return;
      await bounded(Promise.resolve(entry.player.play()));
    } catch (error) {
      warnOnce(event, error);
    }
  });
  entry.pending = pending;
  void pending.then(() => {
    if (entry.pending === pending) entry.pending = null;
  });
  return pending;
}

/** Fire-and-forget: loading/playback never blocks a gameplay handler. */
export function playSound(event: SoundEvent): void {
  void startSound(event);
}

// BEGIN prepared chest audio
// Dedicated fast path; the 15 existing cue players/queues are unchanged.
let preparedChestAudio: { entry: Entry; version: number; promise: Promise<void>; ready: boolean } | null = null;

export function prepareChestAudio(): Promise<void> {
  const entry = getEntry('chestOpening');
  if (!entry) return Promise.reject(new Error('Chest audio player is unavailable'));
  if (preparedChestAudio?.entry === entry && preparedChestAudio.version === entry.version) {
    return preparedChestAudio.promise;
  }
  const version = entry.version;
  const promise = (async () => {
    await ready(entry, 10000);
    if (disposed || version !== entry.version) throw new Error('Chest audio preparation cancelled');
    entry.player.pause();
    await bounded(entry.player.seekTo(0));
    if (disposed || version !== entry.version) throw new Error('Chest audio preparation cancelled');
    if (preparedChestAudio?.entry === entry && preparedChestAudio.version === version) preparedChestAudio.ready = true;
  })();
  const preparation = { entry, version, promise, ready: false };
  preparedChestAudio = preparation;
  void promise.catch(() => {
    if (preparedChestAudio === preparation) preparedChestAudio = null;
  });
  return promise;
}

/** No load, seek, promise queue, or await on the opening path. */
export function playPreparedChestSound(): void {
  const entry = getEntry('chestOpening');
  if (!entry?.player.isLoaded || preparedChestAudio?.entry !== entry
      || preparedChestAudio.version !== entry.version || !preparedChestAudio.ready) {
    warnOnce('chestOpening', new Error('Chest audio was not prepared'));
    return;
  }
  try {
    const result = entry.player.play();
    if (result) void result.catch(error => warnOnce('chestOpening', error));
  } catch (error) { warnOnce('chestOpening', error); }
}
// END prepared chest audio

export function initializeAudio(): void {
  disposed = false;
  for (const event of Object.keys(sources) as (keyof typeof sources)[]) getEntry(event);
  if (Platform.OS === 'web' && typeof window !== 'undefined' && !removeWebListeners) {
    const unlock = () => resumeBackgroundMusic();
    const visibility = () => setAudioForeground(document.visibilityState !== 'hidden');
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    document.addEventListener('visibilitychange', visibility);
    visibility();
    removeWebListeners = () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', visibility);
    };
  }
}

function normalizedVolume(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Volume must be a finite number');
  return Math.max(0, Math.min(1, value));
}

function applyVolume(player: Player, volume: number, category: string): void {
  try { player.volume = volume; } catch (error) { warnOnce(`${category} volume`, error); }
}

/** Update live/cached players without seeking, replaying, or changing cue timing. */
export function setSoundEffectsVolume(value: number): void {
  soundEffectsVolume = normalizedVolume(value);
  for (const [event, entry] of players) {
    if (entry) applyVolume(entry.player, soundEffectsVolume, event);
  }
}

export function setMusicVolume(value: number): void {
  musicVolume = normalizedVolume(value);
  if (musicEntry) applyVolume(musicEntry.player, musicVolume, 'music');
}

/** One app-scoped player; screen navigation never calls seekTo or recreates it. */
export function startBackgroundMusic(): Promise<void> {
  musicWanted = true;
  if (disposed || !foreground) return Promise.resolve();
  if (!musicEntry) {
    try {
      const player = createPlayer(musicSource);
      if (!player) return Promise.resolve();
      musicEntry = { player, version: 0, pending: null };
      player.loop = true;
      applyVolume(player, musicVolume, 'music');
    } catch (error) {
      warnOnce('music', error);
      return Promise.resolve();
    }
  }
  const entry = musicEntry;
  if (musicPlaying) return Promise.resolve();
  if (entry.pending) return entry.pending;
  const version = entry.version;
  const pending = (async () => {
    try {
      // The unmodified six-minute track is larger than the short sound cues.
      // Waiting is detached from navigation/gameplay and cancellable on background.
      await ready(entry, 15000);
      if (disposed || !foreground || version !== entry.version) return;
      await bounded(Promise.resolve(entry.player.play()));
      if (disposed || !foreground) {
        entry.player.pause();
      } else if (version === entry.version) {
        musicPlaying = true;
      }
    } catch (error) {
      warnOnce('music', error);
    }
  })();
  entry.pending = pending;
  void pending.then(() => { if (entry.pending === pending) entry.pending = null; });
  return pending;
}

/** Also called on native touches / web gestures to retry a blocked first start. */
export function resumeBackgroundMusic(): void {
  if (musicWanted) void startBackgroundMusic();
}

function pauseBackgroundMusic(): void {
  musicPlaying = false;
  if (!musicEntry) return;
  musicEntry.version += 1;
  musicEntry.cancelLoading?.();
  musicEntry.pending = null;
  try { musicEntry.player.pause(); } catch (error) { warnOnce('music pause', error); }
}

export function stopSounds(events?: readonly SoundEvent[]): void {
  for (const [event, entry] of players) {
    if (!entry || (events && !events.includes(event))) continue;
    entry.version += 1;
    entry.cancelLoading?.();
    entry.pending = null;
    try { entry.player.pause(); } catch (error) { warnOnce(event, error); }
  }
}

export function setAudioForeground(active: boolean): void {
  foreground = active && !(Platform.OS === 'web' && typeof document !== 'undefined'
    && document.visibilityState === 'hidden');
  if (!foreground) {
    stopSounds();
    pauseBackgroundMusic();
  } else {
    resumeBackgroundMusic();
  }
}

export function disposeAudio(): void {
  disposed = true;
  musicWanted = false;
  pauseBackgroundMusic();
  try { musicEntry?.player.remove(); } catch (error) { warnOnce('music disposal', error); }
  musicEntry = null;
  removeWebListeners?.();
  removeWebListeners = undefined;
  stopSounds();
  for (const [event, entry] of players) {
    try { entry?.player.remove(); } catch (error) { warnOnce(event, error); }
  }
  players.clear();
}