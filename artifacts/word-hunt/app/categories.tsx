import React, { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen, CoinPill, SectionLabel } from '@/components/GameUI';
import { CATEGORIES } from '@/data/categories';
import { isCategoryUnlocked } from '@/game/progression';
import { useGame } from '@/context/GameProvider';
import { useColors } from '@/hooks/useColors';
import { AdBanner } from '@/components/AdBanner';
import { canChangeAdPrivacy, prepareAds, showPrivacyOptions } from '@/services/ads';

export default function CategoriesScreen() {
  const router = useRouter();
  const colors = useColors();
  const { coins, completedLevels, hydrated, onboardingStep } = useGame();
  const [privacyAvailable, setPrivacyAvailable] = useState(false);
  const [bannerRevision, setBannerRevision] = useState(0);
  useEffect(() => {
    if (!hydrated || onboardingStep < 6) return;
    let active = true;
    void prepareAds().then(() => {
      if (active) setPrivacyAvailable(canChangeAdPrivacy());
    });
    return () => { active = false; };
  }, [hydrated, onboardingStep]);
  if (!hydrated) return null;
  if (onboardingStep < 6) {
    return <Redirect href={{ pathname: '/game', params: { onboardingStep: String(onboardingStep) } }} />;
  }
  return <Screen>
    <Header title="Choose a category" onBack={() => router.back()} right={<CoinPill coins={coins} />} />
    <Text style={[styles.intro, { color: colors.mutedForeground }]}>Complete a hunt to unlock the next world.</Text>
    <FlatList data={CATEGORIES} numColumns={2} keyExtractor={(item) => item.id} columnWrapperStyle={styles.columns} contentContainerStyle={styles.list} renderItem={({ item, index }) => {
      const unlocked = isCategoryUnlocked(index, completedLevels, CATEGORIES);
      const completed = completedLevels.includes(item.id);
      return <Pressable disabled={!unlocked} onPress={() => router.push({ pathname: '/mode', params: { categoryId: item.id } })} style={({ pressed }) => [styles.card, { backgroundColor: unlocked ? colors.card : colors.muted, borderColor: completed ? colors.success : colors.border, opacity: pressed ? 0.75 : unlocked ? 1 : 0.56 }]}>
        <View style={[styles.icon, { backgroundColor: unlocked ? colors.accent : colors.border }]}><Text style={styles.emoji}>{item.emoji}</Text></View>
        <Text style={[styles.name, { color: unlocked ? colors.foreground : colors.mutedForeground }]}>{item.name}</Text>
        <View style={styles.status}>{completed ? <><Feather name="check-circle" size={14} color={colors.success} /><Text style={[styles.statusText, { color: colors.success }]}>CLEARED</Text></> : unlocked ? <><SectionLabel>READY</SectionLabel></> : <><Feather name="lock" size={13} color={colors.mutedForeground} /><Text style={[styles.statusText, { color: colors.mutedForeground }]}>LOCKED</Text></>}</View>
      </Pressable>;
    }} />
    <AdBanner key={bannerRevision} />
    {privacyAvailable && <Pressable onPress={() => { void showPrivacyOptions().then((changed) => {
      setPrivacyAvailable(canChangeAdPrivacy());
      if (changed) setBannerRevision((value) => value + 1);
    }); }} style={styles.privacyLink} accessibilityLabel="Change advertising privacy choices">
      <Text style={[styles.privacyText, { color: colors.mutedForeground }]}>Ad privacy choices</Text>
    </Pressable>}
  </Screen>;
}

const styles = StyleSheet.create({
  intro: { fontFamily: 'Inter_500Medium', fontSize: 14, marginBottom: 16 },
  list: { paddingBottom: 24, gap: 12 },
  columns: { gap: 12 },
  card: { flex: 1, minHeight: 156, padding: 16, borderRadius: 20, borderWidth: 1, marginBottom: 12 },
  icon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 13 },
  emoji: { fontSize: 25 },
  name: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 },
  statusText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.7 },
  privacyLink: { alignSelf: 'center', minHeight: 36, justifyContent: 'center' },
  privacyText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
});