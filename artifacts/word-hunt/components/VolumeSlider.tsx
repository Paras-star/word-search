import React, { useRef, useState } from 'react';
import { PanResponder, Platform, StyleSheet, Text, View } from 'react-native';
import { homeColors } from '@/constants/homePalette';

type Props = { label: string; icon: string; value: number; onChange: (v: number) => void; disabled?: boolean; testID: string };
const clamp = (n: number) => Math.min(1, Math.max(0, n));
const THUMB = 28;

export function VolumeSlider({ label, icon, value, onChange, disabled, testID }: Props) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const cb = useRef({ onChange, disabled });
  cb.current = { onChange, disabled };
  const startX = useRef(0);
  const pct = Math.round(clamp(value) * 100);
  const setFrom = (x: number) => {
    const span = widthRef.current - THUMB;
    if (cb.current.disabled || span <= 0) return;
    cb.current.onChange(Math.round(clamp((x - THUMB / 2) / span) * 100) / 100);
  };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !cb.current.disabled,
    onMoveShouldSetPanResponder: () => !cb.current.disabled,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => { startX.current = e.nativeEvent.locationX; setFrom(startX.current); },
    onPanResponderMove: (_e, g) => setFrom(startX.current + g.dx),
  })).current;
  const step = (d: number) => { if (!disabled) onChange(Math.round(clamp(value + d) * 100) / 100); };
  const webKeys = Platform.OS === 'web' ? ({
    tabIndex: disabled ? -1 : 0,
    onKeyDown: (e: any) => {
      const k = e.key;
      if (k === 'ArrowRight' || k === 'ArrowUp') { e.preventDefault(); step(0.05); }
      else if (k === 'ArrowLeft' || k === 'ArrowDown') { e.preventDefault(); step(-0.05); }
      else if (k === 'Home') { e.preventDefault(); step(-1); }
      else if (k === 'End') { e.preventDefault(); step(1); }
    },
  } as any) : {};
  return <View style={[styles.wrap, disabled && { opacity: 0.5 }]}>
    <View style={styles.head}>
      <Text style={styles.label}>{icon}  {label}</Text>
      <Text style={styles.pct}>{pct}%</Text>
    </View>
    <View
      testID={testID}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: pct, text: `${pct} percent` }}
      accessibilityState={{ disabled: !!disabled }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 0.05 : e.nativeEvent.actionName === 'decrement' ? -0.05 : 0)}
      onLayout={(e) => { widthRef.current = e.nativeEvent.layout.width; setWidth(e.nativeEvent.layout.width); }}
      style={styles.touch}
      {...pan.panHandlers}
      {...webKeys}
    >
      <View style={styles.track} pointerEvents="none">
        <View style={[styles.fill, { width: THUMB / 2 + clamp(value) * Math.max(0, width - THUMB) }]} />
      </View>
      <View pointerEvents="none" style={[styles.thumb, { left: clamp(value) * Math.max(0, width - THUMB) }]} />
    </View>
    <View style={styles.ends}><Text style={styles.end}>Low</Text><Text style={styles.end}>High</Text></View>
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 4 },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: homeColors.ink, fontFamily: 'Inter_700Bold', fontSize: 15 },
  pct: { color: homeColors.gold, fontFamily: 'Inter_700Bold', fontSize: 15 },
  touch: { height: 48, justifyContent: 'center' },
  track: { height: 10, borderRadius: 5, backgroundColor: homeColors.tileBorder, overflow: 'hidden' },
  fill: { height: 10, backgroundColor: homeColors.teal },
  thumb: { position: 'absolute', top: 10, width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: homeColors.tile, borderWidth: 3, borderColor: homeColors.gold },
  ends: { flexDirection: 'row', justifyContent: 'space-between' },
  end: { color: homeColors.softInk, fontFamily: 'Inter_500Medium', fontSize: 12 },
});
