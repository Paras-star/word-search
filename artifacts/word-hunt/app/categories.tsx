import React, { useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen, CoinPill, SectionLabel } from '@/components/GameUI';
import { CATEGORIES } from '@/data/categories';
import { isCategoryUnlocked } from '@/game/progression';
import { useGame } from '@/context/GameProvider';
import { useColors } from '@/hooks/useColors';
import { AdBanner } from '@/components/AdBanner';
import { playSound } from '@/services/audio';
import { ANIMALS_BACKGROUND_SOURCE } from '@/services/animalBackgroundPreparation';

const CATEGORY_TITLE = require('../assets/images/category-title.png');

export default function CategoriesScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [coinWidth, setCoinWidth] = useState(96);
  const { coins, completedLevels, hydrated, onboardingStep } = useGame();
  if (!hydrated) return null;
  if (onboardingStep < 6) {
    return <Redirect href={{ pathname: '/game', params: { onboardingStep: String(onboardingStep) } }} />;
  }
  return <Screen style={styles.screen}>
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="categories-background">
      <Image source={ANIMALS_BACKGROUND_SOURCE}
        style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
        contentFit="cover" contentPosition="center" transition={0} accessible={false} />
    </View>
    <View style={[styles.content, { paddingTop: Platform.OS === 'web' ? Math.max(67, insets.top) : insets.top, paddingBottom: Platform.OS === 'web' ? Math.max(34, insets.bottom) : insets.bottom }]}>
    <View style={[styles.headerBacking, { backgroundColor: `${colors.background}F0` }]}>
    <View style={styles.titleRow}>
      <Header title="" onBack={() => router.back()} right={
        <View onLayout={({ nativeEvent }) => setCoinWidth(Math.max(24, nativeEvent.layout.width))} testID="category-coins">
          <CoinPill coins={coins} />
        </View>
      } />
      <View pointerEvents="none" accessible accessibilityRole="header" accessibilityLabel="Category"
        style={[styles.titleArea, { right: coinWidth + 12 }]} testID="category-title-area">
        <Image source={CATEGORY_TITLE} contentFit="contain" contentPosition="center" transition={0}
          accessible={false} style={styles.titleImage} testID="category-title-image" />
      </View>
    </View>
    <Text style={[styles.intro, { color: colors.mutedForeground }]}>Complete a hunt to unlock the next world.</Text>
    </View>
    <FlatList data={CATEGORIES} numColumns={2} keyExtractor={(item) => item.id} columnWrapperStyle={styles.columns} contentContainerStyle={styles.list} renderItem={({ item, index }) => {
      const unlocked = isCategoryUnlocked(index, completedLevels, CATEGORIES);
      const completed = completedLevels.includes(item.id);
      return <Pressable disabled={!unlocked} onPress={() => { playSound('tap'); router.push({ pathname: '/mode', params: { categoryId: item.id } }); }} style={({ pressed }) => [styles.card, { backgroundColor: unlocked ? colors.card : colors.muted, borderColor: completed ? colors.success : colors.border, opacity: pressed ? 0.75 : 1 }]}>
        <View style={[styles.icon, { backgroundColor: unlocked ? colors.accent : colors.border }]}><Text style={styles.emoji}>{item.emoji}</Text></View>
        <Text style={[styles.name, { color: unlocked ? colors.foreground : colors.mutedForeground }]}>{item.name}</Text>
        <View style={styles.status}>{completed ? <><Feather name="check-circle" size={14} color={colors.success} /><Text style={[styles.statusText, { color: colors.success }]}>CLEARED</Text></> : unlocked ? <><SectionLabel>READY</SectionLabel></> : <><Feather name="lock" size={13} color={colors.mutedForeground} /><Text style={[styles.statusText, { color: colors.mutedForeground }]}>LOCKED</Text></>}</View>
      </Pressable>;
    }} />
    <AdBanner />
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { flex: 1, paddingHorizontal: 20 },
  headerBacking: { marginHorizontal: -20, paddingHorizontal: 20 },
  titleRow: { height: 64 },
  // Leave the existing back icon, its hitSlop, and measured coin control clear.
  titleArea: { position: 'absolute', left: 44, top: 4, bottom: 4 },
  titleImage: { width: '100%', height: '100%' },
  intro: { fontFamily: 'Inter_500Medium', fontSize: 14, marginBottom: 16 },
  list: { paddingBottom: 24, gap: 12 },
  columns: { gap: 12 },
  card: { flex: 1, minHeight: 156, padding: 16, borderRadius: 20, borderWidth: 1, marginBottom: 12 },
  icon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  emoji: { fontSize: 25 },
  name: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  statusText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.7 },
});