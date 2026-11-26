import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ViewToken,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header, LoadingScreen } from '@/components/GameUI';
import { DUMPLINGS, type Dumpling, type DumplingRarity } from '@/data/dumplings';
import { getCollection } from '@/services/dumplingRewards';
import { RarityPanel, panelHeight } from '@/components/collection/RarityPanel';
import { collectionColors } from '@/components/collection/collectionTheme';
import { usePreparedBackground } from '@/hooks/usePreparedBackground';
import { useScreenActivity } from '@/hooks/useScreenActivity';

const RARITIES_ORDER: DumplingRarity[] = ['Legendary', 'Epic', 'Rare', 'Uncommon', 'Common'];
const PANEL_GAP = 14;
const MAX_PANEL_WIDTH = 520;
const NO_VISIBLE_DUMPLINGS = new Set<string>();

type PanelData = { rarity: DumplingRarity; items: Dumpling[]; id: string };

const panels: PanelData[] = RARITIES_ORDER.map((rarity) => ({
  rarity,
  items: DUMPLINGS.filter((d) => d.rarity === rarity),
  id: `panel-${rarity}`,
}));

export default function CollectionScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? Math.max(67, insets.top) : insets.top;
  const bottomInset = Platform.OS === 'web' ? Math.max(34, insets.bottom) : insets.bottom;
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const background = usePreparedBackground('night');
  const active = useScreenActivity();
  const params = useLocalSearchParams<{ newDumplingId?: string }>();
  const panelWidth = Math.min(MAX_PANEL_WIDTH, screenWidth - 20);

  let initialScrollIndex = 0;
  if (params.newDumplingId) {
    const index = panels.findIndex((p) => p.items.some((i) => i.id === params.newDumplingId));
    if (index >= 0) initialScrollIndex = index;
  }
  // Fill the visible viewport from the requested rarity, including a partially
  // visible last panel. Remaining panels are rendered in small list batches.
  const visibleHeight = Math.max(1, screenHeight - topInset - 150);
  let initialPanelCount = 0;
  let initialPanelHeight = 0;
  for (let i = initialScrollIndex; i < panels.length && initialPanelHeight < visibleHeight; i++) {
    initialPanelHeight += panelHeight(panels[i].rarity, panelWidth) + PANEL_GAP;
    initialPanelCount++;
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
      (v.item as PanelData).items.forEach((d) => nextVisible.add(d.id));
    });
    setVisibleDumplingIds((current) => {
      if (current.size === nextVisible.size && [...current].every((id) => nextVisible.has(id))) {
        return current;
      }
      return nextVisible;
    });
  }, []);

  const getItemLayout = useCallback(
    (data: ArrayLike<PanelData> | null | undefined, index: number) => {
      if (!data) return { length: 0, offset: 0, index };
      let offset = 0;
      for (let i = 0; i < index; i++) offset += panelHeight(data[i].rarity, panelWidth) + PANEL_GAP;
      return { length: panelHeight(data[index].rarity, panelWidth) + PANEL_GAP, offset, index };
    },
    [panelWidth],
  );

  const shell = (children: React.ReactNode) => (
    <View style={styles.root}>
      <Image source={background} style={[StyleSheet.absoluteFill, styles.backgroundImage]} contentFit="cover"
        contentPosition="center" transition={0} accessible={false} testID="collection-background" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: collectionColors.nightOverlay }]} />
      <View style={[styles.root, { paddingTop: topInset }]}>
        <Header
          title="Collection Room"
          onBack={() => router.back()}
          foregroundColor={collectionColors.title}
          titleStyle={styles.headerTitle}
        />
        {children}
      </View>
    </View>
  );

  if (collectionError) return shell(
    <View style={styles.loadError}>
      <View style={styles.errorCard}>
        <Text style={styles.loadErrorText}>Your collection could not be loaded. It has not been reset.</Text>
        <Pressable onPress={reloadCollection} style={styles.retryButton} testID="collection-retry">
          <Text style={styles.retryText}>RETRY LOADING</Text>
        </Pressable>
      </View>
    </View>
  );
  if (ownedIds === null) return <LoadingScreen />;
  const owned = new Set(ownedIds);
  const progress = Math.round((owned.size / DUMPLINGS.length) * 100);

  return shell(
    <>
      <View style={styles.progressWrap} testID="collection-progress">
        <View style={styles.progressTextRow}>
          <Text style={styles.progressKicker}>MYSTERY DUMPLINGS</Text>
          <Text style={styles.progressPercent}>{progress}%</Text>
        </View>
        <Text style={styles.progressTitle}>{owned.size} of {DUMPLINGS.length} collected</Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      </View>
      <FlatList
        data={panels}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={{ alignItems: 'center', paddingBottom: PANEL_GAP }}>
            <RarityPanel
              rarity={item.rarity}
              dumplings={item.items}
              width={panelWidth}
              owned={owned}
              newDumplingId={params.newDumplingId}
              visibleIds={active ? visibleDumplingIds : NO_VISIBLE_DUMPLINGS}
            />
          </View>
        )}
        showsVerticalScrollIndicator={false}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        initialScrollIndex={initialScrollIndex > 0 ? initialScrollIndex : undefined}
        initialNumToRender={Math.max(1, initialPanelCount)}
        maxToRenderPerBatch={1}
        windowSize={3}
        getItemLayout={getItemLayout}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: bottomInset + 40 }}
        testID="collection-panels"
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Override RN Web's intrinsic PNG dimensions, not the scrolling panel geometry.
  backgroundImage: { width: '100%', height: '100%' },
  headerTitle: {
    color: collectionColors.title,
    textShadowColor: collectionColors.titleShadow,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  loadError: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorCard: { backgroundColor: collectionColors.errorCard, borderRadius: 18, padding: 22, alignItems: 'center' },
  loadErrorText: { color: collectionColors.progressText, fontFamily: 'Inter_600SemiBold', fontSize: 16, textAlign: 'center', marginBottom: 20 },
  retryButton: { backgroundColor: collectionColors.retry, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14 },
  retryText: { fontFamily: 'Inter_700Bold', color: collectionColors.retryText },
  progressWrap: {
    marginHorizontal: 14,
    marginBottom: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: collectionColors.topScrim,
    borderWidth: 1,
    borderColor: collectionColors.backBorder,
  },
  progressTextRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressKicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.4, color: collectionColors.kicker },
  progressPercent: { fontFamily: 'Inter_700Bold', fontSize: 13, color: collectionColors.progressFill },
  progressTitle: { fontFamily: 'Inter_700Bold', fontSize: 17, marginTop: 2, color: collectionColors.progressText },
  progressTrack: { height: 7, borderRadius: 4, marginTop: 8, backgroundColor: collectionColors.progressTrack, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: collectionColors.progressFill },
});
