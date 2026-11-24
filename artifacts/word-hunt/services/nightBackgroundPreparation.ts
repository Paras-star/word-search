import { Image, type ImageRef } from 'expo-image';

export const NIGHT_BACKGROUND_SOURCE = require('../assets/images/backgrounds/night-forest-background.png');

// Retain one decoded image across introductory and Daily puzzle visits.
// Web display adopts this same reference, including with no-store responses.
let prepared: ImageRef | null = null;
let pending: Promise<ImageRef> | null = null;

export function getPreparedNightBackground(): ImageRef | null {
  return prepared;
}

async function loadNightBackground(): Promise<ImageRef> {
  return Image.loadAsync(NIGHT_BACKGROUND_SOURCE);
}

export function prepareNightBackground(): Promise<ImageRef> {
  if (prepared) return Promise.resolve(prepared);
  if (pending) return pending;
  // The async wrapper also makes a synchronous loader failure retryable.
  pending = loadNightBackground().then(image => {
    prepared = image;
    return image;
  }).catch(error => {
    pending = null;
    throw error;
  });
  return pending;
}

/** Start early without delaying navigation or leaving a rejected promise unhandled. */
export function warmNightBackground(): void {
  void prepareNightBackground().catch(error => {
    console.warn('[Word Hunt background] Night preparation failed; using the source image.', error);
  });
}
