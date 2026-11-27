import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRouter } from 'expo-router';
import { PrimaryButton } from '@/components/GameUI';
import NormalRewardScene from '@/components/NormalRewardScene';
import { homeColors } from '@/constants/homePalette';
import { DUMPLING_BY_ID, type Dumpling } from '@/data/dumplings';
import { useGame } from '@/context/GameProvider';
import { stopDumplingSounds } from '@/services/dumplingAudio';
import { TREASURE_CHEST_COST } from '@/services/treasureChest';

type Phase = 'ready' | 'processing' | 'animating' | 'done';

export default function TreasureChestScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const top = Platform.OS === 'web' ? Math.max(67, insets.top) : insets.top;
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

  const blocked = phase === 'processing' || phase === 'animating';
  const blockedRef = useRef(blocked);
  blockedRef.current = blocked;

  useEffect(() => {
    // Keep native back unavailable while a purchase/reveal must not be interrupted.
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
  const done = phase === 'done' && dumpling;

  const showStatus = hydrated && phase === 'ready';

  return <View style={styles.screen}>
    <NormalRewardScene dumpling={dumpling}
    opening={phase === 'animating' || phase === 'done'} revealed={!!done}
    loading={phase === 'processing'} busy={phase === 'processing'} collected={!!done}
    chestDisabled={!canBuy}
    error={error} score="" time="" coins=""
    showActions={!!done} showStats={false} showHomeButton={false}
    statusMessage={showStatus
      ? coins < TREASURE_CHEST_COST
        ? `${TREASURE_CHEST_COST} coins required. You need ${TREASURE_CHEST_COST - coins} more.`
        : 'Chest is Ready!'
      : null}
    statusTestID="treasure-need" errorTestID="treasure-error" sceneTestID="treasure-reward-scene"
    chestTestID="treasure-chest-tap"
    chestAccessibilityLabel={`Tap the chest to open for ${TREASURE_CHEST_COST} coins`}
    collectionTestID="treasure-collection" continueTestID="treasure-continue"
    retryContainerTestID="treasure-purchase-error"
    retryAction={error ? <PrimaryButton onPress={() => { void open(); }} disabled={!canBuy} suppressClickSound
      testID="treasure-retry" style={{ width: '100%', backgroundColor: homeColors.teal }}>RETRY</PrimaryButton> : undefined}
    purchaseNote={done ? { isDuplicate, recoveryPending: recovery } : undefined}
    onOpen={() => { void open(); }} onRevealed={onRevealed}
    onCollection={() => {
      if (!done) return;
      router.replace(isDuplicate ? '/collection' : { pathname: '/collection', params: { newDumplingId: done.id } });
    }}
    onContinue={leave} onHome={leave} />
    <Pressable testID="treasure-back" accessibilityRole="button" accessibilityLabel="Back"
      accessibilityState={{ disabled: blocked }} disabled={blocked} onPress={leave}
      style={[styles.back, { top: top + 8, left: insets.left + 12 }]}>
      <Feather name="arrow-left" size={28} color={homeColors.goldSoft} />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  back: { position: 'absolute', zIndex: 1, width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
