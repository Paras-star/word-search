import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Image, type ImageRef } from 'expo-image';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { CHEST_FPS, CHEST_FRAME_COUNT } from './chestAnimationData';

type AtlasProps = {
  source: ImageRef; index: number; clock: SharedValue<number>;
  onLoad: (index: number) => void; onDisplay: (index: number) => void; onError: () => void;
};

function Atlas({ source, index, clock, onLoad, onDisplay, onError }: AtlasProps) {
  const motion = useAnimatedStyle(() => {
    const frame = Math.min(CHEST_FRAME_COUNT - 1, Math.floor(clock.value * CHEST_FPS / 1000));
    const tile = frame % 16;
    const column = tile % 4;
    const row = Math.floor(tile / 4);
    return {
      opacity: Math.floor(frame / 16) === index ? 1 : 0,
      // Percent offsets are relative to the clipped viewport, exactly one
      // viewport per tile. This avoids startup drift from a stale measured
      // width while Android lays out the transformed 4x atlas.
      left: column === 0 ? '0%' : `${-column * 100}%`,
      top: row === 0 ? '0%' : `${-row * 100}%`,
    };
  });
  return (
    <Animated.View style={[styles.atlas, motion]}>
      <Image source={source} style={styles.fill} contentFit="fill" transition={0}
        onLoad={() => onLoad(index)}
        // iOS renders decoded ImageRefs directly, bypassing loader onLoad.
        onDisplay={() => {
          onDisplay(index);
          if (Platform.OS === 'ios') onLoad(index);
        }}
        onError={onError} />
    </Animated.View>
  );
}

/** Bitmaps never change during playback; only UI-thread crop offsets/opacity do. */
export function ChestFrameRenderer({ atlases, clock, onLoad, onDisplay, onError }: {
  atlases: ImageRef[]; clock: SharedValue<number>;
  onLoad: (index: number) => void; onDisplay: (index: number) => void; onError: () => void;
}) {
  return (
    <View style={styles.viewport} pointerEvents="none" testID="chest-video-frames">
      {atlases.map((source, index) => <Atlas key={index} source={source} index={index}
        clock={clock} onLoad={onLoad} onDisplay={onDisplay} onError={onError} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { width: '100%', height: '100%', overflow: 'hidden' },
  atlas: { position: 'absolute', left: 0, top: 0, width: '400%', height: '400%' },
  fill: { width: '100%', height: '100%' },
});