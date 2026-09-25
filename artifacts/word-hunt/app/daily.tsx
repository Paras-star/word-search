import React, { useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, CoinPill, PrimaryButton } from '@/components/GameUI';
import { useColors } from '@/hooks/useColors';
import { useGame } from '@/context/GameProvider';
import { isDailyDatePlayable, localDateKey } from '@/game/daily';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function DailyScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { coins, completedDailyPuzzles, hydrated, onboardingStep } = useGame();
  const [now, setNow] = useState(() => new Date());
  const [month, setMonth] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });

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

  if (!hydrated) return <Screen style={{ paddingTop: insets.top + 16 }}>
    <View style={[styles.loadingLine, { backgroundColor: colors.card, width: 132 }]} />
    <View style={[styles.loadingLine, { backgroundColor: colors.card, width: 220, marginTop: 58 }]} />
    <View style={[styles.loadingCard, { backgroundColor: colors.card, borderColor: colors.border }]} />
  </Screen>;
  if (onboardingStep < 6) {
    return <Redirect href={{ pathname: '/game', params: { onboardingStep: String(onboardingStep) } }} />;
  }

  const todayKey = localDateKey(now);
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const isCurrentMonth = month.getFullYear() === currentMonth.getFullYear() && month.getMonth() === currentMonth.getMonth();
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const leading = month.getDay();
  const cells: (Date | null)[] = [
    ...Array<null>(leading).fill(null),
    ...Array.from({ length: count }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const completed = new Set(completedDailyPuzzles ?? []);
  const shiftMonth = (offset: number) => setMonth((previous) => new Date(previous.getFullYear(), previous.getMonth() + offset, 1));

  return <Screen style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }}>
    <View style={styles.header}>
      <Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" testID="daily-back" style={({ pressed }) => [styles.backButton, { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 }]}>
        <Feather name="arrow-left" size={21} color={colors.foreground} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: colors.foreground }]}>Daily Hunt</Text>
      <CoinPill coins={coins} />
    </View>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.intro}>
        <View style={[styles.badge, { backgroundColor: colors.accent }]}><Text style={[styles.badgeText, { color: colors.orange }]}>A LITTLE HUNT, EVERY DAY</Text></View>
        <Text style={[styles.title, { color: colors.foreground }]}>Make today count.</Text>
        <Text style={[styles.description, { color: colors.inkSoft }]}>Missed a day? You can catch up on the last five.</Text>
      </View>

      <View style={[styles.calendarCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.monthRow}>
          <Pressable onPress={() => shiftMonth(-1)} accessibilityRole="button" accessibilityLabel="Previous month" testID="daily-prev-month" hitSlop={8} style={({ pressed }) => [styles.monthButton, { backgroundColor: colors.background, opacity: pressed ? 0.65 : 1 }]}>
            <Feather name="chevron-left" size={22} color={colors.foreground} />
          </Pressable>
          <Text style={[styles.monthLabel, { color: colors.foreground }]}>{MONTHS[month.getMonth()]} {month.getFullYear()}</Text>
          <Pressable onPress={() => shiftMonth(1)} disabled={isCurrentMonth} accessibilityRole="button" accessibilityLabel="Next month" accessibilityState={{ disabled: isCurrentMonth }} testID="daily-next-month" hitSlop={8} style={[styles.monthButton, { backgroundColor: colors.background, opacity: isCurrentMonth ? 0.28 : 1 }]}>
            <Feather name="chevron-right" size={22} color={colors.foreground} />
          </Pressable>
        </View>
        <View style={styles.weekRow}>
          {WEEKDAYS.map((day) => <Text key={day} style={[styles.weekday, { color: colors.mutedForeground }]}>{day}</Text>)}
        </View>
        <View style={styles.daysGrid}>
          {cells.map((date, index) => {
            if (!date) return <View key={`blank-${index}`} style={styles.daySlot} />;
            const key = localDateKey(date);
            const played = completed.has(key);
            const playable = isDailyDatePlayable(key, now);
            const today = key === todayKey;
            const available = playable && !played;
            return <View key={key} style={styles.daySlot}>
              <Pressable
                disabled={!available}
                onPress={() => router.push({ pathname: '/game', params: { dailyDate: key } })}
                accessibilityRole="button"
                accessibilityLabel={`${MONTHS[date.getMonth()]} ${date.getDate()}${today ? ', today' : ''}${played ? ', completed' : available ? ', playable' : ', unavailable'}`}
                accessibilityState={{ disabled: !available }}
                testID={`daily-date-${key}`}
                style={({ pressed }) => [styles.day, {
                  backgroundColor: played ? colors.accent : today ? colors.primary : available ? colors.background : colors.card,
                  borderColor: today ? colors.primary : available || played ? colors.border : 'transparent',
                  opacity: pressed ? 0.7 : playable || played ? 1 : 0.38,
                }]}
              >
                {played ? <Text style={styles.crown}>👑</Text> : null}
                <Text style={[styles.dayNumber, { color: today && !played ? '#fff' : colors.foreground, fontFamily: today ? 'Inter_700Bold' : 'Inter_600SemiBold' }]}>{date.getDate()}</Text>
              </Pressable>
            </View>;
          })}
        </View>
      </View>
      <View style={styles.legend}>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.primary }]} /><Text style={[styles.legendText, { color: colors.inkSoft }]}>Today</Text></View>
        <View style={styles.legendItem}><Text style={styles.legendCrown}>👑</Text><Text style={[styles.legendText, { color: colors.inkSoft }]}>Completed</Text></View>
        <View style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: colors.border }]} /><Text style={[styles.legendText, { color: colors.inkSoft }]}>Unavailable</Text></View>
      </View>
      <Text style={[styles.note, { color: colors.mutedForeground }]}>New puzzle each day, right where you are.</Text>
    </ScrollView>
    {!completed.has(todayKey) && <PrimaryButton onPress={() => router.push({ pathname: '/game', params: { dailyDate: todayKey } })} testID="daily-play-today">PLAY TODAY'S HUNT</PrimaryButton>}
  </Screen>;
}

const styles = StyleSheet.create({
  loadingLine: { height: 25, borderRadius: 10 },
  loadingCard: { height: 324, borderRadius: 22, borderWidth: 1, marginTop: 32 },
  header: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 40, height: 40, borderRadius: 13, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: 'Inter_700Bold', fontSize: 19 },
  content: { flexGrow: 1, paddingBottom: 14 },
  intro: { paddingTop: 25, paddingBottom: 24 },
  badge: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 13 },
  badgeText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 30, letterSpacing: -0.8 },
  description: { fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 20, marginTop: 7 },
  calendarCard: { borderRadius: 22, borderWidth: 1, paddingHorizontal: 12, paddingTop: 14, paddingBottom: 17 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  monthButton: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  weekRow: { flexDirection: 'row', marginBottom: 8 },
  weekday: { width: '14.2857%', textAlign: 'center', fontFamily: 'Inter_700Bold', fontSize: 11 },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 5 },
  daySlot: { width: '14.2857%', height: 43, alignItems: 'center', justifyContent: 'center' },
  day: { width: 39, height: 39, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  crown: { position: 'absolute', top: -5, right: -5, fontSize: 12 },
  dayNumber: { fontSize: 14 },
  legend: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap', gap: 15, paddingTop: 18 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendCrown: { fontSize: 12 },
  legendText: { fontFamily: 'Inter_500Medium', fontSize: 11 },
  note: { textAlign: 'center', fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 23 },
});