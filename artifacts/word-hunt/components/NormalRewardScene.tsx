import React, { type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type ImageSourcePropType } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type Dumpling, type DumplingRarity } from '@/data/dumplings';
import { homeColors } from '@/constants/homePalette';
import { ChestReveal } from './ChestReveal';
import { ChestScene, getChestSceneLayout } from './ChestScene';
import { CHEST_SCENERY_SOURCE, getPreparedChestScenery, prepareChestScenery } from '@/services/chestSceneryPreparation';

/** Same single-flight prepared scenery as ChestScene; original source only after preparation fails. */
function usePreparedScenerySource() {
  const [bg, setBg] = React.useState(() => ({ image: getPreparedChestScenery(), failed: false }));
  React.useEffect(() => {
    let active = true;
    void prepareChestScenery().then(image => { if (active) setBg({ image, failed: false }); })
      .catch(() => { if (active) setBg({ image: null, failed: true }); });
    return () => { active = false; };
  }, []);
  return bg.image ?? (bg.failed ? CHEST_SCENERY_SOURCE : undefined);
}

const BG_W = 937;
const BG_H = 1678;
export const BANNER_RATIO = 866 / 288;
export const COLLECTION_RATIO = 866 / 288;
export const CONTINUE_RATIO = 942 / 265;
const COLLECTION = require('../assets/images/home/collection-button.png');
const CONTINUE = require('../../../attached_assets/Continue_1795628061907.png');

/** Explicit, exhaustive rarity -> banner artwork mapping. */
export const RARITY_BANNERS: Record<DumplingRarity, ImageSourcePropType> = {
  Common: require('../../../attached_assets/Common_Transparent_Banner_1795631362659.png'),
  Uncommon: require('../../../attached_assets/Uncommon_Transparent_Banner_1795631362659.png'),
  Rare: require('../../../attached_assets/Rare_Transparent_Banner_1795631362661.png'),
  Epic: require('../../../attached_assets/Epic_Transparent_Banner_1795631362660.png'),
  Legendary: require('../../../attached_assets/Legendary_Transparent_Banner_1795631362661.png'),
};

export function getRarityBanner(rarity: DumplingRarity): ImageSourcePropType {
  switch (rarity) {
    case 'Common': return RARITY_BANNERS.Common;
    case 'Uncommon': return RARITY_BANNERS.Uncommon;
    case 'Rare': return RARITY_BANNERS.Rare;
    case 'Epic': return RARITY_BANNERS.Epic;
    case 'Legendary': return RARITY_BANNERS.Legendary;
    default: { const never: never = rarity; throw new Error(`Unknown rarity ${String(never)}`); }
  }
}

/** Central text panel as fractions of banner bounds: clears left emblem (~30%) and right leaves/frame. */
export const BANNER_NAME_PANEL = { left: 0.32, right: 0.17, top: 0.3, bottom: 0.3 } as const;

export function getBannerNameLayout(bannerWidth: number, name: string) {
  const w = bannerWidth / BANNER_RATIO;
  const panelW = bannerWidth * (1 - BANNER_NAME_PANEL.left - BANNER_NAME_PANEL.right);
  const panelH = w * (1 - BANNER_NAME_PANEL.top - BANNER_NAME_PANEL.bottom);
  const text = name.trim().toUpperCase();
  // RN Web does not reliably implement adjustsFontSizeToFit. Budget for bold
  // uppercase glyphs, tracking and side padding before rendering the real text.
  const units = [...text].reduce((total, char) =>
    total + (char === ' ' ? 0.35 : /[MW]/.test(char) ? 1 : /[IJLT]/.test(char) ? 0.6 : 0.78), 0);
  const tracking = Math.max(0, text.length - 1) * 0.35;
  const fontSize = Math.max(9, Math.min(panelH * 0.62, (panelW - tracking - 8) / Math.max(1, units)));
  return { left: bannerWidth * BANNER_NAME_PANEL.left, top: w * BANNER_NAME_PANEL.top, width: panelW, height: panelH, fontSize };
}

/** Artwork-space layout: a contain-fit scene box plus content positioned relative to the art. */
export function getNormalRewardLayout(availableWidth: number, footerHeight = 78) {
  const W = Math.max(1, Math.min(480, availableWidth));
  const artH = W * (BG_H / BG_W);
  const scene = getChestSceneLayout(W, artH);
  const bannerW = W * 0.74;
  const bannerH = bannerW / BANNER_RATIO;
  const titleBottom = artH * 0.158; // supplied title artwork ends here
  const bannerTop = Math.max(titleBottom, Math.min(scene.chestTop + scene.stage * 0.12 - bannerH - 2, titleBottom + 6));
  const buttonW = Math.min(W * 0.66, 340);
  const collectionTop = artH * 0.84; // beneath the pedestal base
  const collectionH = buttonW / COLLECTION_RATIO;
  const gap = Math.max(8, W * 0.025);
  const continueTop = collectionTop + collectionH + gap;
  const continueH = buttonW / CONTINUE_RATIO;
  const statsTop = continueTop + continueH + gap * 1.5;
  const statsH = 78;
  const totalH = Math.max(artH, statsTop + Math.max(statsH, footerHeight) + 24);
  return { W, artH, scene, bannerW, bannerH, bannerTop, buttonW, collectionTop, collectionH, continueTop, continueH, statsTop, totalH };
}

type Props = {
  dumpling: Dumpling | null; opening: boolean; revealed: boolean; loading: boolean; busy: boolean; collected: boolean;
  error: string | null; score: string; time: string; coins: string;
  onOpen: () => void; onRevealed: () => void; onCollection: () => void; onContinue: () => void; onHome: () => void;
  showActions?: boolean; showStats?: boolean; showHomeButton?: boolean;
  chestDisabled?: boolean;
  statusMessage?: string | null; statusTestID?: string; errorTestID?: string; sceneTestID?: string;
  chestTestID?: string; chestAccessibilityLabel?: string;
  collectionTestID?: string; continueTestID?: string;
  purchaseNote?: { isDuplicate: boolean; recoveryPending: boolean };
  retryAction?: ReactNode; retryContainerTestID?: string;
};

function Stat({ label, value, testID }: { label: string; value: string; testID: string }) {
  return <View style={styles.stat} accessible accessibilityLabel={`${label} ${value}`} testID={`${testID}-stat`}>
    <Text style={styles.statLabel} numberOfLines={2}>{label}</Text>
    <Text style={styles.statValue} numberOfLines={1} adjustsFontSizeToFit testID={testID}>{value}</Text>
  </View>;
}

export default function NormalRewardScene(p: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const top = Platform.OS === 'web' ? Math.max(67, insets.top) : insets.top;
  const bottom = Platform.OS === 'web' ? Math.max(34, insets.bottom) : insets.bottom;
  const L = getNormalRewardLayout(width - insets.left - insets.right, p.retryAction ? 150 : 78);
  const actionable = p.revealed && !p.loading && !p.busy && !!p.dumpling;
  const name = p.dumpling?.name ?? '';
  const nameLayout = getBannerNameLayout(L.bannerW, name);
  const side = (L.W - L.buttonW) / 2;
  const scenery = usePreparedScenerySource();
  const showActions = p.showActions ?? true;
  const showStats = p.showStats ?? true;
  const notes = [
    p.purchaseNote?.isDuplicate ? 'This dumpling is already in your Collection.' : null,
    p.purchaseNote?.recoveryPending ? 'The purchase is saved; local save recovery will retry automatically.' : null,
  ].filter((note): note is string => !!note);

  return <View style={styles.screen} testID={p.sceneTestID ?? 'normal-reward-scene'}>
    <ScrollView style={styles.screen} testID="reward-scroll" showsVerticalScrollIndicator={false}
      contentContainerStyle={{ alignItems: 'center', paddingTop: top, paddingBottom: bottom, paddingLeft: insets.left, paddingRight: insets.right }}>
      <View style={{ width: L.W, height: L.totalH, overflow: 'hidden' }}>
        {/* Mirrored continuation of the beach floor so the scene stays one piece below the artwork. */}
        {L.totalH > L.artH && <Image pointerEvents="none" source={scenery} accessible={false} transition={0} contentFit="fill"
          style={{ position: 'absolute', left: 0, top: L.artH, width: L.W, height: L.artH, transform: [{ scaleY: -1 }] }} />}
        <View style={{ position: 'absolute', left: 0, top: 0, width: L.W, height: L.artH }}>
          <ChestScene layout={L.scene}>
            <ChestReveal opening={p.opening} dumpling={p.dumpling} onRevealed={p.onRevealed} onPress={p.onOpen}
              disabled={p.chestDisabled ?? (p.loading || !p.dumpling || p.opening || p.revealed)}
              testID={p.chestTestID ?? 'reward-chest-tap'}
              accessibilityLabel={p.chestAccessibilityLabel ?? 'Tap the chest to reveal your reward'} />
          </ChestScene>
        </View>

        {p.showHomeButton !== false && <Pressable onPress={p.onHome} hitSlop={12} accessibilityRole="button" accessibilityLabel="Return home" style={styles.close} testID="reward-home">
          <Feather name="x" size={20} color={homeColors.ink} />
        </Pressable>}

        {p.statusMessage && <Text style={[styles.status, { top: Math.max(0, L.scene.chestTop - 22) }]}
          testID={p.statusTestID ?? 'reward-status'}>{p.statusMessage}</Text>}

        <View testID="reward-rarity-banner" accessibilityLabel={p.revealed && p.dumpling ? `${p.dumpling.rarity} ${name}` : 'Reward hidden'}
          style={{ position: 'absolute', left: (L.W - L.bannerW) / 2, top: L.bannerTop, width: L.bannerW, height: L.bannerH }}>
          {p.revealed && p.dumpling && <>
            <Image source={getRarityBanner(p.dumpling.rarity)} style={styles.fill} contentFit="contain" transition={250} accessible={false} />
            <View style={[styles.namePanel, { left: nameLayout.left, top: nameLayout.top, width: nameLayout.width, height: nameLayout.height }]}>
              <Text testID="reward-dumpling-name" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}
                style={[styles.name, { fontSize: nameLayout.fontSize }]}>{name.toUpperCase()}</Text>
            </View>
          </>}
        </View>

        {p.error && (p.retryAction
          ? <View style={[styles.retryArea, { top: L.statsTop, left: 16, right: 16 }]} testID={p.retryContainerTestID}>
            <ScrollView contentContainerStyle={styles.retryContent} showsVerticalScrollIndicator={false}>
              <Text style={styles.retryError} testID={p.errorTestID ?? 'reward-error'} accessibilityRole="alert">{p.error}</Text>
              {p.retryAction}
            </ScrollView>
          </View>
          : <Text style={[styles.error, { bottom: L.totalH - L.collectionTop + 8 }]}
            testID={p.errorTestID ?? 'reward-error'} accessibilityRole="alert">{p.error}</Text>)}

        {showActions && <Pressable testID={p.collectionTestID ?? 'reward-collection'} accessibilityRole="button" accessibilityLabel="Collection" disabled={!actionable}
          accessibilityState={{ disabled: !actionable }} onPress={p.onCollection}
          style={({ pressed }) => [styles.imgButton, { left: side, top: L.collectionTop, width: L.buttonW, height: L.collectionH, opacity: !actionable ? 0.5 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
          <Image source={COLLECTION} style={styles.fill} contentFit="contain" transition={0} accessible={false} />
        </Pressable>}
        {showActions && <Pressable testID={p.continueTestID ?? 'reward-continue'} accessibilityRole="button" accessibilityLabel="Continue" disabled={!actionable}
          accessibilityState={{ disabled: !actionable }} onPress={p.onContinue}
          style={({ pressed }) => [styles.imgButton, { left: side, top: L.continueTop, width: L.buttonW, height: L.continueH, opacity: !actionable ? 0.5 : pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
          <Image source={CONTINUE} style={styles.fill} contentFit="contain" transition={0} accessible={false} />
        </Pressable>}

        {showStats && <View style={[styles.stats, { position: 'absolute', top: L.statsTop, left: 16, right: 16 }]} testID="reward-result-stats">
          <Stat label="SCORE" value={p.score} testID="reward-score" />
          <View style={styles.divider} />
          <Stat label="TIME" value={p.time} testID="reward-time" />
          <View style={styles.divider} />
          <Stat label="COINS EARNED" value={p.coins} testID="reward-coins" />
        </View>}
        {notes.length > 0 && <View style={[styles.purchaseNote, { position: 'absolute', top: L.statsTop, left: 16, right: 16 }]}
          testID="treasure-reward-note" accessibilityRole="summary">
          {notes.map(note => <Text key={note} style={styles.purchaseNoteText}>{note}</Text>)}
        </View>}
      </View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: homeColors.background },
  fill: { width: '100%', height: '100%' },
  close: { position: 'absolute', top: 10, left: 12, width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,240,208,0.85)', zIndex: 2 },
  status: { position: 'absolute', left: 20, right: 20, color: '#c8322b', fontFamily: 'Inter_700Bold', fontSize: 15, textAlign: 'center', zIndex: 2 },
  namePanel: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  name: {
    color: homeColors.goldSoft, fontFamily: 'Inter_700Bold', letterSpacing: 0.35, textAlign: 'center',
    textShadowColor: homeColors.gold, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 3,
  },
  imgButton: { position: 'absolute' },
  error: { position: 'absolute', left: 20, right: 20, textAlign: 'center', color: homeColors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 12, backgroundColor: 'rgba(255,240,208,0.92)', borderRadius: 10, paddingVertical: 4, paddingHorizontal: 10, overflow: 'hidden' },
  retryArea: { position: 'absolute', maxHeight: 150, zIndex: 2, borderRadius: 16, backgroundColor: homeColors.background },
  retryContent: { padding: 12, gap: 10 },
  retryError: { color: '#c8322b', fontFamily: 'Inter_600SemiBold', fontSize: 13, textAlign: 'center' },
  // Identical to DailyCompletion stats styling.
  stats: {
    flexDirection: 'row', alignSelf: 'stretch', alignItems: 'center',
    backgroundColor: homeColors.goldSoft, borderColor: homeColors.gold, borderWidth: 2,
    borderRadius: 18, paddingVertical: 12, paddingHorizontal: 6,
  },
  stat: { flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 4, minWidth: 0 },
  statLabel: { color: homeColors.softInk, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.8, textAlign: 'center' },
  statValue: { color: homeColors.ink, fontFamily: 'Inter_700Bold', fontSize: 22, textAlign: 'center' },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: homeColors.tileBorder },
  purchaseNote: { alignItems: 'center', justifyContent: 'center', gap: 4 },
  purchaseNoteText: { color: homeColors.softInk, fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 17, textAlign: 'center' },
});
