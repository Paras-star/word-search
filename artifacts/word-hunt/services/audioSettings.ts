import AsyncStorage from '@react-native-async-storage/async-storage';
import { setMusicVolume, setSoundEffectsVolume } from './audio';

// Separate from progress: changing audio preferences can never reset coins/levels.
export const AUDIO_SETTINGS_KEY = '@word-hunt/audio-settings-v1';
export type VolumeKind = 'musicVolume' | 'soundEffectsVolume';
type Volumes = Record<VolumeKind, number>;
export type AudioSettingsSnapshot = Volumes & {
  hydrated: boolean;
  saving: boolean;
  error: string | null;
};

let snapshot: AudioSettingsSnapshot = {
  musicVolume: 0.5, soundEffectsVolume: 1, hydrated: false, saving: false, error: null,
};
const listeners = new Set<() => void>();
let initialization: Promise<void> | undefined;
let writes = Promise.resolve();
let revision = 0;

export const getAudioSettings = () => snapshot;
export function subscribeAudioSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function publish(patch: Partial<AudioSettingsSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach(listener => listener());
}

function parseVolumes(raw: string): Volumes {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') throw new Error('Invalid saved audio settings');
  const volumes = value as Partial<Volumes>;
  for (const key of ['musicVolume', 'soundEffectsVolume'] as const) {
    const number = volumes[key];
    if (typeof number !== 'number' || !Number.isFinite(number) || number < 0 || number > 1) {
      throw new Error('Invalid saved audio volume');
    }
  }
  return { musicVolume: volumes.musicVolume!, soundEffectsVolume: volumes.soundEffectsVolume! };
}

function apply(volumes: Volumes): void {
  setMusicVolume(volumes.musicVolume);
  setSoundEffectsVolume(volumes.soundEffectsVolume);
}

/** Hydrate before starting music, so saved zero volumes never briefly play at defaults. */
export function initializeAudioSettings(): Promise<void> {
  if (initialization) return initialization;
  initialization = (async () => {
    try {
      const raw = await AsyncStorage.getItem(AUDIO_SETTINGS_KEY);
      const volumes = raw === null
        ? { musicVolume: 0.5, soundEffectsVolume: 1 }
        : parseVolumes(raw);
      apply(volumes);
      publish({ ...volumes, hydrated: true, error: null });
    } catch (error) {
      console.warn('[Word Hunt audio] Preferences could not be loaded.', error);
      apply(snapshot);
      publish({ hydrated: true, error: 'Audio settings could not be loaded. Default volumes are in use for this session.' });
    }
  })();
  return initialization;
}

function persist(): void {
  const version = ++revision;
  const raw = JSON.stringify({
    musicVolume: snapshot.musicVolume, soundEffectsVolume: snapshot.soundEffectsVolume,
  });
  publish({ saving: true, error: null });
  // Serialize snapshots so a slow older write cannot overwrite the latest choice.
  writes = writes.then(() => AsyncStorage.setItem(AUDIO_SETTINGS_KEY, raw)).then(() => {
    if (version === revision) publish({ saving: false, error: null });
  }).catch((error: unknown) => {
    console.warn('[Word Hunt audio] Preferences could not be saved.', error);
    if (version === revision) publish({
      saving: false, error: 'Volume changed, but could not be saved. Please retry.',
    });
  });
}

export function setAudioVolume(kind: VolumeKind, value: number): void {
  if (!snapshot.hydrated || !Number.isFinite(value)) return;
  const volume = Math.max(0, Math.min(1, value));
  if (kind === 'musicVolume') setMusicVolume(volume);
  else setSoundEffectsVolume(volume);
  publish({ [kind]: volume });
  persist();
}

export function retryAudioSettingsSave(): void {
  if (snapshot.hydrated) persist();
}

export function flushAudioSettings(): Promise<void> {
  return writes;
}