import React from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { homeColors } from '@/constants/homePalette';

const BACKGROUND = require('../assets/images/backgrounds/mode-selection-background.png');
const CROWN = require('../assets/images/daily/crowned-dumpling.png');
const CALENDAR = require('../assets/images/daily/Calendar Button.png');
const HOME = require('../assets/images/Home Panel.png');
const CROWN_RATIO = 460 / 478;
const CALENDAR_RATIO = 865 / 289;
const HOME_RATIO = 941 / 265;

type Props = { date: string; score: string; time: string; onCalendar: () => void; onHome: () => void };

function Stat({ label, value, testID }: { label: string; value: string; testID: string }) {
  return <View style={styles.stat} accessible accessibilityLabel={`${label} ${value}`} testID={`${testID}-stat`}>
    <Text style={styles.statLabel} numberOfLines={2}>{label}</Text>
    <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit testID={testID}>{value}</Text>
  </View>;
}

export default function DailyCompletion({ date, score, time, onCalendar, onHome }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const top = Platform.OS === 'web' ? Math.max(67, insets.top) : insets.top;
  const bottom = Platform.OS === 'web' ? Math.max(34, insets.bottom) : insets.bottom;
  const contentWidth = Math.max(1, Math.min(440, width - insets.left - insets.right - 32));
  const avail = Math.max(1, height - top - bottom - 32);
  const gap = Math.min(18, Math.max(10, avail * 0.022));
  const crownSize = Math.max(96, Math.min(contentWidth * 0.5, avail * 0.26));
  const panelWidth = Math.max(1, Math.min(contentWidth * 0.86, 380));
  return <View style={styles.screen} testID="daily-completion">
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="daily-completion-background">
      <Image source={BACKGROUND} style={styles.fill} contentFit="cover"
        contentPosition="center" transition={0} accessible={false} />
    </View>
    <ScrollView style={styles.screen} showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scroll, {
        paddingTop: top + 16, paddingBottom: bottom + 16,
        paddingLeft: insets.left + 16, paddingRight: insets.right + 16,
      }]} testID="daily-completion-content">
      <View style={[styles.main, { width: contentWidth, gap }]}>
        <Image source={CROWN} style={{ width: crownSize, aspectRatio: CROWN_RATIO }}
          contentFit="contain" transition={0} accessible={false} testID="daily-completion-crown" />
        <View style={styles.titleBlock}>
          <Text style={styles.title} accessibilityRole="header">DAILY PUZZLE COMPLETE!</Text>
          <View style={styles.dateRow}>
            <View style={styles.rule} />
            <Text style={styles.date} testID="daily-completion-date">{date}</Text>
            <View style={styles.rule} />
          </View>
        </View>
        <View style={styles.stats} testID="daily-completion-stats">
          <Stat label="SCORE" value={score} testID="daily-completion-score" />
          <View style={styles.divider} />
          <Stat label="TIME" value={time} testID="daily-completion-time" />
          <View style={styles.divider} />
          <Stat label="COINS EARNED" value="+20" testID="daily-completion-coins" />
        </View>
      </View>
      <View style={[styles.buttons, { gap, marginTop: gap * 1.5 }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to Calendar" onPress={onCalendar}
          style={({ pressed }) => [styles.button, { width: panelWidth, aspectRatio: CALENDAR_RATIO,
            opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
          testID="daily-completion-calendar">
          <Image source={CALENDAR} style={styles.fill} contentFit="contain" transition={0} accessible={false} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Home" onPress={onHome}
          style={({ pressed }) => [styles.button, { width: panelWidth, aspectRatio: HOME_RATIO,
            opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
          testID="daily-completion-home">
          <Image source={HOME} style={styles.fill} contentFit="contain" transition={0} accessible={false} />
        </Pressable>
      </View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  main: { alignItems: 'center' },
  titleBlock: { alignItems: 'center', gap: 6, maxWidth: '100%' },
  title: {
    color: homeColors.ink, fontFamily: 'Inter_700Bold', fontSize: 24, letterSpacing: 1,
    textAlign: 'center', textShadowColor: homeColors.goldSoft, textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: '100%' },
  rule: { width: 24, height: 2, borderRadius: 1, backgroundColor: homeColors.gold },
  date: { color: homeColors.gold, fontFamily: 'Inter_600SemiBold', fontSize: 15, letterSpacing: 0.6, flexShrink: 1, textAlign: 'center' },
  stats: {
    flexDirection: 'row', alignSelf: 'stretch', alignItems: 'center',
    backgroundColor: homeColors.goldSoft, borderColor: homeColors.gold, borderWidth: 2,
    borderRadius: 18, paddingVertical: 12, paddingHorizontal: 6,
  },
  stat: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 4, minWidth: 0 },
  statLabel: { color: homeColors.softInk, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.8, textAlign: 'center' },
  statValue: { color: homeColors.ink, fontFamily: 'Inter_700Bold', fontSize: 22, textAlign: 'center' },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: homeColors.tileBorder },
  buttons: { alignItems: 'center', flexShrink: 0 },
  button: { flexShrink: 0 },
});
