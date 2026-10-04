import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton, SoftButton, CoinPill } from '@/components/GameUI';
import { ChestReveal } from '@/components/ChestReveal';
import { DUMPLING_BY_ID, RARITY_PRESENTATION, type Dumpling } from '@/data/dumplings';
import { homeColors } from '@/constants/homePalette';
import { useGame } from '@/context/GameProvider';
import { playSound } from '@/services/audio';
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

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => { playSound('tap'); leave(); }} disabled={blocked} hitSlop={12} accessibilityRole="button" accessibilityLabel="Leave Treasure Chest" testID="treasure-leave" style={{ opacity: blocked ? 0.35 : 1 }}>
          <Feather name="arrow-left" size={24} color={homeColors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>TREASURE CHEST</Text>
        <CoinPill coins={coins} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {(phase === 'animating' || phase === 'done') && <Text style={styles.spent} testID="treasure-spent">{TREASURE_CHEST_COST} coins spent · Treasure Chest</Text>}
        <ChestReveal opening={phase === 'animating' || phase === 'done'} dumpling={dumpling} onRevealed={onRevealed} onPress={() => setConfirming(true)} disabled={!canBuy} testID="treasure-chest-tap" accessibilityLabel={`Tap the chest to open for ${TREASURE_CHEST_COST} coins`} />
        <View style={styles.copyBlock}>
          {done ? (
            <>
              <Text style={[styles.kicker, { color: p.glow }]}>{dumpling.rarity.toUpperCase()}</Text>
              <Text style={styles.title} testID="treasure-result-name">{dumpling.name}</Text>
              <Text style={styles.copy}>
                {isDuplicate
                  ? 'Duplicate recorded. You already collected this dumpling, so your Collection stays as it was.'
                  : 'Added to your Collection.'}
              </Text>
              <Text style={styles.spent}>{TREASURE_CHEST_COST} coins spent on a Treasure Chest</Text>
              {recovery && <Text style={styles.copy}>Your purchase and reward are safely saved. Local save recovery will retry automatically.</Text>}
            </>
          ) : (
            <>
              <Text style={styles.title}>Open a Treasure Chest</Text>
              <Text style={styles.copy}>Spend {TREASURE_CHEST_COST} coins for one surprise dumpling. It joins your Collection right away.</Text>
              <View style={styles.costRow}>
                <View style={styles.costBox}><Text style={styles.costLabel}>COST</Text><Text style={styles.costValue}>{TREASURE_CHEST_COST}</Text></View>
                <View style={styles.costBox}><Text style={styles.costLabel}>BALANCE</Text><Text style={styles.costValue}>{hydrated ? coins : '...'}</Text></View>
              </View>
              {hydrated && coins < TREASURE_CHEST_COST && phase === 'ready' && (
                <Text style={styles.warn}>{TREASURE_CHEST_COST} coins required. You need {TREASURE_CHEST_COST - coins} more.</Text>
              )}
            </>
          )}
          {error && <Text style={styles.warn} accessibilityRole="alert">{error}</Text>}
        </View>
        <View style={styles.actions}>
          {phase === 'processing' && <Text style={styles.copy}>Saving purchase...</Text>}
          {phase === 'ready' && !done && <Text style={styles.copy}>{error ? 'Tap the chest to try again.' : 'Tap the chest to open it.'}</Text>}
          {phase === 'animating' && <Text style={styles.copy}>Opening your chest...</Text>}
          {done && (
            <>
              <PrimaryButton onPress={() => router.replace(isDuplicate ? '/collection' : { pathname: '/collection', params: { newDumplingId: dumpling.id } })} testID="treasure-collection" style={styles.btn}>VIEW COLLECTION</PrimaryButton>
              <SoftButton onPress={leave} testID="treasure-leave-done" style={styles.soft}>DONE</SoftButton>
            </>
          )}
          {phase === 'ready' && <SoftButton onPress={leave} style={styles.soft}>NOT NOW</SoftButton>}
        </View>
      </ScrollView>
      <Modal visible={confirming} transparent animationType={Platform.OS === 'web' ? 'fade' : 'none'} onRequestClose={() => setConfirming(false)}>
        <View style={styles.backdrop}>
          <View style={styles.dialog} testID="treasure-confirmation">
            <Text style={styles.title}>{TREASURE_CHEST_COST} coins</Text>
            <Text style={styles.copy}>Open the Treasure Chest for one surprise dumpling?</Text>
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

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(60,50,40,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 360, borderRadius: 24, backgroundColor: homeColors.background, padding: 22, alignItems: 'center' },
  screen: { flex: 1, backgroundColor: homeColors.background, paddingHorizontal: 18 },
  topBar: { height: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topTitle: { color: homeColors.ink, fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 1.5 },
  content: { alignItems: 'center', paddingBottom: 24 },
  copyBlock: { alignItems: 'center', paddingHorizontal: 10, marginTop: 6 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.6, marginBottom: 6 },
  title: { color: homeColors.ink, fontFamily: 'Inter_700Bold', fontSize: 27, textAlign: 'center', letterSpacing: -0.5 },
  copy: { color: homeColors.softInk, fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 8, maxWidth: 340 },
  spent: { color: homeColors.gold, fontFamily: 'Inter_700Bold', fontSize: 13, marginTop: 10 },
  costRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  costBox: { minWidth: 120, borderRadius: 16, borderWidth: 1, borderColor: homeColors.tileBorder, backgroundColor: homeColors.tile, paddingVertical: 10, alignItems: 'center' },
  costLabel: { color: homeColors.softInk, fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.1 },
  costValue: { color: homeColors.gold, fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 3 },
  warn: { color: homeColors.gold, fontFamily: 'Inter_600SemiBold', fontSize: 13, textAlign: 'center', marginTop: 10 },
  actions: { width: '100%', gap: 10, marginTop: 16 },
  btn: { width: '100%', backgroundColor: homeColors.teal },
  soft: { width: '100%', backgroundColor: homeColors.tile, borderColor: homeColors.tealBorder },
});
