import React, { useCallback, useEffect, useState } from 'react';
import { Alert, type LayoutChangeEvent, Image, Platform, Pressable, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen, CoinPill } from '@/components/GameUI';
import { AudioSettingsModal } from '@/components/AudioSettingsModal';
import { BrandLoading } from '@/components/BrandLoading';
import { homeColors } from '@/constants/homePalette';
import { useGame } from '@/context/GameProvider';
import { canOpenPrivacyOptions, showPrivacyOptions, subscribeToAds } from '@/services/ads';
import { playSound } from '@/services/audio';
import { createCoinReward, HOME_REWARDED_COINS } from '@/services/rewardedBenefits';
import { RewardedAdButton } from '@/components/RewardedAdButton';
import { useRewardedAd } from '@/hooks/useRewardedAd';
import { AdBanner } from '@/components/AdBanner';
import { warmNightBackground } from '@/services/nightBackgroundPreparation';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const buttonWidth = Math.max(160, Math.min(width - 40, 340, (height * 0.09) * (866 / 288)));
  const buttonHeight = Math.max(53, buttonWidth * (288 / 866));
  const { coins, hydrated, onboardingStep, awardCoins } = useGame();
  const coinAd = useRewardedAd('home-coins');
  const [privacyOptionsAvailable, setPrivacyOptionsAvailable] = useState(canOpenPrivacyOptions);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bounds, setBounds] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => subscribeToAds(() => setPrivacyOptionsAvailable(canOpenPrivacyOptions())), []);
  useEffect(() => {
    if (hydrated && onboardingStep < 6) warmNightBackground();
  }, [hydrated, onboardingStep]);
  useFocusEffect(useCallback(() => {
    if (Platform.OS !== 'android') return;
    // Modern Android is already edge-to-edge; these also enable transparency
    // on older hosts. Restore the previous bars when Home loses focus.
    const entry = StatusBar.pushStackEntry({
      translucent: true,
      backgroundColor: 'transparent',
      barStyle: 'dark-content',
    });
    return () => StatusBar.popStackEntry(entry);
  }, []));
  if (!hydrated) return <BrandLoading />;
  const play = () => {
    if (onboardingStep < 6) {
      warmNightBackground();
      router.push({ pathname: '/game', params: { onboardingStep: String(onboardingStep) } });
      return;
    }
    router.push('/categories');
  };
  const isAndroid = Platform.OS === 'android';
  const initialHeight = isAndroid ? Math.max(1, height - insets.bottom) : height;
  const art = fitArt(bounds?.w ?? width, bounds?.h ?? initialHeight);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (w > 0 && h > 0 && (w !== bounds?.w || h !== bounds?.h)) setBounds({ w, h });
  };
  const home = <View style={[styles.root, { backgroundColor: homeColors.background }]} onLayout={onLayout}>
    <View pointerEvents="none" style={styles.backgroundLayer}>
      {art.backing && <Image source={TROPICAL} style={[styles.art, art.backing]} />}
      <Image source={TROPICAL} style={[styles.art, art.main]} />
    </View>
    <Screen style={{ paddingTop: insets.top + 10, paddingBottom: (isAndroid ? 0 : insets.bottom) + 8, backgroundColor: 'transparent' }}>
    <View style={styles.topRow}>
      <View style={styles.leftCol}>
      <Pressable onPress={() => { playSound('tap'); setSettingsOpen(true); }} hitSlop={4} accessibilityRole="button" accessibilityLabel="Settings" testID="settings-button" style={({ pressed }) => [styles.gearButton, { opacity: pressed ? 0.7 : 1 }]}>
        <Text style={styles.calendarIcon}>⚙️</Text>
      </Pressable>
      <Pressable onPress={() => { playSound('tap'); router.push('/treasure-chest'); }} hitSlop={6} accessibilityRole="button" accessibilityLabel="Treasure Chest, 700 coins" testID="treasure-chest-button" style={({ pressed }) => [styles.chestButton, { opacity: pressed ? 0.7 : 1 }]}>
        <View pointerEvents="none" style={styles.chestImageSlot}>
          <Image source={require('../assets/images/chests/treasure-chest.png')} style={styles.chestImage} resizeMode="contain" />
        </View>
        {/* Invisible layout spacer preserves the original touch area, including font scaling. */}
        <Text accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.chestCue}>700</Text>
      </Pressable>
      <RewardedAdButton
        variant="artwork"
        source={require('../assets/images/rewards/free-coins.png')}
        artworkSize={64}
        label="FREE COINS"
        reward={`+${HOME_REWARDED_COINS} COINS`}
        loading={coinAd.loading}
        status={coinAd.status}
        onDismiss={coinAd.dismiss}
        onPress={() => { playSound('tap'); void coinAd.watch(createCoinReward(awardCoins)); }}
        accessibilityLabel={`Free coins: watch an ad for ${HOME_REWARDED_COINS} coins`}
        style={styles.freeCoins}
        testID="home-rewarded-coins-button"
      />
      </View>
      <View style={styles.topActions}>
        <CoinPill coins={coins} />
        <Pressable onPress={() => { playSound('tap'); router.push('/daily'); }} hitSlop={6} accessibilityRole="button" accessibilityLabel="Daily word hunt calendar" testID="daily-calendar-button" style={({ pressed }) => [styles.calendarButton, { opacity: pressed ? 0.7 : 1 }]}>
          <Text style={styles.calendarIcon}>🗓️</Text>
        </Pressable>
      </View>
    </View>
    <View style={styles.spacer} />
    <View style={styles.actions}>
      <Pressable onPress={() => { playSound('tap'); play(); }} accessibilityRole="button" accessibilityLabel="PLAY" testID="play-button" style={({ pressed }) => [styles.imageButton, { opacity: pressed ? 0.86 : 1 }]}>
        <Image source={require('../assets/images/home/play-button.png')} style={{ width: buttonWidth, height: buttonHeight }} resizeMode="contain" />
      </Pressable>
      <Pressable onPress={() => { playSound('tap'); router.push('/collection'); }} accessibilityRole="button" accessibilityLabel="COLLECTION" testID="collection-button" style={({ pressed }) => [styles.imageButton, { opacity: pressed ? 0.75 : 1 }]}>
        <Image source={require('../assets/images/home/collection-button.png')} style={{ width: buttonWidth, height: buttonHeight }} resizeMode="contain" />
      </Pressable>
      {privacyOptionsAvailable && <Pressable
        accessibilityRole="button"
        accessibilityLabel="Privacy choices"
        testID="privacy-options-button"
        onPress={() => { void showPrivacyOptions().then((shown) => {
          if (!shown) Alert.alert('Privacy choices unavailable', 'Please try again later.');
        }); }}
        style={styles.privacyButton}
      ><Text style={styles.privacyText}>PRIVACY CHOICES</Text></Pressable>}
    </View>
    <AudioSettingsModal visible={settingsOpen} onClose={() => { playSound('tap'); setSettingsOpen(false); }} />
    </Screen>
  </View>;
  // Keep the iOS/web tree unchanged. Android's footer takes real layout space,
  // so both the artwork's measured bounds and the controls end above the ad.
  if (!isAndroid) return home;
  return <View style={[styles.root, { backgroundColor: homeColors.background }]}>
    {home}
    <View style={{ flexShrink: 0, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }}>
      {/* The SDK reports its actual adaptive height; no ad means no reserved gap. */}
      <View testID="home-banner-slot" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <AdBanner />
      </View>
    </View>
  </View>;
}

const TROPICAL = require('../assets/images/home/tropical.png');
const ART_W = 1140;
const ART_H = 2473;
// Preserve the full width, including edge characters, and the title-to-character span.
const KEEP_X0 = 0, KEEP_X1 = ART_W;
const KEEP_Y0 = 480, KEEP_Y1 = 1850;
// Lower scenery only; all title, board, and character pixels are above this strip.
const SAND_Y0 = 1900;

type Rect = { width: number; height: number; left: number; top: number };

// w/h are the measured Home route bounds (onLayout), falling back to the window size.
// 1) Try proportional cover; keep it only if the full width (tall screens) or the
//    title-to-character span (wide screens) stays inside the visible crop, focal-positioned.
// 2) Otherwise scale the whole illustration to fit (contain) and fill the exposed edge
//    strips with the same art zoomed onto its lower sand, so no title/board duplicates.
function fitArt(w: number, h: number): { main: Rect; backing?: Rect } {
  const s = Math.max(w / ART_W, h / ART_H);
  const dw = ART_W * s, dh = ART_H * s;
  if (w / h <= ART_W / ART_H) {
    const left = Math.min(0, Math.max(w - dw, w / 2 - ((KEEP_X0 + KEEP_X1) / 2) * s));
    if (-left <= KEEP_X0 * s && left + KEEP_X1 * s <= w) return { main: { width: dw, height: dh, left, top: 0 } };
  } else {
    const top = Math.min(0, Math.max(h - dh, h / 2 - ((KEEP_Y0 + KEEP_Y1) / 2) * s));
    if (-top <= KEEP_Y0 * s && top + KEEP_Y1 * s <= h) return { main: { width: dw, height: dh, left: 0, top } };
  }
  const c = Math.min(w / ART_W, h / ART_H);
  const sb = Math.max(w / ART_W, h / (ART_H - SAND_Y0));
  return {
    main: { width: ART_W * c, height: ART_H * c, left: (w - ART_W * c) / 2, top: (h - ART_H * c) / 2 },
    backing: { width: ART_W * sb, height: ART_H * sb, left: (w - ART_W * sb) / 2, top: h - ART_H * sb },
  };
}

const styles = StyleSheet.create({
  topRow: { minHeight: 84, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  gearButton: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: homeColors.tileBorder, backgroundColor: homeColors.tile, alignItems: 'center', justifyContent: 'center' },
  leftCol: { alignItems: 'flex-start', gap: 6, paddingBottom: 4 },
  chestButton: { minWidth: 44, height: 40, paddingHorizontal: 6, borderWidth: 1, borderColor: 'transparent', flexDirection: 'row', alignItems: 'center', gap: 3 },
  chestImageSlot: { width: 26, height: 26, overflow: 'visible' },
  chestImage: { position: 'absolute', width: 50, height: 50, left: -12, top: -12 },
  chestCue: { opacity: 0, color: homeColors.gold, fontFamily: 'Inter_700Bold', fontSize: 11 },
  freeCoins: { marginLeft: -10, marginTop: -6 },
  topActions: { alignItems: 'center', gap: 4 },
  calendarButton: { width: 42, height: 40, borderRadius: 13, borderWidth: 1, borderColor: homeColors.tileBorder, backgroundColor: homeColors.tile, alignItems: 'center', justifyContent: 'center' },
  calendarIcon: { fontSize: 19 },
  root: { flex: 1 },
  backgroundLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  art: { position: 'absolute' },
  spacer: { flex: 1 },
  actions: { gap: 12 },
  imageButton: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  privacyButton: { minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  privacyText: { color: homeColors.softInk, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
});