import { Image, type ImageRef } from 'expo-image';
import { DUMPLINGS } from '@/data/dumplings';
import { CHEST_ATLASES, CHEST_CLOSED, CHEST_FRONT } from '@/components/chestAnimationData';

export type PreparedChest = {
  atlases: ImageRef[];
  front: ImageRef;
  dumplings: ReadonlyMap<string, ImageRef>;
};

// Strong ImageRef ownership keeps decoded native bitmaps alive across routes.
// Downloads/prefetch alone do NOT guarantee a decoded image is ready.
let prepared: PreparedChest | null = null;
let pending: Promise<PreparedChest> | null = null;
let closed: ImageRef | null = null;
let closedPending: Promise<ImageRef> | null = null;

export function getPreparedClosedChest(): ImageRef | null { return closed; }

export function prepareClosedChest(): Promise<ImageRef> {
  if (closed) return Promise.resolve(closed);
  if (closedPending) return closedPending;
  closedPending = Image.loadAsync(CHEST_CLOSED).then(image => {
    closed = image;
    return image;
  }).catch(error => {
    closedPending = null;
    throw error;
  });
  return closedPending;
}

export function getPreparedChest(): PreparedChest | null { return prepared; }

export function prepareChestAssets(): Promise<PreparedChest> {
  if (prepared) return Promise.resolve(prepared);
  if (pending) return pending;
  pending = (async () => {
    // The small idle visual takes priority over the later opening resources.
    // RootLayout starts this before any game/reward route is rendered.
    await prepareClosedChest();
    // Two bounded lanes: never decode multiple large atlases concurrently, but
    // don't make the independent small rim/collectibles wait for all five.
    // allSettled also prevents a retry overlapping an unfinished failed lane.
    const lanes = await Promise.allSettled([
      (async () => {
        const atlases: ImageRef[] = [];
        for (const source of CHEST_ATLASES) atlases.push(await Image.loadAsync(source));
        return atlases;
      })(),
      (async () => {
        const front = await Image.loadAsync(CHEST_FRONT);
        const dumplings = new Map<string, ImageRef>();
        // Preserve the existing 384px cap and exactly one cached ref per reward.
        for (const d of DUMPLINGS) {
          dumplings.set(d.id, await Image.loadAsync(d.asset as number, { maxWidth: 384, maxHeight: 384 }));
        }
        return { front, dumplings };
      })(),
    ]);
    const [atlasLane, rewardLane] = lanes;
    if (atlasLane.status === 'rejected') throw atlasLane.reason;
    if (rewardLane.status === 'rejected') throw rewardLane.reason;
    const atlases = atlasLane.value;
    const { front, dumplings } = rewardLane.value;
    prepared = { atlases, front, dumplings };
    return prepared;
  })().catch(error => {
    pending = null;
    throw error;
  });
  return pending;
}