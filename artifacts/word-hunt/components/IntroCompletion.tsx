import React from 'react';
import { Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { playSound } from '@/services/audio';

const BACKGROUND = require('../assets/images/backgrounds/mode-selection-background.png');
const NICE_WORK = require('../assets/images/Nice Work.png');
const NEXT = require('../assets/images/Next Panel.png');
const HOME = require('../assets/images/Home Panel.png');
const PANEL_RATIO = 654 / 382;
const NEXT_RATIO = 956 / 261;
const HOME_RATIO = 941 / 265;

export default function IntroCompletion({ onNext, onHome }: {
  onNext: () => void;
  onHome: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const top = Platform.OS === 'web' ? Math.max(67, insets.top) : insets.top;
  const bottom = Platform.OS === 'web' ? Math.max(34, insets.bottom) : insets.bottom;
  const availableHeight = Math.max(1, height - top - bottom - 32);
  const gap = Math.min(20, Math.max(10, availableHeight * 0.025));
  // Limit the entire image stack by height as well as width on short devices.
  const panelWidth = Math.max(1, Math.min(480, width - insets.left - insets.right - 32,
    (availableHeight - gap * 2) / (1 / PANEL_RATIO + 0.9 / NEXT_RATIO + 0.82 / HOME_RATIO)));
  return <View style={styles.screen} testID="intro-completion">
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="intro-completion-background">
      <Image source={BACKGROUND} style={styles.fill} contentFit="cover"
        contentPosition="center" transition={0} accessible={false} />
    </View>
    <View style={[styles.content, {
      paddingTop: top + 16, paddingBottom: bottom + 16,
      paddingLeft: insets.left + 16, paddingRight: insets.right + 16,
    }]}>
      <View style={[styles.main, { paddingBottom: gap }]}>
        <Image source={NICE_WORK} style={{ width: panelWidth, aspectRatio: PANEL_RATIO }}
          contentFit="contain" contentPosition="center" transition={0} accessible={false}
          testID="intro-nice-work" />
      </View>
      <View style={[styles.buttons, { gap }]}>
        <Pressable accessibilityRole="button" accessibilityLabel="Next"
          onPress={() => { playSound('tap'); onNext(); }}
          style={({ pressed }) => [styles.button, {
            width: panelWidth * 0.9, aspectRatio: NEXT_RATIO, opacity: pressed ? 0.85 : 1,
          }]} testID="intro-next">
          <Image source={NEXT} style={styles.fill} contentFit="contain"
            contentPosition="center" transition={0} accessible={false} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Home"
          onPress={() => { playSound('tap'); onHome(); }}
          style={({ pressed }) => [styles.button, {
            width: panelWidth * 0.82, aspectRatio: HOME_RATIO, opacity: pressed ? 0.85 : 1,
          }]} testID="intro-home">
          <Image source={HOME} style={styles.fill} contentFit="contain"
            contentPosition="center" transition={0} accessible={false} />
        </Pressable>
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  content: { flex: 1 },
  main: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  buttons: { alignItems: 'center', flexShrink: 0 },
  button: { flexShrink: 0 },
});
