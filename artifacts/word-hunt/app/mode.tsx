import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen, PrimaryButton, SoftButton } from '@/components/GameUI';
import { CATEGORIES, getCategory } from '@/data/categories';
import { isCategoryUnlocked } from '@/game/progression';
import { getPuzzleCategory } from '@/game/puzzleConfig';
import { useGame } from '@/context/GameProvider';
import { useColors } from '@/hooks/useColors';

export default function ModeScreen() {
  const router = useRouter();
  const { categoryId } = useLocalSearchParams<{ categoryId?: string }>();
  const category = getCategory(categoryId);
  const { completedLevels, hydrated, onboardingStep } = useGame();
  const wordCount = getPuzzleCategory(category, completedLevels).words.length;
  const colors = useColors();
  const start = (mode: 'classic' | 'time') => router.replace({ pathname: '/game', params: { categoryId: category.id, mode, seed: `${Date.now()}` } });
  if (!hydrated) return null;
  if (onboardingStep < 6) {
    return <Redirect href={{ pathname: '/game', params: { onboardingStep: String(onboardingStep) } }} />;
  }
  const categoryIndex = CATEGORIES.findIndex((item) => item.id === categoryId);
  if (!isCategoryUnlocked(categoryIndex, completedLevels, CATEGORIES)) {
    return <Redirect href="/categories" />;
  }
  return <Screen>
    <Header title={category.name} onBack={() => router.back()} />
    <View style={styles.content}>
      <View style={[styles.categoryIcon, { backgroundColor: colors.accent }]}><Text style={styles.emoji}>{category.emoji}</Text></View>
      <Text style={[styles.title, { color: colors.foreground }]}>Pick your pace</Text>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Every hunt uses a fresh grid. Find all {wordCount} words to clear the category.</Text>
      <View style={styles.options}>
        <View style={[styles.option, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.optionIcon, { backgroundColor: '#e7f0ff' }]}><Feather name="compass" size={22} color={colors.primary} /></View><View style={styles.optionCopy}><Text style={[styles.optionTitle, { color: colors.foreground }]}>Classic</Text><Text style={[styles.optionText, { color: colors.mutedForeground }]}>No clock. Take your time.</Text></View></View>
        <View style={[styles.option, { backgroundColor: colors.card, borderColor: colors.border }]}><View style={[styles.optionIcon, { backgroundColor: '#fff0e0' }]}><Feather name="clock" size={22} color={colors.orange} /></View><View style={styles.optionCopy}><Text style={[styles.optionTitle, { color: colors.foreground }]}>Time Mode</Text><Text style={[styles.optionText, { color: colors.mutedForeground }]}>2 minutes. Beat the clock.</Text></View></View>
      </View>
      <PrimaryButton onPress={() => start('classic')} testID="classic-mode-button">PLAY CLASSIC</PrimaryButton>
      <SoftButton onPress={() => start('time')} testID="time-mode-button">PLAY TIME MODE</SoftButton>
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  content: { flex: 1, justifyContent: 'center', gap: 14, paddingBottom: 30 },
  categoryIcon: { alignSelf: 'center', width: 70, height: 70, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  emoji: { fontSize: 36 },
  title: { fontFamily: 'Inter_700Bold', fontSize: 29, textAlign: 'center' },
  subtitle: { fontFamily: 'Inter_500Medium', fontSize: 15, lineHeight: 23, textAlign: 'center', marginBottom: 14 },
  options: { gap: 10, marginBottom: 10 },
  option: { minHeight: 76, borderRadius: 18, borderWidth: 1, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 13 },
  optionIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  optionCopy: { gap: 3 },
  optionTitle: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  optionText: { fontFamily: 'Inter_500Medium', fontSize: 13 },
});