import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Asset } from 'expo-asset';
import { type Dumpling } from '@/data/dumplings';
import { playDumplingSound } from '@/services/dumplingAudio';
import { startSound, stopSounds } from '@/services/audio';
import { ChestFrameRenderer } from './ChestFrameRenderer';
import { afterChestDisplay } from '@/services/chestEntryScheduling';
import {
  CHEST_ATLASES, CHEST_CLOSED, CHEST_DURATION_MS, CHEST_FPS, CHEST_FRAME_COUNT, CHEST_FRONT, DUMPLING_REVEAL_MS,
} from './chestAnimationData';

const CUE = 'chestOpening';
const FALLBACK_MS = 6000;

type Props = {
  opening: boolean;
  dumpling: Dumpling | null;
  onRevealed?: () => void;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
};

export function ChestReveal({ opening, dumpling, onRevealed, onPress, disabled, testID, accessibilityLabel }: Props) {
  const [closedReady, setClosedReady] = useState(false);
  const [closedRetry, setClosedRetry] = useState(0);
  const [ready, setReady] = useState(false);
  const [decoded, setDecoded] = useState(false);
  const [frontDecoded, setFrontDecoded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [frame, setFrame] = useState(0);
  const [showDumpling, setShowDumpling] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const started = useRef(false);
  const completed = useRef(false);
  const mounted = useRef(true);
  const cueStarted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useRef(onRevealed);
  cb.current = onRevealed;
  const dumplingRef = useRef(dumpling);
  dumplingRef.current = dumpling;
  const revealShown = useRef(false);
  const fadeAnimation = useRef<Animated.CompositeAnimation | null>(null);

  const load = useCallback(() => {
    setFailed(false);
    setReady(false);
    setDecoded(false);
    setFrontDecoded(false);
    Asset.loadAsync([...CHEST_ATLASES, CHEST_FRONT])
      .then(() => { if (mounted.current) setReady(true); })
      .catch(() => { if (mounted.current) setFailed(true); });
  }, []);

  const showReveal = () => {
    if (revealShown.current) return;
    revealShown.current = true;
    setShowDumpling(true);
    fadeAnimation.current = Animated.timing(fade, { toValue: 1, duration: 350, useNativeDriver: Platform.OS !== 'web' });
    fadeAnimation.current.start();
  };

  const finish = () => {
    if (!mounted.current || completed.current) return;
    completed.current = true;
    if (timer.current) clearTimeout(timer.current);
    if (fallback.current) clearTimeout(fallback.current);
    setFrame(CHEST_FRAME_COUNT - 1);
    if (!revealShown.current) { revealShown.current = true; setShowDumpling(true); }
    fadeAnimation.current?.stop();
    fade.setValue(1);
    stopSounds([CUE]);
    const d = dumplingRef.current;
    if (d) void playDumplingSound('rarityReveal', d.rarity);
    cb.current?.();
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useEffect(() => {
    mounted.current = true;
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active' && started.current && !completed.current) finishRef.current();
    });
    return () => {
      mounted.current = false;
      sub.remove();
      if (timer.current) clearTimeout(timer.current);
      if (fallback.current) clearTimeout(fallback.current);
      fadeAnimation.current?.stop();
      if (cueStarted.current) stopSounds([CUE]);
    };
  }, [load]);

  useEffect(() => {
    if (!closedReady) return;
    return afterChestDisplay(load);
  }, [closedReady, load]);

  useEffect(() => {
    if (!opening || !dumpling || !ready || !decoded || !frontDecoded || started.current) return;
    started.current = true;
    fallback.current = setTimeout(() => finishRef.current(), FALLBACK_MS);
    (async () => {
      cueStarted.current = true;
      try { await startSound(CUE); } catch { /* clock still runs */ }
      if (!mounted.current || completed.current) return;
      const t0 = Date.now();
      const tick = () => {
        if (!mounted.current || completed.current) return;
        const el = Date.now() - t0;
        setFrame(Math.min(CHEST_FRAME_COUNT - 1, Math.floor((el * CHEST_FPS) / 1000)));
        if (el >= DUMPLING_REVEAL_MS) showReveal();
        if (el >= CHEST_DURATION_MS) { finishRef.current(); return; }
        const next = (Math.floor((el * CHEST_FPS) / 1000) + 1) * 1000 / CHEST_FPS - el;
        timer.current = setTimeout(tick, Math.max(1, Math.ceil(Math.min(next, CHEST_DURATION_MS - el))));
      };
      tick();
    })();
  }, [opening, dumpling, ready, decoded, frontDecoded]);

  const interactive = !!onPress && !disabled && closedReady && ready && decoded && frontDecoded && !failed && !opening;
  return (
    <View style={styles.stage} testID="chest-stage">
      <Pressable
        onPress={interactive ? onPress : undefined}
        disabled={!interactive}
        accessibilityRole={onPress ? 'button' : 'image'}
        accessibilityLabel={accessibilityLabel ?? 'Treasure chest'}
        accessibilityState={{ disabled: !interactive }}
        testID={testID}
        style={styles.frame}
      >
        <View style={styles.frame} testID="chest-reveal-slot">
          {ready && <ChestFrameRenderer frame={frame} onReady={() => { if (mounted.current) setDecoded(true); }} onError={() => { if (mounted.current) { setFailed(true); setReady(false); setDecoded(false); } }} />}
          {showDumpling && dumpling && (
            <Animated.View style={[styles.dumpling, { opacity: fade }]} testID="chest-revealed-artwork" pointerEvents="none">
              <Image source={dumpling.asset} style={styles.fill} resizeMode="contain" />
            </Animated.View>
          )}
          {ready && <Image source={CHEST_FRONT} resizeMode="contain" style={[StyleSheet.absoluteFill, styles.fill, { opacity: showDumpling ? 1 : 0 }]} testID="chest-front-rim" onLoad={() => { if (mounted.current) setFrontDecoded(true); }} onError={() => { if (mounted.current) { setFailed(true); setReady(false); setFrontDecoded(false); } }} />}
          <Image key={closedRetry} source={CHEST_CLOSED} resizeMode="contain" fadeDuration={0}
            style={[StyleSheet.absoluteFill, styles.fill, { opacity: frame > 0 || completed.current ? 0 : 1 }]}
            testID="chest-closed-frame"
            onLoad={() => { if (mounted.current) setClosedReady(true); }}
            onError={() => { if (mounted.current) { setClosedReady(false); setFailed(true); } }} />
        </View>
      </Pressable>
      {failed && (
        <Pressable onPress={() => {
          if (closedReady) load();
          else {
            setFailed(false);
            setClosedRetry(count => count + 1);
          }
        }} accessibilityRole="button" testID="chest-retry" style={styles.retry}>
          <Text style={styles.retryText}>Chest could not load. Tap to retry</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { width: '100%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', maxWidth: 380, alignSelf: 'center' },
  frame: { width: '100%', height: '100%' },
  fill: { width: '100%', height: '100%' },
  dumpling: { position: 'absolute', width: '46%', height: '46%', left: '27%', top: '18%' },
  retry: { position: 'absolute', bottom: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.9)' },
  retryText: { fontFamily: 'Inter_700Bold', fontSize: 12, color: '#59686b' },
});
