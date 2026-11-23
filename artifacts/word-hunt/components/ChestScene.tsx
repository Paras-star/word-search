import React, { useState } from 'react';
import { Image, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';

const BG = require('@/assets/images/chests/chest-background.png');
const BG_W = 937;
const BG_H = 1678;

/** Exact artwork-space placement from the original 700-coin chest screen. */
export function getChestSceneLayout(W: number, H: number) {
  const cover = Math.max(W / BG_W, H / BG_H);
  const safeCover = W / cover >= BG_W * 0.7 && H / cover >= BG_H * 0.94;
  const scale = safeCover ? cover : Math.min(W / BG_W, H / BG_H);
  const imgW = BG_W * scale;
  const imgH = BG_H * scale;
  const imgX = (W - imgW) / 2;
  const imgY = (H - imgH) / 2;
  const backingScale = Math.max(W / BG_W, H / (BG_H * 0.12));
  const stage = Math.min(380, imgW * 0.46);
  const chestLeft = imgX + imgW * 0.5 - stage / 2;
  // The visible closed-frame base is y356/384, anchored to the pedestal.
  const chestTop = imgY + imgH * 0.548 - stage * (356 / 384);
  return { W, H, safeCover, imgW, imgH, imgX, imgY, backingScale, stage, chestLeft, chestTop };
}

type ChestSceneLayout = ReturnType<typeof getChestSceneLayout>;

export function useChestSceneLayout() {
  const win = useWindowDimensions();
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) setBox({ w: width, h: height });
  };
  return { layout: getChestSceneLayout(box?.w ?? win.width, box?.h ?? win.height), onLayout };
}

/** Shared scenery only: paid/free reward state and animation remain callers' own. */
export function ChestScene({ layout, children }: { layout: ChestSceneLayout; children: React.ReactNode }) {
  const { W, safeCover, imgW, imgH, imgX, imgY, backingScale, stage, chestLeft, chestTop } = layout;
  return (
    <>
      <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="chest-scene-background">
        {!safeCover && <Image accessible={false} source={BG} style={{ position: 'absolute', left: (W - BG_W * backingScale) / 2, top: -BG_H * 0.18 * backingScale, width: BG_W * backingScale, height: BG_H * backingScale }} />}
        <Image accessible={false} source={BG} style={{ position: 'absolute', left: imgX, top: imgY, width: imgW, height: imgH }} resizeMode="contain" testID="chest-scene-artwork" />
      </View>
      <View style={{ position: 'absolute', left: chestLeft, top: chestTop, width: stage, height: stage }} testID="chest-scene-placement">
        {children}
      </View>
    </>
  );
}
