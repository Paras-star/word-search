export type DumplingSound =
  | 'basketAppearance'
  | 'basketMovement'
  | 'anticipation'
  | 'opening'
  | 'reveal'
  | 'rarityReveal'
  | 'collection';

/**
 * Phase 2 sound cue boundary. Audio assets can be attached here later without
 * coupling reward state or animation timing to audio availability.
 */
export async function playDumplingSound(_sound: DumplingSound): Promise<void> {
  return Promise.resolve();
}