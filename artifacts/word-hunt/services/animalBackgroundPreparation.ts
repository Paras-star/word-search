import { Image, type ImageRef } from 'expo-image';
import { loadingError, loadingImageId, logLoading } from '@/services/loadingDiagnostics';

export const ANIMALS_BACKGROUND_SOURCE = require('../assets/images/backgrounds/animals-background.png');

// Keep one decoded native image alive across Animals puzzle visits.
let prepared: ImageRef | null = null;
let pending: Promise<ImageRef> | null = null;

export function getPreparedAnimalBackground(): ImageRef | null {
  return prepared;
}

export function prepareAnimalBackground(): Promise<ImageRef> {
  if (prepared) {
    logLoading('background.cache-hit', { imageRef: loadingImageId(prepared) });
    return Promise.resolve(prepared);
  }
  if (pending) {
    logLoading('background.pending-reused');
    return pending;
  }
  logLoading('background.prepare-start');
  pending = Image.loadAsync(ANIMALS_BACKGROUND_SOURCE).then(image => {
    prepared = image;
    logLoading('background.prepare-complete', { imageRef: loadingImageId(image) });
    return image;
  }).catch(error => {
    logLoading('background.prepare-error', { error: loadingError(error) });
    pending = null;
    throw error;
  });
  return pending;
}
