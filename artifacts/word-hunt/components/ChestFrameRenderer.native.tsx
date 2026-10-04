import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image, type ImageRef } from 'expo-image';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { CHEST_FPS, CHEST_FRAME_COUNT } from './chestAnimationData';

type AtlasProps = { source: ImageRef; index: number; clock: SharedValue<number>; size: SharedValue<number> };

function Atlas({ source, index, clock, size }: AtlasProps) {
  const motion = useAnimatedStyle(() => {
    const frame = Math.min(CHEST_FRAME_COUNT - 1, Math.floor(clock.value * CHEST_FPS / 1000));
    const tile = frame % 16;
    return {
      opacity: Math.floor(frame / 16) === index ? 1 : 0,
      transform: [
        { translateX: -(tile % 4) * size.value },
        { translateY: -Math.floor(tile / 4) * size.value },
      ],
    };
  });
  return (
    <Animated.View style={[styles.atlas, motion]}>
      <Image source={source} style={styles.fill} contentFit="fill" transition={0} />
    </Animated.View>
  );
}

/** Bitmaps never change during playback; only UI-thread transforms/opacity do. */
export function ChestFrameRenderer({ atlases, clock, size }: {
  atlases: ImageRef[]; clock: SharedValue<number>; size: SharedValue<number>;
}) {
  return (
    <View style={styles.viewport} pointerEvents="none" testID="chest-video-frames">
      {atlases.map((source, index) => <Atlas key={index} source={source} index={index} clock={clock} size={size} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { width: '100%', height: '100%', overflow: 'hidden' },
  atlas: { position: 'absolute', left: 0, top: 0, width: '400%', height: '400%' },
  fill: { width: '100%', height: '100%' },
});