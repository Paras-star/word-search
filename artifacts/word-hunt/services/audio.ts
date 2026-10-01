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
  Common: require('../assets/sounds/common-rarity.mp3'),
  Uncommon: require('../assets/sounds/uncommon-rarity.mp3'),
  Rare: require('../assets/sounds/rare-rarity.mp3'),
  Epic: require('../assets/sounds/epic-rarity.mp3'),
  Legendary: require('../assets/sounds/legendary-rarity.mp3'),
} as const;

export type SoundEvent = keyof typeof sources | 'countdown' | 'gameOver';
type Player = Pick<AudioPlayer, 'isLoaded' | 'seekTo' | 'pause' | 'remove'> & {
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
    if (player) entry = { player, version: 0, pending: null };
  } catch (error) {
    warnOnce(event, error);
  }
  players.set(event, entry);
  return entry;
}

function ready(entry: Entry): Promise<void> {
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
    const timer = setTimeout(() => finish(new Error('Sound loading timed out')), OPERATION_TIMEOUT);
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

export function initializeAudio(): void {
  disposed = false;
  for (const event of Object.keys(sources) as (keyof typeof sources)[]) getEntry(event);
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
  foreground = active;
  if (!active) stopSounds();
}

export function disposeAudio(): void {
  disposed = true;
  stopSounds();
  for (const [event, entry] of players) {
    try { entry?.player.remove(); } catch (error) { warnOnce(event, error); }
  }
  players.clear();
}