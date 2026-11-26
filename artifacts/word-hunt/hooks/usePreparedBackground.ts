import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { ImageRef } from 'expo-image';
import { ANIMALS_BACKGROUND_SOURCE, getPreparedAnimalBackground, prepareAnimalBackground } from '@/services/animalBackgroundPreparation';
import { NIGHT_BACKGROUND_SOURCE, getPreparedNightBackground, prepareNightBackground } from '@/services/nightBackgroundPreparation';

const backgrounds = {
  animals: { source: ANIMALS_BACKGROUND_SOURCE, get: getPreparedAnimalBackground, prepare: prepareAnimalBackground },
  night: { source: NIGHT_BACKGROUND_SOURCE, get: getPreparedNightBackground, prepare: prepareNightBackground },
} as const;

/** Consumers share the existing bounded caches, not another image/cache layer. */
export function usePreparedBackground(kind: keyof typeof backgrounds) {
  const entry = backgrounds[kind];
  const [state, setState] = useState<{ kind: typeof kind; image: ImageRef | null; failed: boolean }>(
    () => ({ kind, image: entry.get(), failed: false }),
  );
  useEffect(() => {
    let active = true;
    void entry.prepare().then(image => {
      if (active) setState({ kind, image, failed: false });
    }).catch(error => {
      console.warn(`[Word Hunt background] ${kind} preparation failed; using the source image.`, error);
      if (active) setState({ kind, image: null, failed: true });
    });
    return () => { active = false; };
  }, [entry, kind]);
  const image = state.kind === kind ? state.image : entry.get();
  // Native retains the immediate source fallback. Web must not request the
  // original URL alongside loadAsync's blob fetch (development sends no-store).
  return image ?? (Platform.OS !== 'web' || (state.kind === kind && state.failed) ? entry.source : undefined);
}
