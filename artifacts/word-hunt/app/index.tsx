import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, PrimaryButton, SoftButton, CoinPill } from '@/components/GameUI';
import { useColors } from '@/hooks/useColors';
import { useGame } from '@/context/GameProvider';

export default function HomeScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { coins, hydrated } = useGame();
  if (!hydrated) return null;
  return <Screen style={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 18 }}>
    <View style={styles.topRow}><View style={styles.brandMark}><Text style={styles.brandLetter}>W</Text></View><CoinPill coins={coins} /></View>
    <View style={styles.hero}>
      <View style={[styles.badge, { backgroundColor: colors.accent }]}><Text style={[styles.badgeText, { color: colors.orange }]}>FIND YOUR FOCUS</Text></View>
      <Text style={[styles.title, { color: colors.foreground }]}>Word{'\n'}Hunt</Text>
      <Text style={[styles.subtitle, { color: colors.inkSoft }]}>Spot the hidden words.{'\n'}Build your streak.</Text>
      <View style={styles.previewGrid}>{['W', 'O', 'R', 'D', 'H', 'U', 'N', 'T', 'F'].map((letter, index) => <View key={`${letter}-${index}`} style={[styles.previewCell, { backgroundColor: index === 4 ? colors.orange : colors.card, borderColor: index === 4 ? colors.orange : colors.border }]}><Text style={[styles.previewLetter, { color: index === 4 ? '#fff' : colors.foreground }]}>{letter}</Text></View>)}</View>
    </View>
    <View style={styles.actions}>
      <PrimaryButton onPress={() => router.push('/categories')} testID="play-button">PLAY</PrimaryButton>
      <SoftButton onPress={() => router.push('/collection')} testID="collection-button"><Feather name="grid" size={17} color={colors.foreground} />  COLLECTION</SoftButton>
    </View>
    <Text style={[styles.footer, { color: colors.mutedForeground }]}>15 categories · 2 ways to play · zero internet required</Text>
  </Screen>;
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brandMark: { width: 42, height: 42, borderRadius: 14, backgroundColor: '#2f80ed', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }] },
  brandLetter: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 22, transform: [{ rotate: '8deg' }] },
  hero: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 12 },
  badge: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 18 },
  badgeText: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.4 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 56, lineHeight: 54, textAlign: 'center', letterSpacing: -2 },
  subtitle: { fontFamily: 'Inter_500Medium', fontSize: 17, lineHeight: 25, textAlign: 'center', marginTop: 18 },
  previewGrid: { width: 168, height: 168, flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 28, transform: [{ rotate: '5deg' }] },
  previewCell: { width: 52, height: 52, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  previewLetter: { fontFamily: 'Inter_700Bold', fontSize: 20 },
  actions: { gap: 12 },
  footer: { textAlign: 'center', fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 18 },
});