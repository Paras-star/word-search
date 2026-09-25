import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, PrimaryButton, SoftButton, CoinPill } from '@/components/GameUI';
import { BrandLoading } from '@/components/BrandLoading';
import { useColors } from '@/hooks/useColors';
import { useGame } from '@/context/GameProvider';

const homeColors = {
  background: '#FFF9EF',
  ink: '#153D48',
  softInk: '#59686B',
  teal: '#175C6C',
  tealBorder: '#A9C4C3',
  gold: '#B77024',
  goldSoft: '#FFF0D0',
  tile: '#FFFEFA',
  tileBorder: '#E7DCC8',
};

export default function HomeScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const compact = height < 730;
  const { coins, hydrated, onboardingStep } = useGame();
  if (!hydrated) return <BrandLoading />;
  const play = () => {
    if (onboardingStep < 6) {
      router.push({ pathname: '/game', params: { onboardingStep: String(onboardingStep) } });
      return;
    }
    router.push('/categories');
  };
  return <Screen style={{ paddingTop: insets.top + 10, paddingBottom: insets.bottom + 8, backgroundColor: homeColors.background }}>
    <View style={styles.topRow}>
      <Text style={styles.topKicker}>A LITTLE HUNT{'\n'}EVERY DAY</Text>
      <View style={styles.topActions}>
        <CoinPill coins={coins} />
        <Pressable onPress={() => router.push('/daily')} hitSlop={6} accessibilityRole="button" accessibilityLabel="Daily word hunt calendar" testID="daily-calendar-button" style={({ pressed }) => [styles.calendarButton, { opacity: pressed ? 0.7 : 1 }]}>
          <Text style={styles.calendarIcon}>🗓️</Text>
        </Pressable>
      </View>
    </View>
    <ScrollView style={styles.heroScroll} contentContainerStyle={[styles.hero, compact && styles.heroCompact]} showsVerticalScrollIndicator={false}>
      <View style={styles.badge}><Text style={styles.badgeText}>FIND YOUR FOCUS</Text></View>
      <Text style={[styles.title, compact && styles.titleCompact]}>Word Hunt : Mystery Dumpling</Text>
      <Text style={[styles.subtitle, compact && styles.subtitleCompact]}>Spot the hidden words.{'\n'}Build your streak.</Text>
      <View style={[styles.previewGrid, compact && styles.previewGridCompact]}>{['W', 'O', 'R', 'D', 'H', 'U', 'N', 'T', 'F'].map((letter, index) => <View key={`${letter}-${index}`} style={[styles.previewCell, compact && styles.previewCellCompact, index === 4 && styles.highlightCell]}><Text style={[styles.previewLetter, { color: index === 4 ? '#FFFFFF' : homeColors.ink }]}>{letter}</Text></View>)}</View>
    </ScrollView>
    <View style={styles.actions}>
      <PrimaryButton onPress={play} testID="play-button" style={styles.playButton}>PLAY</PrimaryButton>
      <SoftButton onPress={() => router.push('/collection')} testID="collection-button" style={styles.collectionButton}><Feather name="grid" size={17} color={colors.foreground} />  COLLECTION</SoftButton>
    </View>
    <View style={styles.reservedAdSpace} />
  </Screen>;
}

const styles = StyleSheet.create({
  topRow: { minHeight: 84, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  topKicker: { marginTop: 8, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.2, lineHeight: 17, color: homeColors.teal },
  topActions: { alignItems: 'center', gap: 4 },
  calendarButton: { width: 42, height: 40, borderRadius: 13, borderWidth: 1, borderColor: homeColors.tileBorder, backgroundColor: homeColors.tile, alignItems: 'center', justifyContent: 'center' },
  calendarIcon: { fontSize: 19 },
  heroScroll: { flex: 1 },
  hero: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingVertical: 12 },
  heroCompact: { paddingVertical: 4 },
  badge: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 14, backgroundColor: homeColors.goldSoft },
  badgeText: { color: homeColors.gold, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.3 },
  title: { color: homeColors.ink, fontFamily: 'Inter_700Bold', fontSize: 38, lineHeight: 42, textAlign: 'center', letterSpacing: -1.4, maxWidth: 375 },
  titleCompact: { fontSize: 32, lineHeight: 36 },
  subtitle: { color: homeColors.softInk, fontFamily: 'Inter_500Medium', fontSize: 16, lineHeight: 24, textAlign: 'center', marginTop: 16 },
  subtitleCompact: { marginTop: 10, fontSize: 14, lineHeight: 21 },
  previewGrid: { width: 174, height: 174, flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 27, transform: [{ rotate: '4deg' }] },
  previewGridCompact: { width: 144, height: 144, marginTop: 14 },
  previewCell: { width: 54, height: 54, borderRadius: 12, borderWidth: 1, borderColor: homeColors.tileBorder, backgroundColor: homeColors.tile, alignItems: 'center', justifyContent: 'center' },
  previewCellCompact: { width: 44, height: 44 },
  highlightCell: { backgroundColor: homeColors.teal, borderColor: homeColors.teal },
  previewLetter: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  actions: { gap: 12 },
  playButton: { backgroundColor: homeColors.teal },
  collectionButton: { backgroundColor: homeColors.tile, borderColor: homeColors.tealBorder },
  reservedAdSpace: { height: 68 },
});