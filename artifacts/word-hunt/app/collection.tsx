import React, { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header, LoadingScreen, Screen, SectionLabel } from '@/components/GameUI';
import { DUMPLINGS, RARITY_PRESENTATION } from '@/data/dumplings';
import { useColors } from '@/hooks/useColors';
import { getCollection } from '@/services/dumplingRewards';

const ROOM_ART = require('../assets/images/collection-room.png');
const ROOM_POSITIONS = [
  { left: '7%', top: '11%' }, { left: '17%', top: '9%' }, { left: '27%', top: '9%' }, { left: '38%', top: '10%' },
  { left: '48%', top: '12%' }, { left: '8%', top: '25%' }, { left: '19%', top: '24%' }, { left: '30%', top: '24%' },
  { left: '41%', top: '25%' }, { left: '51%', top: '24%' }, { left: '68%', top: '14%' }, { left: '80%', top: '16%' },
  { left: '13%', top: '43%' }, { left: '28%', top: '43%' }, { left: '42%', top: '43%' }, { left: '58%', top: '44%' },
  { left: '73%', top: '43%' }, { left: '16%', top: '61%' }, { left: '32%', top: '61%' }, { left: '47%', top: '60%' },
  { left: '62%', top: '61%' }, { left: '77%', top: '60%' }, { left: '10%', top: '76%' }, { left: '25%', top: '76%' },
  { left: '40%', top: '76%' }, { left: '55%', top: '76%' }, { left: '70%', top: '76%' }, { left: '82%', top: '75%' },
  { left: '57%', top: '29%' }, { left: '83%', top: '32%' },
] as const;

export default function CollectionScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [ownedIds, setOwnedIds] = useState<string[] | null>(null);

  useEffect(() => {
    let active = true;
    getCollection()
      .then(({ ownedDumplingIds }) => { if (active) setOwnedIds(ownedDumplingIds); })
      .catch(() => { if (active) setOwnedIds([]); });
    return () => { active = false; };
  }, []);

  if (ownedIds === null) return <LoadingScreen />;
  const owned = new Set(ownedIds);
  const progress = Math.round((owned.size / DUMPLINGS.length) * 100);

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <Header title="Collection Room" onBack={() => router.back()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 30 }]}>
        <View style={[styles.progressCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View>
            <Text style={[styles.progressKicker, { color: colors.mutedForeground }]}>MYSTERY DUMPLINGS</Text>
            <Text style={[styles.progressTitle, { color: colors.foreground }]}>{owned.size} of {DUMPLINGS.length} collected</Text>
          </View>
          <View style={[styles.progressCircle, { backgroundColor: colors.accent }]}>
            <Text style={[styles.progressPercent, { color: colors.orange }]}>{progress}%</Text>
          </View>
        </View>

        <View style={[styles.roomFrame, { borderColor: colors.border }]}>
          <View style={styles.room}>
            <Image source={ROOM_ART} resizeMode="contain" style={styles.roomArt} />
            {DUMPLINGS.map((dumpling, index) => owned.has(dumpling.id) ? (
              <View key={dumpling.id} style={[styles.roomDumpling, ROOM_POSITIONS[index]]}>
                <Image source={dumpling.asset} style={styles.roomDumplingImage} resizeMode="contain" />
              </View>
            ) : null)}
          </View>
        </View>
        <Text style={[styles.roomCaption, { color: colors.mutedForeground }]}>
          Collected friends appear throughout the single shared room.
        </Text>

        <SectionLabel>All dumplings</SectionLabel>
        <View style={styles.grid}>
          {DUMPLINGS.map((dumpling) => {
            const isOwned = owned.has(dumpling.id);
            const rarity = RARITY_PRESENTATION[dumpling.rarity];
            return (
              <View key={dumpling.id} style={[styles.card, { backgroundColor: colors.card, borderColor: isOwned ? rarity.color : colors.border }]}>
                <View style={[styles.imageWell, { backgroundColor: isOwned ? `${rarity.glow}35` : colors.muted }]}>
                  {isOwned
                    ? <Image source={dumpling.asset} style={styles.cardImage} resizeMode="contain" />
                    : <Feather name="lock" size={23} color={colors.mutedForeground} />}
                </View>
                <Text numberOfLines={2} style={[styles.cardName, { color: isOwned ? colors.foreground : colors.mutedForeground }]}>{dumpling.name}</Text>
                <Text style={[styles.rarity, { color: isOwned ? rarity.color : colors.mutedForeground }]}>{dumpling.rarity.toUpperCase()}</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { gap: 14 },
  progressCard: { borderWidth: 1, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressKicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2 },
  progressTitle: { fontFamily: 'Inter_700Bold', fontSize: 19, marginTop: 5 },
  progressCircle: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  progressPercent: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  roomFrame: { borderWidth: 2, borderRadius: 22, overflow: 'hidden', backgroundColor: '#1c2330', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } },
  room: { width: '100%', aspectRatio: 1408 / 768 },
  roomArt: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, width: '100%', height: '100%' },
  roomDumpling: { position: 'absolute', width: '10%', height: '14%' },
  roomDumplingImage: { width: '100%', height: '100%' },
  roomCaption: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: 16, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { width: '31.2%', minHeight: 150, borderWidth: 1.5, borderRadius: 16, padding: 8, alignItems: 'center' },
  imageWell: { width: '100%', height: 82, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cardImage: { width: '98%', height: '98%' },
  cardName: { fontFamily: 'Inter_600SemiBold', fontSize: 11, lineHeight: 14, textAlign: 'center', marginTop: 7, minHeight: 28 },
  rarity: { fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 0.7, marginTop: 2 },
});