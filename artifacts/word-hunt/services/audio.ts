export type SoundEvent = 'tap' | 'correct' | 'wrong' | 'complete' | 'countdown' | 'drag' | 'bonus' | 'gameOver';

/** Audio stays optional in Phase 1 so unavailable assets never interrupt gameplay. */
export function playSound(_event: SoundEvent): void {
  // Ready for lightweight Expo-compatible sound assets in a later polish pass.
}