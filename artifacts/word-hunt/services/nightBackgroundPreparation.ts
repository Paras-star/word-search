import { Image, type ImageRef } from 'expo-image';

export const NIGHT_BACKGROUND_SOURCE = require('../assets/images/backgrounds/night-forest-background.png');

// Retain one decoded image across introductory and Daily puzzle visits.
let prepared: ImageRef | null = null;
let pending: Promise<ImageRef> | null = null;

export function getPreparedNightBackground(): ImageRef | null {
  return prepared;
}

export function prepareNightBackground(): Promise<ImageRef> {
  if (prepared) return Promise.resolve(prepared);
  if (pending) return pending;
  pending = Image.loadAsync(NIGHT_BACKGROUND_SOURCE).then(image => {
    prepared = image;
    return image;
  }).catch(error => {
    pending = null;
    throw error;
  });
  return pending;
}
