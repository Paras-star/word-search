import { useCallback, useEffect, useRef, useState } from 'react';
import { isRewardedLoading, isRewardedReady, prepareAds, subscribeToAds, watchRewarded } from '@/services/ads';

export type RewardedPlacement = 'home-coins' | 'puzzle-hints' | 'results-coins';
export type RewardedUiStatus = 'idle' | 'pending' | 'earned' | 'closed' | 'unavailable' | 'failed';
type EarnedHandler = () => void | boolean | Promise<void | boolean>;

/** Shared rewarded-ad UI state: synchronous tap guard, readiness, and transient feedback. */
export function useRewardedAd(placement: RewardedPlacement) {
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<RewardedUiStatus>('idle');
  const [ready, setReady] = useState(() => isRewardedReady());
  const [loading, setLoading] = useState(() => isRewardedLoading());

  useEffect(() => {
    mounted.current = true;
    void prepareAds().catch(() => {});
    const unsubscribe = subscribeToAds(() => {
      if (!mounted.current) return;
      setReady(isRewardedReady());
      setLoading(isRewardedLoading());
    });
    return () => {
      mounted.current = false;
      unsubscribe();
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  const flash = (next: RewardedUiStatus) => {
    if (!mounted.current) return;
    setStatus(next);
    if (clearTimer.current) clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => { if (mounted.current) setStatus('idle'); }, 2600);
  };

  /** onEarned must be captured by the caller at tap time. Returns the service result, or null if ignored. */
  const watch = useCallback(async (onEarned: EarnedHandler) => {
    if (inFlight.current) return null;
    inFlight.current = true;
    if (clearTimer.current) clearTimeout(clearTimer.current);
    setStatus('pending');
    try {
      const result = await watchRewarded(onEarned, placement);
      flash(result === 'earned' ? 'earned' : result === 'unavailable' ? 'unavailable' : result === 'save-failed' ? 'failed' : 'closed');
      return result;
    } catch {
      flash('failed');
      return null;
    } finally {
      inFlight.current = false;
    }
  }, [placement]);

  return { status, pending: status === 'pending', ready, loading, watch };
}
