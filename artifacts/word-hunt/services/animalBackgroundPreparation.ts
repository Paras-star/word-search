import { Image, type ImageRef } from 'expo-image';

export const ANIMALS_BACKGROUND_SOURCE = require('../assets/images/backgrounds/animals-background.png');

// Keep one decoded native image alive across Animals puzzle visits.
let prepared: ImageRef | null = null;
let pending: Promise<ImageRef> | null = null;

export function getPreparedAnimalBackground(): ImageRef | null {
  return prepared;
}

export function prepareAnimalBackground(): Promise<ImageRef> {
  if (prepared) return Promise.resolve(prepared);
  if (pending) return pending;
  pending = Image.loadAsync(ANIMALS_BACKGROUND_SOURCE).then(image => {
    prepared = image;
    return image;
  }).catch(error => {
    pending = null;
    throw error;
  });
  return pending;
}
