import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen, PrimaryButton, SoftButton } from '@/components/GameUI';
import { CATEGORIES, getCategory } from '@/data/categories';
import { nextCategoryId } from '@/game/progression';
import { getOnboardingStep } from '@/game/onboarding';
import { parseLocalDateKey } from '@/game/daily';
import { formatTime } from '@/game/scoring';
import { useColors } from '@/hooks/useColors';
import { useGame } from '@/context/GameProvider';
import {
  isAdsSupported, isRewardedReady, prepareAds, registerCompletedPuzzle,
  REWARDED_COINS, showInterstitialAtTransition, subscribeToAds, watchRewardedForCoins,
} from '@/services/ads';

export default function ResultsScreen() {
  const router = useRouter();
  const colors = useColors();
  const { awardCoins, completedDailyPuzzles, onboardingStep } = useGame();
  const params = useLocalSearchParams<{ categoryId?: string; mode?: string; score?: string; time?: string; gameOver?: string; puzzleId?: string; onboardingStep?: string; dailyDate?: string }>();
  const isOnboardingRoute = params.onboardingStep !== undefined;
  const isDailyRoute = params.dailyDate !== undefined;
  const resultStep = isOnboardingRoute ? Number(params.onboardingStep) : null;
  const onboarding = resultStep !== null && Number.isInteger(resultStep) ? getOnboardingStep(resultStep) : undefined;
  const category = getCategory(params.categoryId);
  const gameOver = params.gameOver === '1';
  const nextId = nextCategoryId(category.id, CATEGORIES);
  const [rewardedReady, setRewardedReady] = useState(false);
  const [watching, setWatching] = useState(false);
  const [adMessage, setAdMessage] = useState('');
  const navigating = useRef(false);
  useEffect(() => {
    if (isOnboardingRoute || isDailyRoute || onboardingStep < 6) return;
    if (!gameOver && params.puzzleId) registerCompletedPuzzle(params.puzzleId);
    const update = () => setRewardedReady(isRewardedReady());
    const unsubscribe = subscribeToAds(update);
    void prepareAds().then(update);
    return unsubscribe;
  }, [gameOver, isOnboardingRoute, isDailyRoute, onboardingStep, params.puzzleId]);

  const proceed = (destination: '/' | { pathname: '/mode'; params: { categoryId: string } }) => {
    if (navigating.current) return;
    navigating.current = true;
    // A missing or failed ad must never prevent the chosen navigation.
    void showInterstitialAtTransition().then(
      () => router.replace(destination),
      () => router.replace(destination),
    );
  };
  const watchAd = async () => {
    if (watching || !isRewardedReady()) return;
    setWatching(true);
    setAdMessage('');
    const result = await watchRewardedForCoins(awardCoins);
    setAdMessage(result === 'earned' ? `+${REWARDED_COINS} coins saved!`
      : result === 'save-failed' ? 'Ad finished, but coins could not be saved.'
        : result === 'delayed' ? 'Ad is taking longer. Any earned coins will still be saved.'
          : result === 'closed' ? 'No coins earned. You can keep playing.' : 'No ad is available right now.');
    setWatching(false);
  };
  if (onboardingStep < 6 && !isOnboardingRoute) {
    return <Redirect href={{ pathname: '/game', params: { onboardingStep: String(onboardingStep) } }} />;
  }
  if (isOnboardingRoute) {
    if (!onboarding || resultStep !== onboardingStep - 1) return <Redirect href="/" />;
    const next = getOnboardingStep(onboardingStep);
    return <Screen>
      <Header title={next ? 'Hunt complete' : 'Animals unlocked'} onBack={() => router.replace('/')} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={[styles.icon, { backgroundColor: '#e4f7ec' }]}><Feather name="check" size={40} color={colors.success} /></View>
        <Text style={[styles.title, { color: colors.foreground }]}>{next ? 'Nice work' : 'Animals unlocked!'}</Text>
        <Text style={[styles.copy, { color: colors.mutedForeground }]}>
          {next ? `Next: ${next.words.length} words. Keep hunting to unlock Animals.` : 'Your first category is ready. The normal Word Hunt begins now!'}
        </Text>
        <View style={styles.stats}>
          <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.label, { color: colors.mutedForeground }]}>SCORE</Text><Text style={[styles.value, { color: colors.foreground }]}>{params.score ?? '0'}</Text></View>
          <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.label, { color: colors.mutedForeground }]}>TIME</Text><Text style={[styles.value, { color: colors.foreground }]}>{formatTime(Number(params.time ?? 0))}</Text></View>
          <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.label, { color: colors.mutedForeground }]}>COINS</Text><Text style={[styles.value, { color: colors.orange }]}>+10</Text></View>
        </View>
        <PrimaryButton onPress={() => router.replace(next
          ? { pathname: '/game', params: { onboardingStep: String(onboardingStep) } }
          : { pathname: '/mode', params: { categoryId: 'animals' } })}>
          {next ? `NEXT: ${next.words.length} WORDS` : 'PLAY ANIMALS'}
        </PrimaryButton>
        <SoftButton onPress={() => router.replace('/')}>HOME</SoftButton>
      </ScrollView>
    </Screen>;
  }
  if (isDailyRoute) {
    if (!params.dailyDate || !parseLocalDateKey(params.dailyDate) || !completedDailyPuzzles.includes(params.dailyDate)) {
      return <Redirect href="/daily" />;
    }
    return <Screen>
      <Header title="Daily Puzzle" onBack={() => router.replace('/daily')} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={[styles.icon, { backgroundColor: '#e4f7ec' }]}><Text style={{ fontSize: 38 }}>👑</Text></View>
        <Text style={[styles.title, { color: colors.foreground }]}>Daily Puzzle Complete!</Text>
        <Text style={[styles.copy, { color: colors.mutedForeground }]}>{params.dailyDate} is complete. Your crown is waiting on the calendar.</Text>
        <View style={styles.stats}>
          <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.label, { color: colors.mutedForeground }]}>SCORE</Text><Text style={[styles.value, { color: colors.foreground }]}>{params.score ?? '0'}</Text></View>
          <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.label, { color: colors.mutedForeground }]}>TIME</Text><Text style={[styles.value, { color: colors.foreground }]}>{formatTime(Number(params.time ?? 0))}</Text></View>
          <View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.label, { color: colors.mutedForeground }]}>COINS</Text><Text style={[styles.value, { color: colors.orange }]}>+20</Text></View>
        </View>
        <PrimaryButton onPress={() => router.replace('/daily')}>BACK TO CALENDAR</PrimaryButton>
        <SoftButton onPress={() => router.replace('/')}>HOME</SoftButton>
      </ScrollView>
    </Screen>;
  }
  return <Screen>
    <Header title={gameOver ? 'Time is up' : 'Hunt complete'} onBack={() => proceed('/')} />
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={[styles.icon, { backgroundColor: gameOver ? '#ffe4e4' : '#e4f7ec' }]}><Feather name={gameOver ? 'clock' : 'check'} size={40} color={gameOver ? colors.warning : colors.success} /></View>
      <Text style={[styles.title, { color: colors.foreground }]}>{gameOver ? 'Good try' : 'Nice work'}</Text>
      <Text style={[styles.copy, { color: colors.mutedForeground }]}>{gameOver ? 'The clock ran out before the hunt was complete.' : `${category.name} is cleared. Your next category is ready when you are.`}</Text>
      <View style={styles.stats}><View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.label, { color: colors.mutedForeground }]}>SCORE</Text><Text style={[styles.value, { color: colors.foreground }]}>{params.score ?? '0'}</Text></View><View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.label, { color: colors.mutedForeground }]}>TIME</Text><Text style={[styles.value, { color: colors.foreground }]}>{formatTime(Number(params.time ?? 0))}</Text></View><View style={[styles.stat, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.label, { color: colors.mutedForeground }]}>COINS</Text><Text style={[styles.value, { color: gameOver ? colors.mutedForeground : colors.orange }]}>{gameOver ? '+0' : '+50'}</Text></View></View>
      {isAdsSupported() && <SoftButton disabled={!rewardedReady || watching} onPress={() => { void watchAd(); }} testID="watch-ad-for-coins">
        {watching ? 'WATCHING AD…' : `WATCH AD · +${REWARDED_COINS} COINS`}
      </SoftButton>}
      {!!adMessage && <Text style={[styles.adMessage, { color: colors.mutedForeground }]}>{adMessage}</Text>}
      {!gameOver && nextId && <PrimaryButton onPress={() => proceed({ pathname: '/mode', params: { categoryId: nextId } })}>NEXT LEVEL</PrimaryButton>}
      <SoftButton onPress={() => proceed({ pathname: '/mode', params: { categoryId: category.id } })}>PLAY AGAIN</SoftButton>
      <SoftButton onPress={() => proceed('/')}>HOME</SoftButton>
    </ScrollView>
  </Screen>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 13, paddingBottom: 30 },
  adMessage: { fontFamily: 'Inter_500Medium', fontSize: 13, textAlign: 'center' },
  icon: { width: 86, height: 86, borderRadius: 30, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 34 },
  copy: { fontFamily: 'Inter_500Medium', textAlign: 'center', lineHeight: 22, fontSize: 15, maxWidth: 310, marginBottom: 8 },
  stats: { width: '100%', flexDirection: 'row', gap: 8, marginBottom: 8 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 16, paddingVertical: 13, alignItems: 'center' },
  label: { fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1 },
  value: { fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 4 },
});