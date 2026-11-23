import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { cancelAnimation, Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import type { Dumpling } from '@/data/dumplings';
import { playDumplingSound } from '@/services/dumplingAudio';
import { playPreparedChestSound, prepareChestAudio, stopSounds } from '@/services/audio';
import { getPreparedChest, getPreparedClosedChest, prepareChestAssets } from '@/services/chestPreparation';
import { ChestFrameRenderer } from './ChestFrameRenderer.native';
import { afterChestDisplay } from '@/services/chestEntryScheduling';
import { CHEST_CLOSED, CHEST_DURATION_MS, DUMPLING_REVEAL_MS } from './chestAnimationData';

type Props = {
  opening: boolean; dumpling: Dumpling | null; onRevealed?: () => void;
  onPress?: () => void; disabled?: boolean; testID?: string; accessibilityLabel?: string;
};

export function ChestReveal({ opening, dumpling, onRevealed, onPress, disabled, testID, accessibilityLabel }: Props) {
  const [assets, setAssets] = useState(getPreparedChest);
  const [audioReady, setAudioReady] = useState(false);
  const [layoutReady, setLayoutReady] = useState(false);
  const [closedReady, setClosedReady] = useState(false);
  const [closedRetry, setClosedRetry] = useState(0);
  const [rendererCount, setRendererCount] = useState(0);
  const [loadedCount, setLoadedCount] = useState(0);
  const [failed, setFailed] = useState(false);
  const clock = useSharedValue(0);
  const size = useSharedValue(0);
  const started = useRef(false);
  const completed = useRef(false);
  const mounted = useRef(true);
  const closedReadyRef = useRef(closedReady);
  closedReadyRef.current = closedReady;
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useRef(onRevealed);
  cb.current = onRevealed;
  const reward = useRef(dumpling);
  reward.current = dumpling;
  const generation = useRef(0);
  const rendererEpoch = useRef(0);
  const rendererGeneration = rendererEpoch.current;
  const rendererReady = !!assets && loadedCount === assets.atlases.length;

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
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        if (started.current && !completed.current) finish();
        else if (!started.current && closedReadyRef.current) prepare();
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

  useEffect(() => {
    if (!closedReady) return;
    return afterChestDisplay(prepare);
  }, [closedReady, prepare]);

  useEffect(() => {
    if (!assets || !audioReady || !closedReady || !layoutReady || failed || rendererReady) return;
    // First paint is just the small, decoded closed frame. Mount one large
    // native image per idle turn only AFTER that image has loaded. Keep the
    // closed frame on top throughout; no five-texture entry-time mount burst.
    const idle = requestIdleCallback(() => {
      setRendererCount(Math.min(assets.atlases.length, loadedCount + 1));
    });
    return () => cancelIdleCallback(idle);
  }, [assets, audioReady, closedReady, layoutReady, failed, rendererReady, loadedCount]);

  const onAtlasLoaded = useCallback((index: number) => {
    if (mounted.current) setLoadedCount(count => Math.max(count, index + 1));
  }, []);

  useLayoutEffect(() => {
    if (!opening || !dumpling || !assets || !audioReady || !layoutReady || !rendererReady || failed || started.current) return;
    started.current = true;
    playPreparedChestSound();
    // One native clock drives frames, artwork and rim together. No JS ticks,
    // frame loads, state updates, seeks, or waits occur between source stages.
    clock.value = withTiming(CHEST_DURATION_MS, { duration: CHEST_DURATION_MS, easing: Easing.linear }, finished => {
      if (finished) runOnJS(finish)();
    });
    fallback.current = setTimeout(finish, 6000);
  }, [opening, dumpling, assets, audioReady, layoutReady, rendererReady, failed, clock, finish]);

  const artworkStyle = useAnimatedStyle(() => ({
    opacity: clock.value < DUMPLING_REVEAL_MS ? 0 : Math.min(1, (clock.value - DUMPLING_REVEAL_MS) / 350),
  }));
  const rimStyle = useAnimatedStyle(() => ({ opacity: clock.value >= DUMPLING_REVEAL_MS ? 1 : 0 }));
  const closedStyle = useAnimatedStyle(() => ({ opacity: clock.value > 0 ? 0 : 1 }));
  const art = dumpling && assets?.dumplings.get(dumpling.id);
  const interactive = !!onPress && !disabled && !!assets && audioReady && layoutReady && closedReady && rendererReady && !failed && !opening;

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
          {assets && rendererCount > 0 && <>
            <ChestFrameRenderer atlases={assets.atlases.slice(0, rendererCount)} clock={clock} size={size}
              onLoad={index => {
                if (mounted.current && rendererGeneration === rendererEpoch.current) onAtlasLoaded(index);
              }} onError={() => {
                if (mounted.current && rendererGeneration === rendererEpoch.current) setFailed(true);
              }} />
            <Animated.View style={[styles.dumpling, artworkStyle]} testID="chest-revealed-artwork" pointerEvents="none">
              <Image source={art || assets.dumplings.values().next().value} style={styles.fill} contentFit="contain" transition={0} />
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, styles.fill, rimStyle]} pointerEvents="none" testID="chest-front-rim">
              <Image source={assets.front} style={styles.fill} contentFit="contain" transition={0} />
            </Animated.View>
          </>}
          <Animated.View style={[StyleSheet.absoluteFill, styles.fill, closedStyle]}
            pointerEvents="none" testID="chest-closed-frame">
            <Image key={closedRetry} source={getPreparedClosedChest() ?? CHEST_CLOSED} style={styles.fill}
              contentFit="contain" transition={0} onDisplay={() => setClosedReady(true)}
              onError={() => { setClosedReady(false); setFailed(true); }} />
          </Animated.View>
        </View>
      </Pressable>
      {failed && <Pressable onPress={() => {
        setFailed(false);
        rendererEpoch.current++;
        setRendererCount(0);
        setLoadedCount(0);
        setClosedRetry(count => count + 1);
        if (closedReady) prepare();
      }} style={styles.retry} testID="chest-retry" accessibilityRole="button">
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