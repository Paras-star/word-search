import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '@/components/GameUI';
import { DUMPLING_BY_ID } from '@/data/dumplings';
import { formatTime } from '@/game/scoring';
import { collectReward, getPendingReward, type DumplingReward } from '@/services/dumplingRewards';
import NormalRewardScene from '@/components/NormalRewardScene';
import { stopDumplingSounds } from '@/services/dumplingAudio';
import { playSound } from '@/services/audio';
import { homeColors } from '@/constants/homePalette';
import { useGame } from '@/context/GameProvider';
import { registerCompletedPuzzle, showInterstitialAtTransition } from '@/services/ads';

type RevealStage = 'basket' | 'opening' | 'revealed' | 'collected';

export default function RewardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hydrated, onboardingStep } = useGame();
  const params = useLocalSearchParams<{ categoryId?: string; mode?: string; score?: string; time?: string; puzzleId?: string; dailyDate?: string }>();
  const isDailyRoute = params.dailyDate !== undefined;
  const [reward, setReward] = useState<DumplingReward | null>(null);
  const [stage, setStage] = useState<RevealStage>('basket');
  const [loading, setLoading] = useState(true);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  const focused = useRef(false);
  const navigating = useRef(false);
  const collecting = useRef(false);
  const focusVersion = useRef(0);
  const transition = useRef<AbortController | null>(null);

  useFocusEffect(useCallback(() => {
    focusVersion.current += 1;
    focused.current = true;
    navigating.current = false;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') transition.current?.abort();
    });
    return () => {
      focused.current = false;
      focusVersion.current += 1;
      transition.current?.abort();
      transition.current = null;
      subscription.remove();
    };
  }, []));

  useEffect(() => {
    let active = true;
    mounted.current = true;
    getPendingReward()
      .then((pending) => {
        if (!active) return;
        setReward(pending);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError('Your saved reward could not be loaded.');
        setLoading(false);
      });
    return () => {
      active = false;
      mounted.current = false;
      stopDumplingSounds();
    };
  }, []);

  const dumpling = reward ? DUMPLING_BY_ID[reward.dumplingId] : null;
  const eligibleCompletion = !isDailyRoute && hydrated && onboardingStep >= 6 && !!dumpling
    && typeof params.puzzleId === 'string' && params.puzzleId.trim().length > 0
    && reward?.puzzleId === params.puzzleId;

  useEffect(() => {
    // The service's process-wide distinct-ID set also protects remounts/revisits.
    if (!loading && eligibleCompletion) registerCompletedPuzzle(params.puzzleId!);
  }, [loading, eligibleCompletion, params.puzzleId]);

  const startReveal = () => {
    if (!reward || stage !== 'basket') return;
    setStage('opening');
  };
  const onRevealed = useCallback(() => { if (mounted.current) setStage('revealed'); }, []);

  const handleCollect = async () => {
    if (!reward || stage !== 'revealed') return null;
    collecting.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await collectReward(reward.id);
      if (mounted.current) {
        setReward(result.reward);
        setIsDuplicate(result.isDuplicate);
        setStage('collected');
      }
      return result;
    } catch {
      if (mounted.current) setError('Your reward could not be saved. Tap Collection or Continue to retry.');
      return null;
    } finally {
      collecting.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const viewCollection = () => {
    if (navigating.current || collecting.current || !focused.current || !dumpling || (stage !== 'revealed' && stage !== 'collected')) return;
    navigating.current = true;
    const session = focusVersion.current;
    playSound('tap');
    const navigate = (duplicate: boolean) => {
      if (!mounted.current || !focused.current || focusVersion.current !== session) return;
      router.replace({ pathname: '/collection', params: !duplicate ? { newDumplingId: dumpling.id } : undefined });
    };
    if (stage === 'collected') { navigate(isDuplicate); return; }
    // Both image buttons share the original collection service, never a new award.
    return handleCollect().then(result => {
      if (result) navigate(result.isDuplicate);
      else navigating.current = false;
    });
  };

  const goToResults = () => {
    if (navigating.current || collecting.current || !focused.current || (stage !== 'revealed' && stage !== 'collected')) return;
    navigating.current = true;
    const session = focusVersion.current;
    playSound('tap');
    const continueAfterSave = () => {
      if (!mounted.current || !focused.current || focusVersion.current !== session) return;
      const controller = new AbortController();
      transition.current = controller;
      let navigated = false;
      const navigate = () => {
        if (navigated || !mounted.current || !focused.current || transition.current !== controller) return;
        navigated = true;
        transition.current = null;
        router.replace({ pathname: '/results', params });
      };
      // Invalid/excluded completions must never borrow another puzzle's eligibility.
      if (!eligibleCompletion) { navigate(); return; }
      void showInterstitialAtTransition({
        signal: controller.signal,
        canPresent: () => mounted.current && focused.current
          && AppState.currentState !== 'background' && AppState.currentState !== 'inactive',
      }).then(navigate, navigate);
    };
    if (stage === 'collected') { continueAfterSave(); return; }
    return handleCollect().then(result => {
      if (result) continueAfterSave();
      else navigating.current = false;
    });
  };

  if (!loading && (!reward || !dumpling)) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, paddingHorizontal: 18 }]}>
        <View style={styles.emptyCard}>
          <Feather name="gift" size={42} color={homeColors.gold} />
          <Text style={styles.emptyTitle}>No reward is waiting</Text>
          <Text style={styles.emptyCopy}>{error ?? 'Complete a Word Hunt puzzle to earn a Mystery Dumpling.'}</Text>
          <PrimaryButton onPress={() => router.replace('/')} style={styles.actionButton}>GO HOME</PrimaryButton>
        </View>
      </View>
    );
  }

  const isRevealed = stage === 'revealed' || stage === 'collected';
  return (
    <NormalRewardScene dumpling={dumpling} opening={stage !== 'basket'} revealed={isRevealed}
      loading={loading} busy={busy} collected={stage === 'collected'} error={error}
      score={params.score ?? '0'} time={formatTime(Number(params.time ?? 0))} coins="+50"
      onOpen={startReveal} onRevealed={onRevealed}
      onCollection={viewCollection} onContinue={goToResults}
      onHome={() => { playSound('tap'); router.replace('/'); }} />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: homeColors.background, overflow: 'hidden' },
  actionButton: { width: '100%' },
  emptyCard: { marginTop: '45%', borderRadius: 24, backgroundColor: homeColors.tile, padding: 24, alignItems: 'center', gap: 12 },
  emptyTitle: { color: homeColors.ink, fontFamily: 'Inter_700Bold', fontSize: 24, textAlign: 'center' },
  emptyCopy: { color: 'rgba(89,104,107,0.76)', fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 6 },
});