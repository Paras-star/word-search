import { Image, type ImageRef } from 'expo-image';
import { DUMPLINGS } from '@/data/dumplings';
import { CHEST_ATLASES, CHEST_FRONT } from '@/components/chestAnimationData';

export type PreparedChest = {
  atlases: ImageRef[];
  front: ImageRef;
  dumplings: ReadonlyMap<string, ImageRef>;
};

// Strong ImageRef ownership keeps decoded native bitmaps alive across routes.
// Downloads/prefetch alone do NOT guarantee a decoded image is ready.
let prepared: PreparedChest | null = null;
let pending: Promise<PreparedChest> | null = null;

export function getPreparedChest(): PreparedChest | null { return prepared; }

export function prepareChestAssets(): Promise<PreparedChest> {
  if (prepared) return Promise.resolve(prepared);
  if (pending) return pending;
  pending = (async () => {
    const atlases = [];
    // Decode sequentially to avoid five large PNG decoders competing at startup.
    for (const source of CHEST_ATLASES) atlases.push(await Image.loadAsync(source));
    const front = await Image.loadAsync(CHEST_FRONT);
    const dumplings = new Map<string, ImageRef>();
    // Bound the cache: 384px is enough for a 175dp reveal at normal Android
    // density, without retaining 30 full-resolution collectible bitmaps.
    for (const d of DUMPLINGS) {
      dumplings.set(d.id, await Image.loadAsync(d.asset as number, { maxWidth: 384, maxHeight: 384 }));
    }
    prepared = { atlases, front, dumplings };
    return prepared;
  })().catch(error => {
    pending = null;
    throw error;
  });
  return pending;
}