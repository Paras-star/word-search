import { AppState } from 'react-native';
import { warmChestScenery } from '@/services/chestSceneryPreparation';

const HOME_SETTLE_DELAY_MS = 800;
const IDLE_TIMEOUT_MS = 2000;

type IdleDeadlineLike = { didTimeout: boolean; timeRemaining(): number };
type IdleScheduler = typeof globalThis & {
  requestIdleCallback?: (callback: (deadline: IdleDeadlineLike) => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

/**
 * Prepare only after Home has had time to render, then use browser idle time
 * where available. Focus cleanup and app-backgrounding cancel pending work.
 */
export function scheduleHomeChestSceneryPreparation(): () => void {
  const idleScheduler = globalThis as IdleScheduler;
  let cancelled = false;
  let appActive = AppState.currentState === 'active';
  let attemptScheduled = false;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let fallbackTimer: ReturnType<typeof setTimeout> | undefined;
  let idleHandle: number | undefined;
  let subscription: ReturnType<typeof AppState.addEventListener> | undefined;

  const clearPending = () => {
    if (settleTimer !== undefined) clearTimeout(settleTimer);
    if (fallbackTimer !== undefined) clearTimeout(fallbackTimer);
    if (idleHandle !== undefined) idleScheduler.cancelIdleCallback?.(idleHandle);
    settleTimer = undefined;
    fallbackTimer = undefined;
    idleHandle = undefined;
    attemptScheduled = false;
  };

  const stopListening = () => {
    subscription?.remove();
    subscription = undefined;
  };

  const runPreparation = () => {
    idleHandle = undefined;
    fallbackTimer = undefined;
    if (cancelled) return;
    if (!appActive || AppState.currentState !== 'active') {
      appActive = false;
      clearPending();
      return;
    }
    attemptScheduled = false;
    stopListening();
    // This is best effort; the existing chest press-in path remains the retry.
    warmChestScenery();
  };

  const schedule = () => {
    if (cancelled || !appActive || AppState.currentState !== 'active' || attemptScheduled) return;
    attemptScheduled = true;
    settleTimer = setTimeout(() => {
      settleTimer = undefined;
      if (cancelled || !appActive) return;
      if (idleScheduler.requestIdleCallback) {
        idleHandle = idleScheduler.requestIdleCallback(runPreparation, { timeout: IDLE_TIMEOUT_MS });
      } else {
        // Safari and some native JS runtimes lack requestIdleCallback. Home has
        // already settled; yield once more before starting non-blocking work.
        fallbackTimer = setTimeout(runPreparation, 0);
      }
    }, HOME_SETTLE_DELAY_MS);
  };

  subscription = AppState.addEventListener('change', state => {
    appActive = state === 'active';
    if (appActive) schedule();
    else clearPending();
  });
  schedule();

  return () => {
    cancelled = true;
    clearPending();
    stopListening();
  };
}
