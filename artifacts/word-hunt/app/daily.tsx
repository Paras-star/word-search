import React, { useEffect, useState } from 'react';
import { AppState, Image, ImageBackground, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/GameUI';
import { DailyCalendar, calendarWidth } from '@/components/DailyCalendar';
import { useColors } from '@/hooks/useColors';
import { useGame } from '@/context/GameProvider';
import { dailyWindow, localDateKey } from '@/game/daily';
import { ctaAccessibilityLabel, effectiveSelection, isDailyDateSelectable, launchableDate, monthCells } from '@/components/dailyCalendarState';
import { getDailyPuzzle } from '@/game/dailyPuzzle';
import { playSound } from '@/services/audio';
import { warmNightBackground } from '@/services/nightBackgroundPreparation';

const BACKGROUND = require('@/assets/images/daily/calendar-background.png');
const PLAY_BUTTON = require('@/assets/images/daily/play-todays-hunt.png');
const PLAY_RATIO = 866 / 288;
const INK = '#4A230C';

export default function DailyScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { completedDailyPuzzles, hydrated, onboardingStep } = useGame();
  const [now, setNow] = useState(() => new Date());
  const todayKey = localDateKey(now);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

  useEffect(() => {
    if (hydrated) warmNightBackground();
  }, [hydrated]);

  useEffect(() => {
    const refresh = () => setNow(new Date());
    const timer = setInterval(refresh, 60_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    // Generate after the calendar has rendered, one date per turn. A date tap
    // then uses the already-built grid rather than blocking the route transition.
    const timers = dailyWindow(now).reverse().map((key, index) =>
      setTimeout(() => { getDailyPuzzle(key); }, index * 50));
    return () => timers.forEach(clearTimeout);
  }, [todayKey]);

  if (!hydrated) return <Screen style={{ paddingTop: insets.top + 16 }}>
    <View style={[styles.loadingLine, { backgroundColor: colors.card, width: 132 }]} />
    <View style={[styles.loadingCard, { backgroundColor: colors.card, borderColor: colors.border }]} />
  </Screen>;
  if (onboardingStep < 6) {
    return <Redirect href={{ pathname: '/game', params: { onboardingStep: String(onboardingStep) } }} />;
  }

  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const isCurrentMonth = month.getFullYear() === currentMonth.getFullYear() && month.getMonth() === currentMonth.getMonth();
  const completed = new Set(completedDailyPuzzles ?? []);
  const selected = effectiveSelection(selectedKey, now);
  const launchKey = launchableDate(selected, now, completed);
  const isWeb = Platform.OS === 'web';
  const topInset = isWeb ? Math.max(insets.top, 67) : insets.top;
  const bottomInset = isWeb ? Math.max(insets.bottom, 34) : insets.bottom;
  const sideInset = Math.max(insets.left, insets.right);
  const sizing = calendarWidth(windowWidth, insets.left, insets.right, monthCells(month).length / 7);
  const playWidth = Math.min(sizing.available * 0.8, 380);

  const shiftMonth = (offset: number) => {
    playSound('tap');
    setMonth((previous) => new Date(previous.getFullYear(), previous.getMonth() + offset, 1));
  };
  const selectDate = (key: string) => {
    if (!isDailyDateSelectable(key, now)) return;
    playSound('tap');
    setSelectedKey(key);
  };
  const openPuzzle = (key: string) => {
    warmNightBackground();
    router.push({ pathname: '/game', params: { dailyDate: key } });
  };
  const playSelected = () => {
    const key = launchKey;
    if (!key) return;
    playSound('tap');
    openPuzzle(key);
  };

  return <ImageBackground source={BACKGROUND} resizeMode="cover" style={styles.root} imageStyle={styles.backgroundImage}>
    <View style={[styles.header, { paddingTop: topInset + 6, paddingHorizontal: 16 + sideInset }]}>
      <Pressable onPress={() => { playSound('tap'); router.canGoBack() ? router.back() : router.replace('/'); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" testID="daily-back" style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.7 : 1 }]}>
        <Feather name="arrow-left" size={22} color={INK} />
      </Pressable>
      <Text style={styles.headerTitle} accessibilityRole="header">Daily Hunt</Text>
      <View style={styles.headerSpacer} />
    </View>
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 18, paddingLeft: insets.left, paddingRight: insets.right }]} showsVerticalScrollIndicator={false}>
      <View style={styles.plaque}><Text style={styles.plaqueText}>A Little Hunt, Every Day</Text></View>
      <ScrollView horizontal scrollEnabled={sizing.scrollsHorizontally} showsHorizontalScrollIndicator={false} style={{ maxWidth: sizing.available, flexGrow: 0, flexShrink: 0 }} contentContainerStyle={styles.calendarTrack} testID="daily-calendar-scroll">
      <DailyCalendar
        width={sizing.width}
        month={month}
        now={now}
        completed={completed}
        selected={selected}
        canGoNext={!isCurrentMonth}
        onShiftMonth={shiftMonth}
        onSelect={selectDate}
      />
      </ScrollView>
      <Pressable
        onPress={playSelected}
        disabled={!launchKey}
        accessibilityRole="button"
        accessibilityLabel={ctaAccessibilityLabel(selected, now, completed)}
        accessibilityState={{ disabled: !launchKey }}
        testID="daily-play-today"
        style={({ pressed }) => [styles.play, { opacity: !launchKey ? 0.45 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
      >
        <Image source={PLAY_BUTTON} style={{ width: playWidth, height: playWidth / PLAY_RATIO }} resizeMode="contain" />
      </Pressable>
    </ScrollView>
  </ImageBackground>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6E3C2' },
  backgroundImage: { width: '100%', height: '100%' },
  loadingLine: { height: 25, borderRadius: 10 },
  loadingCard: { height: 420, borderRadius: 22, borderWidth: 1, marginTop: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 6, backgroundColor: '#FFF0D2' },
  backButton: { width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: '#D9B88A', backgroundColor: '#FFF3DC', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 26, color: INK, letterSpacing: -0.5 },
  headerSpacer: { width: 44 },
  content: { flexGrow: 1, alignItems: 'center', paddingTop: 4 },
  plaque: { backgroundColor: '#6B3416', borderColor: '#E0A93C', borderWidth: 2, borderRadius: 12, paddingHorizontal: 22, paddingVertical: 6, marginBottom: 2, zIndex: 2 },
  plaqueText: { fontFamily: 'Inter_700Bold', fontSize: 14, color: '#F7CF6A', letterSpacing: 0.2 },
  calendarTrack: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 4 },
  play: { marginTop: 14, alignItems: 'center' },
});
