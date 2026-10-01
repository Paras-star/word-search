import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton, SoftButton } from '@/components/GameUI';
import { DUMPLING_BY_ID, RARITY_PRESENTATION } from '@/data/dumplings';
import { formatTime } from '@/game/scoring';
import { collectReward, getPendingReward, type DumplingReward } from '@/services/dumplingRewards';
import { playDumplingSound, stopDumplingSounds } from '@/services/dumplingAudio';
import { playSound } from '@/services/audio';
import { homeColors } from '@/constants/homePalette';

type RevealStage = 'basket' | 'opening' | 'revealed' | 'collected';

const PARTICLE_POSITIONS = [
  ['12%', '10%'], ['77%', '8%'], ['5%', '34%'], ['88%', '35%'], ['19%', '55%'],
  ['72%', '58%'], ['37%', '6%'], ['55%', '15%'], ['9%', '74%'], ['84%', '77%'],
  ['30%', '70%'], ['61%', '74%'], ['44%', '45%'], ['67%', '36%'], ['23%', '27%'],
] as const;

export default function RewardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ categoryId?: string; mode?: string; score?: string; time?: string; puzzleId?: string }>();
  const [reward, setReward] = useState<DumplingReward | null>(null);
  const [stage, setStage] = useState<RevealStage>('basket');
  const [loading, setLoading] = useState(true);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shake = useRef(new Animated.Value(0)).current;
  const basketScale = useRef(new Animated.Value(1)).current;
  const basketOpacity = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(0.2)).current;
  const revealScale = useRef(new Animated.Value(0.2)).current;
  const revealOpacity = useRef(new Animated.Value(0)).current;
  const openingSoundPlayed = useRef(false);
  const revealSoundPlayed = useRef(false);
  const raritySoundPlayed = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    getPendingReward()
      .then((pending) => {
        if (!active) return;
        setReward(pending);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setError('Your saved reward could not be loaded.');
        setLoading(false);
      });
    return () => {
      active = false;
      mounted.current = false;
      stopDumplingSounds();
    };
  }, []);

  const dumpling = reward ? DUMPLING_BY_ID[reward.dumplingId] : null;
  const presentation = dumpling ? RARITY_PRESENTATION[dumpling.rarity] : RARITY_PRESENTATION.Common;
  const visibleParticles = useMemo(() => PARTICLE_POSITIONS.slice(0, presentation.particleCount), [presentation.particleCount]);

  const startReveal = () => {
    if (!reward || stage !== 'basket') return;
    setStage('opening');
    if (!openingSoundPlayed.current) {
      openingSoundPlayed.current = true;
      void playDumplingSound('opening');
    }
    const revealAnimation = Animated.parallel([
      Animated.timing(basketScale, { toValue: 0.78, duration: 300, useNativeDriver: true }),
      Animated.timing(basketOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      Animated.spring(revealScale, { toValue: 1, speed: 10, bounciness: 12, useNativeDriver: true }),
      Animated.timing(revealOpacity, { toValue: 1, duration: 360, useNativeDriver: true }),
    ]);
    const startRevealAnimation = revealAnimation.start.bind(revealAnimation);
    revealAnimation.start = (callback) => {
      if (mounted.current && !revealSoundPlayed.current) {
        revealSoundPlayed.current = true;
        void playDumplingSound('reveal');
      }
      startRevealAnimation(callback);
    };
    Animated.sequence([
      Animated.parallel([
        Animated.sequence([
          Animated.timing(shake, { toValue: 1, duration: 85, useNativeDriver: true }),
          Animated.timing(shake, { toValue: -1, duration: 85, useNativeDriver: true }),
          Animated.timing(shake, { toValue: 1, duration: 70, useNativeDriver: true }),
          Animated.timing(shake, { toValue: -1, duration: 70, useNativeDriver: true }),
          Animated.timing(shake, { toValue: 0, duration: 90, useNativeDriver: true }),
        ]),
        Animated.timing(glow, { toValue: 0.75, duration: 400, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(basketScale, { toValue: 1.18, duration: 260, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]),
      revealAnimation,
    ]).start(() => {
      if (!mounted.current) return;
      setStage('revealed');
      if (dumpling && !raritySoundPlayed.current) {
        raritySoundPlayed.current = true;
        void playDumplingSound('rarityReveal', dumpling.rarity);
      }
    });
  };

  const handleCollect = async () => {
    if (!reward || stage !== 'revealed') return;
    try {
      const result = await collectReward(reward.id);
      setReward(result.reward);
      setIsDuplicate(result.isDuplicate);
      setStage('collected');
    } catch {
      setError('The reward could not be collected. Please try again.');
    }
  };

  const goToResults = () => router.replace({ pathname: '/results', params });

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={homeColors.teal} /></View>;
  }

  if (!reward || !dumpling) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.emptyCard}>
          <Feather name="gift" size={42} color={homeColors.gold} />
          <Text style={styles.emptyTitle}>No reward is waiting</Text>
          <Text style={styles.emptyCopy}>{error ?? 'Complete a Word Hunt puzzle to earn a Mystery Dumpling.'}</Text>
          <PrimaryButton onPress={() => router.replace('/')} style={styles.actionButton}>GO HOME</PrimaryButton>
        </View>
      </View>
    );
  }

  const isRevealed = stage === 'revealed' || stage === 'collected';
  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => { playSound('tap'); router.replace('/'); }} hitSlop={12} accessibilityLabel="Return home">
          <Feather name="x" size={24} color={homeColors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>MYSTERY DUMPLING</Text>
        <View style={styles.savedPill}><Feather name="check" size={12} color={homeColors.teal} /><Text style={styles.savedText}>SAVED</Text></View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.rewardStage}>
          <View style={styles.starPattern}>
            {PARTICLE_POSITIONS.map(([left, top], index) => (
              <Feather key={index} name="star" size={index % 3 === 0 ? 20 : 13} color="rgba(183,112,36,0.14)" style={{ position: 'absolute', left, top }} />
            ))}
          </View>
          <Animated.View style={[styles.glow, { backgroundColor: presentation.glow, opacity: glow, transform: [{ scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.3] }) }] }]} />

          {visibleParticles.map(([left, top], index) => (
            <Animated.View
              key={`${left}-${top}`}
              style={[
                styles.particle,
                {
                  left,
                  top,
                  backgroundColor: index % 2 ? presentation.glow : homeColors.gold,
                  opacity: isRevealed ? 0.9 : glow,
                  transform: [{ scale: index % 3 === 0 ? 1.25 : 0.8 }],
                },
              ]}
            />
          ))}

          {!isRevealed && (
            <Animated.View
              style={[
                styles.basket,
                {
                  opacity: basketOpacity,
                  transform: [
                    { translateX: shake.interpolate({ inputRange: [-1, 0, 1], outputRange: [-9, 0, 9] }) },
                    { rotate: shake.interpolate({ inputRange: [-1, 0, 1], outputRange: ['-3deg', '0deg', '3deg'] }) },
                    { scale: basketScale },
                  ],
                },
              ]}
            >
              <View style={styles.basketLid}><View style={styles.basketHandle} /></View>
              <View style={styles.basketBody}>
                {[0, 1, 2, 3].map((line) => <View key={line} style={[styles.basketStripe, { top: 22 + line * 25 }]} />)}
                <View style={styles.mysterySeal}><Feather name="help-circle" size={34} color={homeColors.goldSoft} /></View>
              </View>
            </Animated.View>
          )}

          <Animated.View
            pointerEvents={isRevealed ? 'auto' : 'none'}
            style={[styles.reveal, { opacity: revealOpacity, transform: [{ scale: revealScale }] }]}
          >
            <Image source={dumpling.asset} style={styles.dumplingImage} resizeMode="contain" />
          </Animated.View>
        </View>

        <View style={styles.copyBlock}>
          <Text style={[styles.kicker, { color: presentation.glow }]}>
            {stage === 'basket' ? 'PUZZLE COMPLETE' : stage === 'opening' ? 'OPENING…' : stage === 'collected' ? 'COLLECTED' : `YOU FOUND ${dumpling.rarity.toUpperCase()}`}
          </Text>
          <Text style={styles.title}>{isRevealed ? dumpling.name : 'A surprise is waiting'}</Text>
          <Text style={styles.copy}>
            {stage === 'basket'
              ? 'Your reward was generated and safely saved. Tap below when you are ready.'
              : stage === 'opening'
                ? 'The basket is opening…'
                : stage === 'collected'
                  ? isDuplicate ? 'A duplicate reward was recorded. Your original remains safe in the room.' : 'This dumpling now lives in your Collection Room.'
                  : 'Collect it to add it permanently to your room.'}
          </Text>
          {isRevealed && <View style={[styles.rarityPill, { borderColor: presentation.color, backgroundColor: `${presentation.color}2A` }]}><View style={[styles.rarityDot, { backgroundColor: presentation.glow }]} /><Text style={[styles.rarityText, { color: presentation.glow }]}>{dumpling.rarity.toUpperCase()}</Text></View>}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.actions}>
          {stage === 'basket' && <PrimaryButton onPress={startReveal} suppressClickSound style={[styles.actionButton, { backgroundColor: homeColors.teal }]} testID="reward-open">OPEN MYSTERY BASKET</PrimaryButton>}
          {stage === 'opening' && <View style={styles.openingPill}><ActivityIndicator color={homeColors.teal} /><Text style={styles.openingText}>A little magic is happening</Text></View>}
          {stage === 'revealed' && <PrimaryButton onPress={handleCollect} suppressClickSound style={[styles.actionButton, { backgroundColor: homeColors.teal }]} testID="reward-collect">COLLECT {dumpling.name.toUpperCase()}</PrimaryButton>}
          {stage === 'collected' && <>
            <PrimaryButton onPress={() => router.replace({ pathname: '/collection', params: !isDuplicate ? { newDumplingId: dumpling.id } : undefined })} style={[styles.actionButton, { backgroundColor: homeColors.teal }]}>VIEW COLLECTION ROOM</PrimaryButton>
            <SoftButton onPress={goToResults} style={styles.continueButton}>CONTINUE</SoftButton>
          </>}
        </View>

        <View style={styles.summary}>
          <View style={styles.stat}><Text style={styles.statLabel}>SCORE</Text><Text style={styles.statValue}>{params.score ?? '0'}</Text></View>
          <View style={styles.stat}><Text style={styles.statLabel}>TIME</Text><Text style={styles.statValue}>{formatTime(Number(params.time ?? 0))}</Text></View>
          <View style={styles.stat}><Text style={styles.statLabel}>COINS</Text><Text style={[styles.statValue, { color: homeColors.gold }]}>+50</Text></View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: homeColors.background, paddingHorizontal: 18 },
  loading: { flex: 1, backgroundColor: homeColors.background, alignItems: 'center', justifyContent: 'center' },
  topBar: { height: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topTitle: { color: homeColors.ink, fontFamily: 'Inter_700Bold', fontSize: 13, letterSpacing: 1.5 },
  savedPill: { flexDirection: 'row', gap: 4, alignItems: 'center', backgroundColor: homeColors.goldSoft, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10 },
  savedText: { color: homeColors.teal, fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 0.8 },
  content: { alignItems: 'center', paddingBottom: 24 },
  rewardStage: { width: '100%', aspectRatio: 1.06, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  starPattern: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  glow: { position: 'absolute', width: '62%', aspectRatio: 1, borderRadius: 999 },
  particle: { position: 'absolute', width: 7, height: 7, borderRadius: 4, shadowColor: homeColors.gold, shadowOpacity: 0.9, shadowRadius: 5 },
  basket: { width: 215, height: 180, alignItems: 'center', justifyContent: 'flex-end' },
  basketLid: { width: 210, height: 46, borderRadius: 25, backgroundColor: homeColors.goldSoft, borderWidth: 4, borderColor: homeColors.gold, zIndex: 2, shadowColor: homeColors.ink, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 5 } },
  basketHandle: { position: 'absolute', width: 42, height: 14, borderRadius: 10, backgroundColor: homeColors.gold, top: -12, alignSelf: 'center', borderWidth: 3, borderColor: homeColors.gold },
  basketBody: { width: 190, height: 125, marginTop: -5, borderBottomLeftRadius: 52, borderBottomRightRadius: 52, borderTopLeftRadius: 15, borderTopRightRadius: 15, backgroundColor: homeColors.goldSoft, borderWidth: 4, borderColor: homeColors.gold, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  basketStripe: { position: 'absolute', left: 0, right: 0, height: 7, backgroundColor: 'rgba(183,112,36,0.42)' },
  mysterySeal: { width: 62, height: 62, borderRadius: 31, backgroundColor: homeColors.gold, borderWidth: 3, borderColor: homeColors.goldSoft, alignItems: 'center', justifyContent: 'center' },
  reveal: { position: 'absolute', width: '88%', height: '88%', alignItems: 'center', justifyContent: 'center' },
  dumplingImage: { width: '100%', height: '100%' },
  copyBlock: { alignItems: 'center', minHeight: 145, paddingHorizontal: 10 },
  kicker: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1.6, marginBottom: 8 },
  title: { color: homeColors.ink, fontFamily: 'Inter_700Bold', fontSize: 29, textAlign: 'center', letterSpacing: -0.5 },
  copy: { color: 'rgba(89,104,107,0.76)', fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 9, maxWidth: 330 },
  rarityPill: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 7, marginTop: 10 },
  rarityDot: { width: 7, height: 7, borderRadius: 4 },
  rarityText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.3 },
  actions: { width: '100%', gap: 10, marginTop: 13 },
  actionButton: { width: '100%' },
  continueButton: { backgroundColor: homeColors.tile, borderColor: homeColors.tealBorder },
  openingPill: { minHeight: 56, borderRadius: 18, backgroundColor: 'rgba(183,112,36,0.15)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  openingText: { color: homeColors.ink, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  summary: { width: '100%', flexDirection: 'row', gap: 8, marginTop: 16 },
  stat: { flex: 1, minHeight: 64, borderRadius: 16, backgroundColor: homeColors.tile, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: homeColors.tileBorder },
  statLabel: { color: 'rgba(89,104,107,0.62)', fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.1 },
  statValue: { color: homeColors.ink, fontFamily: 'Inter_700Bold', fontSize: 18, marginTop: 4 },
  error: { color: homeColors.gold, fontFamily: 'Inter_600SemiBold', fontSize: 12, textAlign: 'center', marginTop: 8 },
  emptyCard: { marginTop: '45%', borderRadius: 24, backgroundColor: homeColors.tile, padding: 24, alignItems: 'center', gap: 12 },
  emptyTitle: { color: homeColors.ink, fontFamily: 'Inter_700Bold', fontSize: 24, textAlign: 'center' },
  emptyCopy: { color: 'rgba(89,104,107,0.76)', fontFamily: 'Inter_500Medium', fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 6 },
});