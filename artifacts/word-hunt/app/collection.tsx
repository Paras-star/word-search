import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header, LoadingScreen, Screen } from '@/components/GameUI';
import { DUMPLINGS, RARITY_PRESENTATION, type Dumpling, type DumplingRarity } from '@/data/dumplings';
import { useColors } from '@/hooks/useColors';
import { getCollection } from '@/services/dumplingRewards';

const RARITIES_ORDER: DumplingRarity[] = ['Legendary', 'Epic', 'Rare', 'Uncommon', 'Common'];

type RowData =
  | { type: 'header'; rarity: DumplingRarity; id: string }
  | { type: 'row'; items: Dumpling[]; id: string; rarity: DumplingRarity };

const flatData: RowData[] = [];
RARITIES_ORDER.forEach((rarity) => {
  const items = DUMPLINGS.filter((d) => d.rarity === rarity);
  if (items.length > 0) {
    flatData.push({ type: 'header', rarity, id: `header-${rarity}` });
    for (let i = 0; i < items.length; i += 3) {
      flatData.push({
        type: 'row',
        rarity,
        items: items.slice(i, i + 3),
        id: `row-${rarity}-${i}`,
      });
    }
  }
});

const HEADER_HEIGHT = 60;
const ROW_HEIGHT = 130;

const getItemLayout = (data: ArrayLike<RowData> | null | undefined, index: number) => {
  if (!data) return { length: 0, offset: 0, index };
  let offset = 0;
  for (let i = 0; i < index; i++) {
    offset += data[i].type === 'header' ? HEADER_HEIGHT : ROW_HEIGHT;
  }
  const length = data[index].type === 'header' ? HEADER_HEIGHT : ROW_HEIGHT;
  return { length, offset, index };
};

function DumplingSlot({
  dumpling,
  isOwned,
  isNew,
  isVisible,
}: {
  dumpling: Dumpling;
  isOwned: boolean;
  isNew: boolean;
  isVisible: boolean;
}) {
  const [hasPlayedEntrance, setHasPlayedEntrance] = useState(false);
  const floatAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const rarity = RARITY_PRESENTATION[dumpling.rarity];
  const idleLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const entranceRef = useRef<Animated.CompositeAnimation | null>(null);

  const startIdle = useCallback(() => {
    if (idleLoopRef.current) idleLoopRef.current.stop();
    const randomDelay = Math.random() * 500;

    idleLoopRef.current = Animated.parallel([
      Animated.loop(
        Animated.sequence([
          Animated.timing(floatAnim, { toValue: -4, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(floatAnim, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(rotateAnim, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(rotateAnim, { toValue: -1, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(rotateAnim, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.03, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 0.98, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 0.4, duration: 1500, delay: 3000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true })
        ])
      )
    ]);
    setTimeout(() => {
      if (idleLoopRef.current) idleLoopRef.current.start();
    }, randomDelay);
  }, [floatAnim, rotateAnim, scaleAnim, glowAnim]);

  const stopIdle = useCallback(() => {
    entranceRef.current?.stop();
    entranceRef.current = null;
    if (idleLoopRef.current) {
      idleLoopRef.current.stop();
      idleLoopRef.current = null;
    }
    floatAnim.setValue(0);
    rotateAnim.setValue(0);
    scaleAnim.setValue(1);
    glowAnim.setValue(0);
  }, [floatAnim, rotateAnim, scaleAnim, glowAnim]);

  useEffect(() => {
    if (!isVisible) {
      stopIdle();
      return;
    }

    if (!isOwned) return;

    if (isNew && !hasPlayedEntrance) {
      scaleAnim.setValue(0);
      glowAnim.setValue(1);
      entranceRef.current = Animated.sequence([
        Animated.parallel([
          Animated.spring(scaleAnim, { toValue: 1.2, friction: 4, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 1, duration: 500, useNativeDriver: true })
        ]),
        Animated.parallel([
          Animated.spring(scaleAnim, { toValue: 1, friction: 5, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0, duration: 800, delay: 600, useNativeDriver: true })
        ])
      ]);
      entranceRef.current.start(({ finished }) => {
        entranceRef.current = null;
        if (!finished) return;
        setHasPlayedEntrance(true);
        startIdle();
      });
    } else {
      startIdle();
    }
    return () => {
      stopIdle();
    };
  }, [isVisible, isOwned, isNew, hasPlayedEntrance, startIdle, stopIdle, scaleAnim, glowAnim]);

  const rotation = rotateAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-5deg', '5deg']
  });

  return (
    <View style={styles.slot} testID={`slot-${dumpling.id}`}>
      {isOwned && (
        <Animated.View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', opacity: glowAnim, bottom: 20 }]}>
          <View style={[styles.glowBackdrop, { backgroundColor: rarity.glow }]} />
          <View style={[styles.sparkle, styles.sparkleOne, { backgroundColor: rarity.glow }]} />
          <View style={[styles.sparkle, styles.sparkleTwo, { backgroundColor: rarity.glow }]} />
          <View style={[styles.sparkle, styles.sparkleThree, { backgroundColor: rarity.glow }]} />
        </Animated.View>
      )}

      <Animated.View style={{ alignItems: 'center', transform: [{ translateY: floatAnim }, { rotate: rotation }, { scale: scaleAnim }] }}>
        {isOwned ? (
          <Image source={dumpling.asset} style={styles.dumplingImg} resizeMode="contain" />
        ) : (
          <View style={styles.placeholderShape}>
            <Feather name="lock" size={20} color="#B0A090" />
          </View>
        )}
      </Animated.View>

      <View style={[styles.label, !isOwned && styles.labelLocked]}>
        <Text numberOfLines={1} style={[styles.name, !isOwned && styles.nameLocked]}>{isOwned ? dumpling.name : '???'}</Text>
        {isOwned && (
          <View style={styles.rarityRow}>
            <View style={[styles.rarityDot, { backgroundColor: rarity.glow }]} />
            <Text style={[styles.rarityText, { color: rarity.glow }]}>{dumpling.rarity.toUpperCase()}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default function CollectionScreen() {
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ newDumplingId?: string }>();

  let initialScrollIndex = 0;
  if (params.newDumplingId) {
    const index = flatData.findIndex(
      (d) => d.type === 'row' && d.items.some((i) => i.id === params.newDumplingId)
    );
    if (index >= 0) initialScrollIndex = index;
  }

  const [ownedIds, setOwnedIds] = useState<string[] | null>(null);
  const [collectionError, setCollectionError] = useState(false);
  const [visibleDumplingIds, setVisibleDumplingIds] = useState<Set<string>>(new Set());

  const reloadCollection = useCallback(() => {
    setCollectionError(false);
    getCollection()
      .then(({ ownedDumplingIds }) => setOwnedIds(ownedDumplingIds))
      .catch(() => setCollectionError(true));
  }, []);

  useEffect(() => {
    reloadCollection();
  }, [reloadCollection]);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 10,
    minimumViewTime: 50,
  }).current;

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: Array<ViewToken> }) => {
    const nextVisible = new Set<string>();
    viewableItems.forEach((v) => {
      const item = v.item as RowData;
      if (item.type === 'row') {
        item.items.forEach((d) => nextVisible.add(d.id));
      }
    });

    setVisibleDumplingIds((current) => {
      if (current.size === nextVisible.size && [...current].every((id) => nextVisible.has(id))) {
        return current;
      }
      return nextVisible;
    });
  }, []);

  if (collectionError) return (
    <Screen style={{ paddingTop: insets.top }}>
      <Header title="Collection Room" onBack={() => router.back()} />
      <View style={styles.loadError}>
        <Text style={styles.loadErrorText}>Your collection could not be loaded. It has not been reset.</Text>
        <Pressable onPress={reloadCollection} style={styles.retryButton}>
          <Text style={styles.retryText}>RETRY LOADING</Text>
        </Pressable>
      </View>
    </Screen>
  );
  if (ownedIds === null) return <LoadingScreen />;
  const owned = new Set(ownedIds);
  const progress = Math.round((owned.size / DUMPLINGS.length) * 100);

  const renderItem = ({ item }: { item: RowData }) => {
    if (item.type === 'header') {
      const rarityPres = RARITY_PRESENTATION[item.rarity];
      const count = DUMPLINGS.filter((d) => d.rarity === item.rarity).length;
      const ownedCount = DUMPLINGS.filter((d) => d.rarity === item.rarity && owned.has(d.id)).length;

      return (
        <View style={[styles.sectionHeader, { borderBottomColor: rarityPres.color }]}>
          <View style={styles.sectionHeaderTitle}>
            <Feather name="star" size={16} color={rarityPres.color} />
            <Text style={[styles.sectionHeaderText, { color: rarityPres.color }]}>
              {item.rarity.toUpperCase()}
            </Text>
          </View>
          <Text style={styles.sectionHeaderCount}>
            {ownedCount} / {count}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.row}>
        {item.items.map((dumpling) => (
          <DumplingSlot
            key={dumpling.id}
            dumpling={dumpling}
            isOwned={owned.has(dumpling.id)}
            isNew={params.newDumplingId === dumpling.id}
            isVisible={visibleDumplingIds.has(dumpling.id)}
          />
        ))}
      </View>
    );
  };

  return (
    <Screen style={{ paddingTop: insets.top }}>
      <Header title="Collection Room" onBack={() => router.back()} />
      <View style={{ flex: 1, paddingHorizontal: 16 }}>
        <View style={[styles.progressCard, { backgroundColor: colors.card, borderColor: colors.border, marginBottom: 16 }]}>
          <View>
            <Text style={[styles.progressKicker, { color: colors.mutedForeground }]}>MYSTERY DUMPLINGS</Text>
            <Text style={[styles.progressTitle, { color: colors.foreground }]}>{owned.size} of {DUMPLINGS.length} collected</Text>
          </View>
          <View style={[styles.progressCircle, { backgroundColor: colors.accent }]}>
            <Text style={[styles.progressPercent, { color: colors.orange }]}>{progress}%</Text>
          </View>
        </View>

        <View style={[styles.galleryContainer, { borderColor: colors.border }]}>
          <FlatList
            data={flatData}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            viewabilityConfig={viewabilityConfig}
            onViewableItemsChanged={onViewableItemsChanged}
            initialScrollIndex={initialScrollIndex > 0 ? initialScrollIndex : undefined}
            getItemLayout={getItemLayout}
            contentContainerStyle={{ paddingBottom: 60 }}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadError: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadErrorText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  retryButton: { backgroundColor: '#2F80ED', borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14 },
  retryText: { fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
  progressCard: { borderWidth: 1, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressKicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2 },
  progressTitle: { fontFamily: 'Inter_700Bold', fontSize: 19, marginTop: 5 },
  progressCircle: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  progressPercent: { fontFamily: 'Inter_700Bold', fontSize: 14 },

  galleryContainer: { flex: 1, borderWidth: 2, borderRadius: 22, overflow: 'hidden', backgroundColor: '#FFF9F2', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },

  sectionHeader: {
    height: HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 10,
    borderBottomWidth: 2,
    backgroundColor: '#FFF9F2',
  },
  sectionHeaderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionHeaderText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    letterSpacing: 0.5,
  },
  sectionHeaderCount: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: '#7A8192',
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    paddingHorizontal: 8,
  },

  slot: {
    width: '33.33%',
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10
  },
  dumplingImg: { width: 55, height: 55 },
  placeholderShape: { width: 48, height: 42, backgroundColor: '#DFD5C9', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderBottomLeftRadius: 10, borderBottomRightRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#C8BAA8' },
  glowBackdrop: { width: 100, height: 100, borderRadius: 50, opacity: 0.5 },
  sparkle: { position: 'absolute', width: 6, height: 6, borderRadius: 3, shadowColor: '#FFFFFF', shadowOpacity: 0.8, shadowRadius: 4 },
  sparkleOne: { left: 10, top: 24 },
  sparkleTwo: { right: 12, top: 38, width: 4, height: 4 },
  sparkleThree: { right: 22, bottom: 16, width: 5, height: 5 },
  label: { backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3, marginTop: 4, alignItems: 'center', minWidth: 50 },
  labelLocked: { backgroundColor: 'rgba(0,0,0,0.25)' },
  name: { fontSize: 9, color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  nameLocked: { color: 'rgba(255,255,255,0.4)' },
  rarityRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  rarityDot: { width: 4, height: 4, borderRadius: 2 },
  rarityText: { fontSize: 7, fontFamily: 'Inter_700Bold' },
});
