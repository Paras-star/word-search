import React, { useState } from 'react';
import { FlatList, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen, CoinPill } from '@/components/GameUI';
import { CATEGORIES } from '@/data/categories';
import { isCategoryUnlocked } from '@/game/progression';
import { useGame } from '@/context/GameProvider';
import { useColors } from '@/hooks/useColors';
import { AdBanner } from '@/components/AdBanner';
import { playSound } from '@/services/audio';
import { usePreparedBackground } from '@/hooks/usePreparedBackground';

const CATEGORY_TITLE = require('../assets/images/category-title.png');

export default function CategoriesScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const background = usePreparedBackground('animals');
  const [coinWidth, setCoinWidth] = useState(96);
  const { coins, completedLevels, hydrated, onboardingStep } = useGame();
  const cardSize = Math.min(210, Math.floor((width - 40 - 20) / 2));
  if (!hydrated) return null;
  if (onboardingStep < 6) {
    return <Redirect href={{ pathname: '/game', params: { onboardingStep: String(onboardingStep) } }} />;
  }
  return <Screen style={styles.screen}>
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="categories-background">
      <Image source={background}
        style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]}
        contentFit="cover" contentPosition="center" transition={0} accessible={false} />
    </View>
    <View style={[styles.content, { paddingTop: Platform.OS === 'web' ? Math.max(67, insets.top) : insets.top, paddingBottom: Platform.OS === 'web' ? Math.max(34, insets.bottom) : insets.bottom }]}>
    <View style={styles.titleRow}>
      <Header title="" onBack={() => router.back()} right={
        <View onLayout={({ nativeEvent }) => setCoinWidth(Math.max(24, nativeEvent.layout.width))} testID="category-coins">
          <CoinPill coins={coins} />
        </View>
      } />
      <View pointerEvents="none" accessible accessibilityRole="header" accessibilityLabel="Category"
        style={[styles.titleArea, { left: Math.max(44, coinWidth + 12), right: Math.max(44, coinWidth + 12) }]} testID="category-title-area">
        <Image source={CATEGORY_TITLE} contentFit="contain" contentPosition="center" transition={0}
          accessible={false} style={styles.titleImage} testID="category-title-image" />
      </View>
    </View>
    <FlatList data={CATEGORIES} numColumns={2} scrollEnabled showsVerticalScrollIndicator={false}
      keyExtractor={(item) => item.id} columnWrapperStyle={styles.columns}
      contentContainerStyle={styles.list} renderItem={({ item, index }) => {
      const unlocked = isCategoryUnlocked(index, completedLevels, CATEGORIES);
      const completed = completedLevels.includes(item.id);
      const state = completed ? 'completed' : unlocked ? 'available' : 'locked';
      const iconSize = Math.round(cardSize * 0.44);
      const rimWidth = Math.max(5, Math.round(cardSize * 0.03));
      return <Pressable
        testID={`category-card-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${state} category`}
        accessibilityHint={unlocked ? 'Open this category' : 'Complete the previous category to unlock'}
        accessibilityState={{ disabled: !unlocked }}
        disabled={!unlocked}
        onPress={() => { playSound('tap'); router.push({ pathname: '/mode', params: { categoryId: item.id } }); }}
        style={({ pressed }) => [
          styles.card,
          { width: cardSize, height: cardSize },
          completed
            ? {
              backgroundColor: colors.warning,
              borderColor: colors.warning,
              boxShadow: `0px 2px 8px ${colors.warning}66`,
              elevation: 8,
            }
            : unlocked
              ? { backgroundColor: colors.card, borderColor: colors.card }
              : { backgroundColor: colors.card, borderColor: colors.border, opacity: 0.58 },
          pressed && styles.pressedCard,
        ]}>
        {completed && <LinearGradient
          pointerEvents="none"
          testID="completed-category-rim"
          colors={[colors.warning, colors.accent, colors.warning, colors.accent, colors.warning]}
          locations={[0, 0.22, 0.5, 0.78, 1]}
          start={{ x: 0.08, y: 0 }}
          end={{ x: 0.92, y: 1 }}
          style={[styles.completedRim, {
            top: 2,
            right: 2,
            bottom: 2,
            left: 2,
            borderRadius: cardSize / 2,
          }]}>
          <View pointerEvents="none" style={[styles.completedRimCutout, {
            top: rimWidth,
            right: rimWidth,
            bottom: rimWidth,
            left: rimWidth,
            borderRadius: Math.max(0, cardSize / 2 - rimWidth - 2),
            backgroundColor: colors.warning,
          }]} />
        </LinearGradient>}
        {completed && <View pointerEvents="none" testID="completed-category-highlight"
          style={[styles.completedInnerHighlight, {
            top: rimWidth + 1,
            right: rimWidth + 1,
            bottom: rimWidth + 1,
            left: rimWidth + 1,
            borderRadius: Math.max(0, cardSize / 2 - rimWidth - 1),
            borderColor: colors.accent,
          }]} />}
        <View style={[styles.iconBadge, {
          width: iconSize,
          height: iconSize,
          borderRadius: iconSize / 2,
          marginBottom: Math.round(cardSize * 0.04),
          backgroundColor: unlocked ? colors.accent : colors.muted,
        }]}>
          <Text style={[styles.emoji, { fontSize: Math.round(iconSize * 0.58), lineHeight: Math.round(iconSize * 0.72) }]}>{item.emoji}</Text>
        </View>
        <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}
          style={[styles.name, {
            minHeight: Math.round(cardSize * 0.24),
            color: unlocked ? colors.foreground : colors.mutedForeground,
            fontSize: Math.min(17, Math.round(cardSize * 0.1)),
            lineHeight: Math.min(21, Math.round(cardSize * 0.125)),
          }]}>
          {item.name}
        </Text>
      </Pressable>;
    }} />
    <AdBanner />
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 0 },
  content: { flex: 1, paddingHorizontal: 20 },
  titleRow: { height: 64, marginTop: 64, marginBottom: 16 },
  // Equal insets center on the screen while clearing both existing controls.
  titleArea: { position: 'absolute', top: 4, bottom: 4 },
  titleImage: { width: '100%', height: '100%' },
  list: { paddingTop: 20, paddingBottom: 36 },
  columns: { justifyContent: 'space-between', marginBottom: 36 },
  card: {
    borderRadius: 999,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    elevation: 3,
  },
  pressedCard: { transform: [{ scale: 0.97 }] },
  completedRim: {
    position: 'absolute',
    overflow: 'hidden',
  },
  completedRimCutout: {
    position: 'absolute',
  },
  completedInnerHighlight: {
    position: 'absolute',
    borderWidth: 1,
    opacity: 0.58,
  },
  iconBadge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { textAlign: 'center' },
  name: {
    width: '100%',
    textAlign: 'center',
    textAlignVertical: 'center',
    fontFamily: 'Inter_700Bold',
  },
});