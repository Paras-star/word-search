import type { DumplingRarity } from '@/data/dumplings';
import { startSound, stopSounds, type SoundEvent } from './audio';

export type DumplingSound =
  | 'basketAppearance'
  | 'basketMovement'
  | 'anticipation'
  | 'opening'
  | 'reveal'
  | 'rarityReveal'
  | 'collection';

const dumplingEvents: readonly SoundEvent[] = ['opening', 'reveal', 'Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
let queue: Promise<void> = Promise.resolve();
let sequenceVersion = 0;

/** Preserve cue start order without delaying the animation for clip duration. */
export function playDumplingSound(sound: DumplingSound, rarity?: DumplingRarity): Promise<void> {
  const event: SoundEvent | undefined = sound === 'opening' || sound === 'reveal'
    ? sound
    : sound === 'rarityReveal' ? rarity : undefined;
  if (!event) return Promise.resolve();
  const version = sequenceVersion;
  queue = queue.then(async () => {
    if (version === sequenceVersion) await startSound(event);
  }).catch((error: unknown) => {
    console.warn('[Word Hunt audio] Dumpling cue unavailable; reveal continues.', error);
  });
  return queue;
}

export function stopDumplingSounds(): void {
  sequenceVersion += 1;
  stopSounds(dumplingEvents);
  queue = Promise.resolve();
}