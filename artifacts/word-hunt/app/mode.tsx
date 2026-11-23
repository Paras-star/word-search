import React, { useEffect } from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { CATEGORIES, getCategory } from '@/data/categories';
import { isCategoryUnlocked } from '@/game/progression';
import { useGame } from '@/context/GameProvider';
import { prepareAnimalBackground } from '@/services/animalBackgroundPreparation';
import { playSound } from '@/services/audio';

const BACKGROUND = require('../assets/images/backgrounds/mode-selection-background.png');
const CLASSIC = require('../assets/images/classic-mode-button.png');
const TIME_MODE = require('../assets/images/time-mode-button.png');
const CLASSIC_RATIO = 786 / 273;
const TIME_RATIO = 788 / 309;

export default function ModeScreen() {
  const router = useRouter();
  const { categoryId } = useLocalSearchParams<{ categoryId?: string }>();
  const category = getCategory(categoryId);
  const { completedLevels, hydrated, onboardingStep } = useGame();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const top = Platform.OS === 'web' ? Math.max(67, insets.top) : insets.top;
  const bottom = Platform.OS === 'web' ? Math.max(34, insets.bottom) : insets.bottom;
  // Width and height limits preserve both source ratios, including short screens.
  const buttonWidth = Math.max(1, Math.min(480, width - 40,
    (height - top - bottom - 56) / (1 / CLASSIC_RATIO + 1 / TIME_RATIO)));
  useEffect(() => {
    if (!hydrated || onboardingStep < 6 || !categoryId) return;
    void prepareAnimalBackground().catch(error => {
      console.warn('[Word Hunt background] Animals preparation failed.', error);
    });
  }, [categoryId, hydrated, onboardingStep]);
  const start = (mode: 'classic' | 'time') => router.replace({ pathname: '/game', params: { categoryId: category.id, mode, seed: `${Date.now()}` } });
  if (!hydrated) return null;
  if (onboardingStep < 6) {
    return <Redirect href={{ pathname: '/game', params: { onboardingStep: String(onboardingStep) } }} />;
  }
  const categoryIndex = CATEGORIES.findIndex((item) => item.id === categoryId);
  if (!isCategoryUnlocked(categoryIndex, completedLevels, CATEGORIES)) {
    return <Redirect href="/categories" />;
  }
  return <View style={styles.screen} testID="mode-selection">
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="mode-selection-background">
      <Image source={BACKGROUND} style={styles.fill} contentFit="cover" contentPosition="center"
        transition={0} accessible={false} />
    </View>
    <View style={[styles.content, { paddingTop: top, paddingBottom: bottom }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Play Classic"
        accessibilityHint="Start this category without a countdown"
        onPress={() => { playSound('tap'); start('classic'); }}
        style={({ pressed }) => [styles.button, { width: buttonWidth, aspectRatio: CLASSIC_RATIO, opacity: pressed ? 0.85 : 1 }]}
        testID="classic-mode-button">
        <Image source={CLASSIC} style={styles.fill} contentFit="contain" contentPosition="center"
          transition={0} accessible={false} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Play Time Mode"
        accessibilityHint="Start this category with the existing two-minute countdown"
        onPress={() => { playSound('tap'); start('time'); }}
        style={({ pressed }) => [styles.button, { width: buttonWidth, aspectRatio: TIME_RATIO, opacity: pressed ? 0.85 : 1 }]}
        testID="time-mode-button">
        <Image source={TIME_MODE} style={styles.fill} contentFit="contain" contentPosition="center"
          transition={0} accessible={false} />
      </Pressable>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 24, paddingHorizontal: 20 },
  button: { flexShrink: 0 },
});