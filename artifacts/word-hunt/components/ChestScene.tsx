import React, { useEffect, useState } from 'react';
import { StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { Image } from 'expo-image';
import { CHEST_SCENERY_SOURCE, getPreparedChestScenery, prepareChestScenery } from '@/services/chestSceneryPreparation';

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
  const [background, setBackground] = useState(() => ({
    image: getPreparedChestScenery(),
    failed: false,
  }));
  useEffect(() => {
    let active = true;
    // Direct links and free rewards also share this single-flight loader.
    // No original-source request competes with preparation while pending.
    void prepareChestScenery().then(image => {
      if (active) setBackground({ image, failed: false });
    }).catch(error => {
      console.warn('[Word Hunt chest] Scenery preparation failed; using the source image.', error);
      if (active) setBackground({ image: null, failed: true });
    });
    return () => { active = false; };
  }, []);
  const source = background.image ?? (background.failed ? CHEST_SCENERY_SOURCE : undefined);
  const { W, safeCover, imgW, imgH, imgX, imgY, backingScale, stage, chestLeft, chestTop } = layout;
  return (
    <>
      <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="chest-scene-background">
        {!safeCover && <Image accessible={false} source={source} contentFit="cover" contentPosition="center" transition={0} style={{ position: 'absolute', left: (W - BG_W * backingScale) / 2, top: -BG_H * 0.18 * backingScale, width: BG_W * backingScale, height: BG_H * backingScale }} />}
        <Image accessible={false} source={source} style={{ position: 'absolute', left: imgX, top: imgY, width: imgW, height: imgH }} contentFit="contain" contentPosition="center" transition={0} testID="chest-scene-artwork" />
      </View>
      <View style={{ position: 'absolute', left: chestLeft, top: chestTop, width: stage, height: stage }} testID="chest-scene-placement">
        {children}
      </View>
    </>
  );
}
