import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton, SoftButton } from '@/components/GameUI';
import { ChestReveal } from '@/components/ChestReveal';
import { ChestScene, useChestSceneLayout } from '@/components/ChestScene';
import { DUMPLING_BY_ID, RARITY_PRESENTATION, type Dumpling } from '@/data/dumplings';
import { homeColors } from '@/constants/homePalette';
import { useGame } from '@/context/GameProvider';
import { stopDumplingSounds } from '@/services/dumplingAudio';
import { TREASURE_CHEST_COST } from '@/services/treasureChest';

type Phase = 'ready' | 'processing' | 'animating' | 'done';

export default function TreasureChestScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const game = useGame();
  const { coins, hydrated } = game;
  const requestId = useRef(`chest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`).current;
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const purchased = useRef(false);
  const [phase, setPhase] = useState<Phase>('ready');
  const [error, setError] = useState<string | null>(null);
  const [dumpling, setDumpling] = useState<Dumpling | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const blocked = phase === 'processing' || phase === 'animating';
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;

  useEffect(() => {
    // The idle design has no back button. iOS needs its native back gesture;
    // keep it unavailable only while a purchase/reveal must not be interrupted.
    if (Platform.OS === 'ios') navigation.setOptions({ gestureEnabled: !blocked });
  }, [blocked, navigation]);

  useEffect(() => {
    mounted.current = true;
    const sub = Platform.OS !== 'web'
      ? BackHandler.addEventListener('hardwareBackPress', () => blockedRef.current)
      : null;
    const unsub = navigation.addListener('beforeRemove', (e: { preventDefault: () => void }) => {
      if (blockedRef.current) e.preventDefault();
    });
    return () => { mounted.current = false; sub?.remove(); unsub(); stopDumplingSounds(); };
  }, [navigation]);

  const canBuy = hydrated && coins >= TREASURE_CHEST_COST && phase === 'ready' && !purchased.current;

  const open = async () => {
    if (inFlight.current || purchased.current || !canBuy) return;
    inFlight.current = true;
    blockedRef.current = true;
    setError(null);
    setPhase('processing');
    try {
      const result = await game.purchaseTreasureChest(requestId);
      purchased.current = true;
      if (!mounted.current) return;
      const d = DUMPLING_BY_ID[result.reward.dumplingId];
      setIsDuplicate(result.isDuplicate);
      setRecovery(result.recoveryPending);
      setDumpling(d ?? null);
      setPhase(d ? 'animating' : 'done');
    } catch (cause) {
      if (!mounted.current) return;
      setError(cause instanceof Error ? cause.message : 'The purchase could not be confirmed. Please retry safely.');
      blockedRef.current = false;
      setPhase('ready');
      setConfirming(true);
    } finally {
      inFlight.current = false;
    }
  };

  const onRevealed = useCallback(() => {
    if (!mounted.current) return;
    blockedRef.current = false;
    setPhase('done');
  }, []);
  const leave = () => { if (!blockedRef.current) router.canGoBack() ? router.back() : router.replace('/'); };
  const p = RARITY_PRESENTATION[dumpling?.rarity ?? 'Common'];
  const done = phase === 'done' && dumpling;

  const { layout, onLayout } = useChestSceneLayout();
  const { H, imgY, imgH, chestTop, stage } = layout;
  const showNeed = hydrated && phase === 'ready' && coins < TREASURE_CHEST_COST;

  return (
    <View style={styles.screen} onLayout={onLayout}>
      <ChestScene layout={layout}>
        <ChestReveal opening={phase === 'animating' || phase === 'done'} dumpling={dumpling} onRevealed={onRevealed} onPress={() => setConfirming(true)} disabled={!canBuy} testID="treasure-chest-tap" accessibilityLabel={`Tap the chest to open for ${TREASURE_CHEST_COST} coins`} />
      </ChestScene>
      {showNeed && (
        <Text style={[styles.need, { top: Math.max(insets.top + 8, imgY + imgH * 0.245) }]} testID="treasure-need">{TREASURE_CHEST_COST} coins required. You need {TREASURE_CHEST_COST - coins} more.</Text>
      )}
      {done && (
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 14, maxHeight: Math.max(220, H - (chestTop + stage) + 8) }]}>
          <ScrollView contentContainerStyle={styles.sheetContent} showsVerticalScrollIndicator={false}>
            <Text style={[styles.kicker, { color: p.glow }]}>{dumpling.rarity.toUpperCase()}</Text>
            <Text style={styles.title} testID="treasure-result-name">{dumpling.name}</Text>
            <Text style={styles.copy}>
              {isDuplicate
                ? 'Duplicate recorded. You already collected this dumpling, so your Collection stays as it was.'
                : 'Added to your Collection.'}
            </Text>
            <Text style={styles.spent} testID="treasure-spent">{TREASURE_CHEST_COST} coins spent on a Treasure Chest</Text>
            {recovery && <Text style={styles.copy}>Your purchase and reward are safely saved. Local save recovery will retry automatically.</Text>}
            <View style={styles.actions}>
              <PrimaryButton onPress={() => router.replace(isDuplicate ? '/collection' : { pathname: '/collection', params: { newDumplingId: dumpling.id } })} testID="treasure-collection" style={styles.btn}>VIEW COLLECTION</PrimaryButton>
              <SoftButton onPress={leave} testID="treasure-leave-done" style={styles.soft}>DONE</SoftButton>
            </View>
          </ScrollView>
        </View>
      )}
      <Modal visible={confirming} transparent animationType={Platform.OS === 'web' ? 'fade' : 'none'} onRequestClose={() => setConfirming(false)}>
        <View style={styles.backdrop}>
          <View style={styles.dialog} testID="treasure-confirmation">
            <Text style={styles.title}>{TREASURE_CHEST_COST} coins</Text>
            <Text style={styles.copy}>Open the Treasure Chest for one surprise dumpling?</Text>
            {error && <Text style={styles.warn} accessibilityRole="alert" testID="treasure-error">{error}</Text>}
            <View style={styles.actions}>
              <PrimaryButton onPress={() => { setConfirming(false); void open(); }} disabled={!canBuy} suppressClickSound testID="treasure-confirm" style={styles.btn}>CONFIRM {TREASURE_CHEST_COST} coins</PrimaryButton>
              <SoftButton onPress={() => setConfirming(false)} testID="treasure-cancel" style={styles.soft}>CANCEL</SoftButton>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const NEED_RED = '#c8322b';

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(60,50,40,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 360, borderRadius: 24, backgroundColor: homeColors.background, padding: 22, alignItems: 'center' },
  screen: { flex: 1, backgroundColor: homeColors.background, overflow: 'hidden' },
  need: { position: 'absolute', left: 20, right: 20, color: NEED_RED, fontFamily: 'Inter_700Bold', fontSize: 15, textAlign: 'center' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: homeColors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  sheetContent: { alignItems: 'center', paddingHorizontal: 22, paddingTop: 18 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.6, marginBottom: 6 },
  title: { color: homeColors.ink, fontFamily: 'Inter_700Bold', fontSize: 27, textAlign: 'center', letterSpacing: -0.5 },
  copy: { color: homeColors.softInk, fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8, maxWidth: 340 },
  spent: { color: homeColors.gold, fontFamily: 'Inter_700Bold', fontSize: 13, marginTop: 10 },
  warn: { color: NEED_RED, fontFamily: 'Inter_600SemiBold', fontSize: 13, textAlign: 'center', marginTop: 10 },
  actions: { width: '100%', gap: 10, marginTop: 16 },
  btn: { width: '100%', backgroundColor: homeColors.teal },
  soft: { width: '100%', backgroundColor: homeColors.tile, borderColor: homeColors.tealBorder },
});
