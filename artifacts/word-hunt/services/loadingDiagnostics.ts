// TEMPORARY: development-only observers. No storage, timers or asset ownership.
type Fields = Record<string, string | number | boolean | null>;
const imageIds = new WeakMap<object, number>();
let nextImageId = 0;
let rewardVisit = 0;
let categoryId = 'unknown';
let completionAt: number | null = null;
let rewardAt: number | null = null;
const enabled = () => typeof __DEV__ !== 'undefined' && __DEV__;
const rounded = (value: number) => Math.round(value * 10) / 10;

export function loadingImageId(image: object | null): number | null {
  if (!enabled() || !image) return null;
  try {
    let id = imageIds.get(image);
    if (id === undefined) { id = ++nextImageId; imageIds.set(image, id); }
    return id;
  } catch { return null; }
}

export function loadingError(error: unknown): string {
  try {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown';
    return message.replace(/[a-z][\w+.-]*:\/\/\S+/gi, '[asset]').replace(/\s+/g, ' ').slice(0, 180);
  } catch { return 'unknown'; }
}

export function logLoading(event: string, fields: Fields = {}): void {
  if (!enabled()) return;
  // Diagnostics must not throw into navigation, preparation or native callbacks.
  try {
    const now = performance.now();
    if (event === 'puzzle.complete' && fields.kind === 'category') {
      categoryId = String(fields.categoryId);
      completionAt = now;
      rewardAt = null;
    }
    if (event === 'reward.mount') {
      if (categoryId !== fields.categoryId) completionAt = null;
      categoryId = String(fields.categoryId);
      rewardAt = now;
      rewardVisit++;
    }
    console.info('[Word Hunt loading]', JSON.stringify({
      event, atMs: rounded(now), rewardVisit,
      rewardCategory: categoryId, rewardActive: rewardAt !== null,
      sinceCompletionMs: completionAt === null ? null : rounded(now - completionAt),
      sinceRewardMountMs: rewardAt === null ? null : rounded(now - rewardAt),
      ...fields,
    }));
    if (event === 'reward.unmount') rewardAt = null;
  } catch { /* Logging failure must have no application effect. */ }
}
