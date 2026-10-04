import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { Dumpling } from '@/data/dumplings';
import { playDumplingSound } from '@/services/dumplingAudio';
import { playPreparedChestSound, prepareChestAudio, stopSounds } from '@/services/audio';
import { getPreparedChest, prepareChestAssets } from '@/services/chestPreparation';
import { ChestFrameRenderer } from './ChestFrameRenderer.native';
import { CHEST_DURATION_MS, DUMPLING_REVEAL_MS } from './chestAnimationData';

type Props = {
  opening: boolean; dumpling: Dumpling | null; onRevealed?: () => void;
  onPress?: () => void; disabled?: boolean; testID?: string; accessibilityLabel?: string;
};

export function ChestReveal({ opening, dumpling, onRevealed, onPress, disabled, testID, accessibilityLabel }: Props) {
  const [assets, setAssets] = useState(getPreparedChest);
  const [audioReady, setAudioReady] = useState(false);
  const [layoutReady, setLayoutReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const clock = useSharedValue(0);
  const size = useSharedValue(0);
  const started = useRef(false);
  const completed = useRef(false);
  const mounted = useRef(true);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useRef(onRevealed);
  cb.current = onRevealed;
  const reward = useRef(dumpling);
  reward.current = dumpling;
  const generation = useRef(0);

  const prepare = useCallback(() => {
    const current = ++generation.current;
    setFailed(false);
    setAudioReady(false);
    void Promise.all([prepareChestAssets(), prepareChestAudio()]).then(([ready]) => {
      if (!mounted.current || current !== generation.current) return;
      setAssets(ready);
      setAudioReady(true);
    }).catch(() => {
      if (mounted.current && current === generation.current) setFailed(true);
    });
  }, []);

  const finish = useCallback(() => {
    if (!mounted.current || completed.current || !started.current) return;
    completed.current = true;
    if (fallback.current) clearTimeout(fallback.current);
    cancelAnimation(clock);
    clock.value = CHEST_DURATION_MS;
    stopSounds(['chestOpening']);
    const d = reward.current;
    if (d) void playDumplingSound('rarityReveal', d.rarity);
    cb.current?.();
    // Rewind while the result is being viewed, not at the next opening tap.
    void prepareChestAudio().catch(() => {});
  }, [clock]);

  useEffect(() => {
    mounted.current = true;
    prepare();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        if (started.current && !completed.current) finish();
        else if (!started.current) prepare();
      } else if (!started.current) {
        generation.current++;
        setAudioReady(false);
      }
    });
    return () => {
      mounted.current = false;
      generation.current++;
      sub.remove();
      if (fallback.current) clearTimeout(fallback.current);
      cancelAnimation(clock);
      if (started.current && !completed.current) {
        stopSounds(['chestOpening']);
        void prepareChestAudio().catch(() => {});
      }
    };
  }, [clock, finish, prepare]);

  useLayoutEffect(() => {
    if (!opening || !dumpling || !assets || !audioReady || !layoutReady || started.current) return;
    started.current = true;
    playPreparedChestSound();
    // One native clock drives frames, artwork and rim together. No JS ticks,
    // frame loads, state updates, seeks, or waits occur between source stages.
    clock.value = withTiming(CHEST_DURATION_MS, { duration: CHEST_DURATION_MS, easing: Easing.linear }, finished => {
      if (finished) runOnJS(finish)();
    });
    fallback.current = setTimeout(finish, 6000);
  }, [opening, dumpling, assets, audioReady, layoutReady, clock, finish]);

  const artworkStyle = useAnimatedStyle(() => ({
    opacity: clock.value < DUMPLING_REVEAL_MS ? 0 : Math.min(1, (clock.value - DUMPLING_REVEAL_MS) / 350),
  }));
  const rimStyle = useAnimatedStyle(() => ({ opacity: clock.value >= DUMPLING_REVEAL_MS ? 1 : 0 }));
  const art = dumpling && assets?.dumplings.get(dumpling.id);
  const interactive = !!onPress && !disabled && !!assets && audioReady && layoutReady && !opening;

  return (
    <View style={styles.stage} testID="chest-stage">
      <Pressable disabled={!interactive} onPress={interactive ? onPress : undefined}
        accessibilityRole={onPress ? 'button' : 'image'} accessibilityLabel={accessibilityLabel ?? 'Treasure chest'}
        accessibilityState={{ disabled: !interactive }} testID={testID} style={styles.fill}
        onLayout={event => {
          const width = event.nativeEvent.layout.width;
          size.value = width;
          if (width > 0 && !layoutReady) setLayoutReady(true);
        }}>
        <View style={styles.fill} testID="chest-reveal-slot">
          {assets && <>
            <ChestFrameRenderer atlases={assets.atlases} clock={clock} size={size} />
            <Animated.View style={[styles.dumpling, artworkStyle]} testID="chest-revealed-artwork" pointerEvents="none">
              <Image source={art || assets.dumplings.values().next().value} style={styles.fill} contentFit="contain" transition={0} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, styles.fill, rimStyle]} pointerEvents="none" testID="chest-front-rim">
              <Image source={assets.front} style={styles.fill} contentFit="contain" transition={0} />
            </Animated.View>
          </>}
        </View>
      </Pressable>
      {failed && <Pressable onPress={prepare} style={styles.retry} testID="chest-retry" accessibilityRole="button">
        <Text style={styles.retryText}>Chest could not prepare. Tap to retry</Text>
      </Pressable>}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: '100%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', maxWidth: 380, alignSelf: 'center' },
  fill: { width: '100%', height: '100%' },
  dumpling: { position: 'absolute', width: '46%', height: '46%', left: '27%', top: '18%' },
  retry: { position: 'absolute', bottom: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.9)' },
  retryText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#59686b' },
});