import { Image, type ImageRef } from 'expo-image';
import { Platform } from 'react-native';

export const CHEST_SCENERY_SOURCE = require('../assets/images/chests/chest-background.png');

type PreparedScenery = {
  image: ImageRef;
  // Web ImageRef retains a blob URL, not the element that decoded it.
  decodedWebImage?: HTMLImageElement;
};

// One original 937 × 1678 surface (~6 MiB RGBA), shared by both scenery
// layers and retained across routes. No atlas, collectible or purchase work.
let prepared: PreparedScenery | null = null;
let pending: Promise<ImageRef> | null = null;

export function getPreparedChestScenery(): ImageRef | null {
  return prepared?.image ?? null;
}

async function loadScenery(): Promise<PreparedScenery> {
  const image = await Image.loadAsync(CHEST_SCENERY_SOURCE);
  if (Platform.OS !== 'web') return { image };

  // Expo's web loader fetches one blob and waits for load, not decode.
  // Decode that same blob explicitly and retain its element as well as the
  // ImageRef. Display must use the ref, never refetch the original no-store URL.
  const uri = (image as ImageRef & { uri?: string }).uri;
  if (!uri) throw new Error('Prepared chest scenery has no web image URI.');
  try {
    const decodedWebImage = new globalThis.Image();
    decodedWebImage.src = uri;
    await decodedWebImage.decode();
    return { image, decodedWebImage };
  } catch (error) {
    URL.revokeObjectURL(uri);
    throw error;
  }
}

export function prepareChestScenery(): Promise<ImageRef> {
  if (prepared) return Promise.resolve(prepared.image);
  if (pending) return pending;
  // Async wrapper turns synchronous loader throws into retryable rejections.
  pending = loadScenery().then(result => {
    prepared = result;
    return result.image;
  }).catch(error => {
    pending = null;
    throw error;
  });
  return pending;
}

/** Best effort only: never await this from navigation or purchase handlers. */
export function warmChestScenery(): void {
  void prepareChestScenery().catch(error => {
    console.warn('[Word Hunt chest] Scenery preparation failed; entry will retry.', error);
  });
}
