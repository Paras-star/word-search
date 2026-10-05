/**
 * Yield a paint after the independent closed image reports display/load.
 * Opening preparation must never run in the initial chest render commit.
 */
export function afterChestDisplay(work: () => void): () => void {
  let idle: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const frame = requestAnimationFrame(() => {
    if (typeof requestIdleCallback === 'function') {
      idle = requestIdleCallback(work);
    } else {
      // Safari has no requestIdleCallback; still yield the image's paint first.
      timer = setTimeout(work, 0);
    }
  });
  return () => {
    cancelAnimationFrame(frame);
    if (idle !== undefined) cancelIdleCallback(idle);
    if (timer !== undefined) clearTimeout(timer);
  };
}
