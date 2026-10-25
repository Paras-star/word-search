// Only application state and SDK error codes belong here, never raw errors,
// consent strings, device identifiers, puzzle IDs, or ad-response payloads.
export function logAd(event: string, fields: Record<string, string | number | boolean> = {}) {
  console.info('[Word Hunt ads]', event, fields);
}

export function adErrorCode(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
  return typeof code === 'string' && /^[a-z0-9_/-]{1,80}$/i.test(code) ? code : 'unknown';
}

// Node-based tests must not stay alive just for background native-ad retries.
// React Native's numeric timers do not have unref().
export function adTimer(callback: () => void, delay: number) {
  const timer = setTimeout(callback, delay);
  (timer as unknown as { unref?: () => void }).unref?.();
  return timer;
}
