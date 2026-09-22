import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  Image,
  StyleSheet,
  Text,
  View,
  type DimensionValue,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header, LoadingScreen, Screen } from '@/components/GameUI';
import { DUMPLINGS, RARITY_PRESENTATION, type Dumpling } from '@/data/dumplings';
import { useColors } from '@/hooks/useColors';
import { getCollection } from '@/services/dumplingRewards';

const BAND_HEIGHT = 260;
const SLOT_VISIBILITY_MARGIN = 70;
type RoomPosition = { top: number; left: DimensionValue };

const roomStyles = StyleSheet.create({
  band: { width: '100%', height: BAND_HEIGHT, backgroundColor: '#FFF9F2', overflow: 'hidden' },
  window: { position: 'absolute', top: 40, left: '20%', width: '60%', height: 120, backgroundColor: '#E2F0F9', borderRadius: 60, borderWidth: 6, borderColor: '#FFFFFF' },
  windowPane: { position: 'absolute', top: '50%', width: '100%', height: 6, backgroundColor: '#FFFFFF' },
  windowPaneVert: { position: 'absolute', left: '50%', width: 6, height: '100%', backgroundColor: '#FFFFFF' },
  shelf: { position: 'absolute', height: 12, backgroundColor: '#A37A5B', borderRadius: 4, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 4 } },
  hangingPlantBase: { position: 'absolute', top: -10, left: '30%', width: 40, height: 20, backgroundColor: '#C08A65', borderRadius: 10 },
  hangingPlantVines: { position: 'absolute', top: 10, left: '25%', width: 50, height: 80, backgroundColor: '#6D9773', borderBottomLeftRadius: 25, borderBottomRightRadius: 25 },
  pictureFrame: { position: 'absolute', top: 60, left: '60%', width: 50, height: 70, backgroundColor: '#F0E5D8', borderWidth: 4, borderColor: '#7A543B' },
  bookshelfBase: { position: 'absolute', left: '65%', width: '28%', backgroundColor: '#8E6746', borderWidth: 4, borderColor: '#6B4A30' },
  lampStand: { position: 'absolute', bottom: 0, left: '25%', width: 8, height: 150, backgroundColor: '#5A5A5A' },
  lampShade: { position: 'absolute', bottom: 130, left: '15%', width: '28%', height: 40, backgroundColor: '#F7D08A', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  wainscoting: { position: 'absolute', bottom: 0, width: '100%', height: 120, backgroundColor: '#F0E6D8', borderTopWidth: 4, borderColor: '#E0D3C1' },
  wainscotingPanel: { position: 'absolute', top: 15, left: '5%', width: '90%', height: 90, borderWidth: 2, borderColor: '#E0D3C1', borderRadius: 4 },
  sideTable: { position: 'absolute', bottom: 0, left: '15%', width: '30%', height: 80, backgroundColor: '#A37A5B', borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  fireplaceTop: { position: 'absolute', bottom: 0, left: '30%', width: '40%', height: 140, backgroundColor: '#D9D9D9', borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  fireplaceMantel: { position: 'absolute', top: -10, left: '-5%', width: '110%', height: 14, backgroundColor: '#A37A5B', borderRadius: 4 },
  fireplaceBottom: { position: 'absolute', top: 0, left: '30%', width: '40%', height: 120, backgroundColor: '#D9D9D9' },
  fireplaceOpening: { position: 'absolute', bottom: 0, left: '20%', width: '60%', height: 90, backgroundColor: '#2C2C2C', borderTopLeftRadius: 40, borderTopRightRadius: 40 },
  rug: { position: 'absolute', bottom: -20, left: '10%', width: '80%', height: 60, backgroundColor: '#D98973', borderRadius: 100, transform: [{ scaleY: 0.5 }] },
  cushion: { position: 'absolute', bottom: 20, left: '40%', width: '30%', height: 40, backgroundColor: '#6D9773', borderRadius: 20 },
  floorPlantPot: { position: 'absolute', bottom: 0, left: '75%', width: 50, height: 60, backgroundColor: '#C08A65', borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  floorPlantLeaves: { position: 'absolute', bottom: 50, left: '65%', width: 70, height: 90, backgroundColor: '#4A7055', borderRadius: 35 },
  floorLine: { position: 'absolute', bottom: 0, width: '100%', height: 40, backgroundColor: '#8B6B53', borderTopWidth: 4, borderColor: '#6B4A30' },
  beanbag: { position: 'absolute', bottom: 20, left: '20%', width: '40%', height: 70, backgroundColor: '#E2A973', borderTopLeftRadius: 40, borderTopRightRadius: 60, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 }
});

const BAND_CONFIGS: { decor: () => React.JSX.Element; slots: RoomPosition[] }[] = [
  {
    decor: () => (
      <>
        <View style={roomStyles.window}>
          <View style={roomStyles.windowPane} />
          <View style={roomStyles.windowPaneVert} />
        </View>
        <View style={[roomStyles.shelf, { top: 170, left: '15%', width: '35%' }]} />
        <View style={[roomStyles.shelf, { top: 220, left: '65%', width: '25%' }]} />
      </>
    ),
    slots: [{ top: 115, left: '25%' }, { top: 165, left: '70%' }, { top: 60, left: '75%' }]
  },
  {
    decor: () => (
      <>
        <View style={roomStyles.hangingPlantBase} />
        <View style={roomStyles.hangingPlantVines} />
        <View style={roomStyles.pictureFrame} />
        <View style={[roomStyles.shelf, { top: 150, left: '45%', width: '45%' }]} />
      </>
    ),
    slots: [{ top: 40, left: '15%' }, { top: 95, left: '65%' }, { top: 160, left: '45%' }]
  },
  {
    decor: () => (
      <>
        <View style={[roomStyles.bookshelfBase, { bottom: 0, height: 200 }]} />
        <View style={[roomStyles.shelf, { bottom: 180, left: '62%', width: '34%' }]} />
        <View style={[roomStyles.shelf, { bottom: 100, left: '62%', width: '34%' }]} />
        <View style={[roomStyles.shelf, { top: 110, left: '15%', width: '30%' }]} />
      </>
    ),
    slots: [{ top: 55, left: '25%' }, { top: 60, left: '75%' }, { top: 140, left: '75%' }]
  },
  {
    decor: () => (
      <>
        <View style={[roomStyles.bookshelfBase, { top: 0, height: BAND_HEIGHT }]} />
        <View style={[roomStyles.shelf, { top: 60, left: '62%', width: '34%' }]} />
        <View style={[roomStyles.shelf, { top: 160, left: '62%', width: '34%' }]} />
        <View style={[roomStyles.shelf, { top: 100, left: '10%', width: '25%' }]} />
        <View style={[roomStyles.shelf, { top: 210, left: '15%', width: '35%' }]} />
      </>
    ),
    slots: [{ top: 55, left: '75%' }, { top: 135, left: '75%' }, { top: 175, left: '25%' }]
  },
  {
    decor: () => (
      <>
        <View style={[roomStyles.bookshelfBase, { top: 0, height: 160 }]} />
        <View style={[roomStyles.shelf, { top: 60, left: '62%', width: '34%' }]} />
        <View style={roomStyles.lampStand} />
        <View style={roomStyles.lampShade} />
      </>
    ),
    slots: [{ top: 55, left: '75%' }, { top: 75, left: '30%' }, { top: 170, left: '75%' }]
  },
  {
    decor: () => (
      <>
        <View style={roomStyles.wainscoting}><View style={roomStyles.wainscotingPanel}/></View>
        <View style={roomStyles.sideTable} />
      </>
    ),
    slots: [{ top: 50, left: '20%' }, { top: 160, left: '50%' }, { top: 120, left: '80%' }]
  },
  {
    decor: () => (
      <>
        <View style={roomStyles.wainscoting}><View style={roomStyles.wainscotingPanel}/></View>
        <View style={roomStyles.fireplaceTop}>
          <View style={roomStyles.fireplaceMantel} />
        </View>
        <View style={[roomStyles.shelf, { top: 80, left: '8%', width: '22%' }]} />
      </>
    ),
    slots: [{ top: 25, left: '15%' }, { top: 140, left: '45%' }, { top: 70, left: '85%' }]
  },
  {
    decor: () => (
      <>
        <View style={roomStyles.wainscoting}><View style={roomStyles.wainscotingPanel}/></View>
        <View style={roomStyles.rug} />
        <View style={roomStyles.fireplaceBottom}>
          <View style={roomStyles.fireplaceOpening} />
        </View>
      </>
    ),
    slots: [{ top: 80, left: '25%' }, { top: 170, left: '50%' }, { top: 110, left: '75%' }]
  },
  {
    decor: () => (
      <>
        <View style={roomStyles.wainscoting}><View style={roomStyles.wainscotingPanel}/></View>
        <View style={roomStyles.cushion} />
        <View style={roomStyles.floorPlantLeaves} />
        <View style={roomStyles.floorPlantPot} />
      </>
    ),
    slots: [{ top: 40, left: '20%' }, { top: 110, left: '50%' }, { top: 170, left: '80%' }]
  },
  {
    decor: () => (
      <>
        <View style={roomStyles.wainscoting}><View style={roomStyles.wainscotingPanel}/></View>
        <View style={roomStyles.floorLine} />
        <View style={roomStyles.beanbag} />
      </>
    ),
    slots: [{ top: 60, left: '30%' }, { top: 140, left: '45%' }, { top: 120, left: '75%' }]
  }
];

function DumplingSlot({
  dumpling,
  position,
  isOwned,
  isNew,
  isVisible,
}: {
  dumpling: Dumpling;
  position: RoomPosition;
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
    <View style={[styles.slot, { left: position.left, top: position.top }]} testID={`slot-${dumpling.id}`}>
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
  const newDumplingIndex = params.newDumplingId
    ? DUMPLINGS.findIndex((dumpling) => dumpling.id === params.newDumplingId)
    : -1;
  const initialBandIndex = newDumplingIndex >= 0 ? Math.floor(newDumplingIndex / 3) : 0;
  const [ownedIds, setOwnedIds] = useState<string[] | null>(null);
  const [visibleDumplingIds, setVisibleDumplingIds] = useState<Set<string>>(new Set());
  const viewportHeightRef = useRef(0);
  const scrollOffsetRef = useRef(initialBandIndex * BAND_HEIGHT);

  useEffect(() => {
    let active = true;
    getCollection()
      .then(({ ownedDumplingIds }) => { if (active) setOwnedIds(ownedDumplingIds); })
      .catch(() => { if (active) setOwnedIds([]); });
    return () => { active = false; };
  }, []);

  const updateVisibleDumplings = useCallback((scrollOffset: number, viewportHeight: number) => {
    if (viewportHeight <= 0) return;

    const viewportTop = scrollOffset;
    const viewportBottom = scrollOffset + viewportHeight;
    const nextVisible = new Set<string>();

    BAND_CONFIGS.forEach((band, bandIndex) => {
      band.slots.forEach((position, slotIndex) => {
        const dumpling = DUMPLINGS[bandIndex * 3 + slotIndex];
        if (!dumpling) return;

        const slotCenter = bandIndex * BAND_HEIGHT + position.top;
        if (
          slotCenter + SLOT_VISIBILITY_MARGIN >= viewportTop
          && slotCenter - SLOT_VISIBILITY_MARGIN <= viewportBottom
        ) {
          nextVisible.add(dumpling.id);
        }
      });
    });

    setVisibleDumplingIds((current) => {
      if (
        current.size === nextVisible.size
        && [...current].every((id) => nextVisible.has(id))
      ) {
        return current;
      }
      return nextVisible;
    });
  }, []);

  const handleRoomLayout = useCallback((event: LayoutChangeEvent) => {
    const viewportHeight = event.nativeEvent.layout.height;
    viewportHeightRef.current = viewportHeight;
    updateVisibleDumplings(scrollOffsetRef.current, viewportHeight);
  }, [updateVisibleDumplings]);

  const handleRoomScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrollOffset = event.nativeEvent.contentOffset.y;
    scrollOffsetRef.current = scrollOffset;
    updateVisibleDumplings(scrollOffset, viewportHeightRef.current);
  }, [updateVisibleDumplings]);

  if (ownedIds === null) return <LoadingScreen />;
  const owned = new Set(ownedIds);
  const progress = Math.round((owned.size / DUMPLINGS.length) * 100);

  const renderSection = ({ item, index }: { item: typeof BAND_CONFIGS[0]; index: number }) => {
    const sectionDumplings = DUMPLINGS.slice(index * 3, (index + 1) * 3);
    const sectionPositions = item.slots;

    return (
      <View style={roomStyles.band}>
        <item.decor />
        {sectionDumplings.map((dumpling, idx) => (
          <DumplingSlot
            key={dumpling.id}
            dumpling={dumpling}
            position={sectionPositions[idx]}
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

        <View style={[styles.houseContainer, { borderColor: colors.border }]}>
          <FlatList
            data={BAND_CONFIGS}
            keyExtractor={(_, i) => i.toString()}
            renderItem={renderSection}
            showsVerticalScrollIndicator={false}
            onLayout={handleRoomLayout}
            onScroll={handleRoomScroll}
            scrollEventThrottle={64}
            initialScrollIndex={initialBandIndex}
            getItemLayout={(_, index) => ({ length: BAND_HEIGHT, offset: BAND_HEIGHT * index, index })}
            contentContainerStyle={{ paddingBottom: 60 }}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progressCard: { borderWidth: 1, borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressKicker: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.2 },
  progressTitle: { fontFamily: 'Inter_700Bold', fontSize: 19, marginTop: 5 },
  progressCircle: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  progressPercent: { fontFamily: 'Inter_700Bold', fontSize: 14 },
  houseContainer: { flex: 1, borderWidth: 2, borderRadius: 22, overflow: 'hidden', backgroundColor: '#FFF9F2', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  slot: { position: 'absolute', width: 90, transform: [{ translateX: -45 }, { translateY: -40 }], alignItems: 'center', justifyContent: 'center', zIndex: 10 },
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
