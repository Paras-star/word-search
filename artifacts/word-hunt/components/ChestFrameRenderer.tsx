import React, { useRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { CHEST_ATLASES, CHEST_FRAME_COUNT } from './chestAnimationData';

type Props = { frame: number; onReady?: () => void; onError?: () => void };

/** Renders one exact extracted source frame from the transparent 4x4 atlases. */
export function ChestFrameRenderer({ frame, onReady, onError }: Props) {
  const loaded = useRef(new Set<number>());
  const f = Math.max(0, Math.min(CHEST_FRAME_COUNT - 1, Math.floor(frame)));
  const sheet = Math.floor(f / 16);
  const i = f % 16;
  const col = i % 4;
  const row = Math.floor(i / 4);
  return (
    <View style={styles.viewport} pointerEvents="none" testID="chest-video-frames" accessibilityLabel={`Chest frame ${f}`}>
      {CHEST_ATLASES.map((src, n) => (
        <Image
          key={n}
          source={src}
          resizeMode="stretch"
          fadeDuration={0}
          onLoad={() => {
            if (loaded.current.has(n)) return;
            loaded.current.add(n);
            if (loaded.current.size === CHEST_ATLASES.length) onReady?.();
          }}
          onError={onError}
          style={[styles.atlas, { opacity: n === sheet ? 1 : 0, left: `${-col * 100}%`, top: `${-row * 100}%` }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: { width: '100%', height: '100%', overflow: 'hidden' },
  atlas: { position: 'absolute', width: '400%', height: '400%' },
});
