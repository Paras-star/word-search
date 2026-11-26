import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { RARITY_PRESENTATION, type Dumpling, type DumplingRarity } from '@/data/dumplings';
import { PANEL_GEOMETRY, type PanelSlotGeometry } from './panelGeometry';
import { collectionColors } from './collectionTheme';

export const PANEL_IMAGES: Record<DumplingRarity, ImageSourcePropType> = {
  Legendary: require('../../assets/images/collection/legendary-panel.png'),
  Epic: require('../../assets/images/collection/epic-panel.png'),
  Rare: require('../../assets/images/collection/rare-panel.png'),
  Uncommon: require('../../assets/images/collection/uncommon-panel.png'),
  Common: require('../../assets/images/collection/common-panel.png'),
};

export function panelHeight(rarity: DumplingRarity, width: number) {
  const g = PANEL_GEOMETRY[rarity];
  return Math.round((g.height / g.width) * width);
}

function DumplingSlot({
  dumpling,
  slot,
  k,
  isOwned,
  isNew,
  isVisible,
}: {
  dumpling: Dumpling;
  slot: PanelSlotGeometry;
  k: number;
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
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startIdle = useCallback(() => {
    if (idleTimerRef.current !== null) clearTimeout(idleTimerRef.current);
    if (idleLoopRef.current) idleLoopRef.current.stop();
    const randomDelay = Math.random() * 500;

    idleLoopRef.current = Animated.parallel([
      Animated.loop(
        Animated.sequence([
          Animated.timing(floatAnim, { toValue: -4, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
          Animated.timing(floatAnim, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false })
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(rotateAnim, { toValue: 1, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
          Animated.timing(rotateAnim, { toValue: -1, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
          Animated.timing(rotateAnim, { toValue: 0, duration: 2500, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false })
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.03, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
          Animated.timing(scaleAnim, { toValue: 0.98, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false })
        ])
      ),
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 0.4, duration: 1500, delay: 3000, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false }),
          Animated.timing(glowAnim, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true, isInteraction: false })
        ])
      )
    ]);
    idleTimerRef.current = setTimeout(() => {
      idleTimerRef.current = null;
      if (idleLoopRef.current) idleLoopRef.current.start();
    }, randomDelay);
  }, [floatAnim, rotateAnim, scaleAnim, glowAnim]);

  const stopIdle = useCallback(() => {
    if (idleTimerRef.current !== null) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
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
          Animated.spring(scaleAnim, { toValue: 1.2, friction: 4, useNativeDriver: true, isInteraction: false }),
          Animated.timing(glowAnim, { toValue: 1, duration: 500, useNativeDriver: true, isInteraction: false })
        ]),
        Animated.parallel([
          Animated.spring(scaleAnim, { toValue: 1, friction: 5, useNativeDriver: true, isInteraction: false }),
          Animated.timing(glowAnim, { toValue: 0, duration: 800, delay: 600, useNativeDriver: true, isInteraction: false })
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

  const rotation = rotateAnim.interpolate({ inputRange: [-1, 1], outputRange: ['-5deg', '5deg'] });

  const size = slot.dumplingSize * k;
  const left = slot.cx * k - size / 2;
  const top = slot.dumplingTop * k;
  const lockSize = Math.max(16, size * 0.36);
  const label = slot.label;

  return (
    <>
      <View
        testID={`slot-${dumpling.id}`}
        style={[styles.dumplingBox, { left, top, width: size, height: size }]}
      >
        {isOwned && (
          <Animated.View pointerEvents="none" style={[styles.glowWrap, { opacity: glowAnim }]}>
            <View style={[styles.glowBackdrop, { width: size * 1.25, height: size * 1.25, borderRadius: size, backgroundColor: rarity.glow }]} />
          </Animated.View>
        )}
        <Animated.View style={[styles.fill, { transform: [{ translateY: floatAnim }, { rotate: rotation }, { scale: scaleAnim }] }]}>
          {isOwned ? (
            <Image source={dumpling.asset} style={styles.fill} resizeMode="contain" testID={`dumpling-art-${dumpling.id}`} />
          ) : (
            <View style={styles.fill} testID={`locked-${dumpling.id}`}>
              <Image source={dumpling.asset} style={[styles.fill, styles.silhouette]} resizeMode="contain" />
              <View style={styles.lockCenter}>
                <View style={[styles.lockPlate, { width: lockSize, height: lockSize, borderRadius: lockSize * 0.28 }]}>
                  <Feather name="lock" size={lockSize * 0.62} color={collectionColors.lockIcon} />
                </View>
              </View>
            </View>
          )}
        </Animated.View>
      </View>
      <View style={[styles.labelBox, { left: label.x * k, top: label.y * k, width: label.w * k, height: label.h * k }]}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          style={[styles.labelText, { fontSize: Math.max(7, label.h * k * 0.5) }, !isOwned && styles.labelLocked]}
        >
          {isOwned ? dumpling.name : '???'}
        </Text>
      </View>
    </>
  );
}

export function RarityPanel({
  rarity,
  dumplings,
  width,
  owned,
  newDumplingId,
  visibleIds,
}: {
  rarity: DumplingRarity;
  dumplings: Dumpling[];
  width: number;
  owned: Set<string>;
  newDumplingId?: string;
  visibleIds: Set<string>;
}) {
  const g = PANEL_GEOMETRY[rarity];
  const k = width / g.width;
  const height = panelHeight(rarity, width);
  const ownedCount = dumplings.filter((d) => owned.has(d.id)).length;
  const c = g.counter;

  return (
    <View style={{ width, height }} testID={`panel-${rarity.toLowerCase()}`}>
      <Image source={PANEL_IMAGES[rarity]} style={[StyleSheet.absoluteFill, styles.fill]} resizeMode="contain" />
      <View style={[styles.counter, { left: (c.x + c.w / 2 - 45) * k, top: (c.y - 4) * k, width: 90 * k, height: (c.h + 8) * k }]}>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.counterText, { fontSize: Math.max(12, 26 * k) }]} testID={`panel-count-${rarity.toLowerCase()}`}>
          {ownedCount} / {dumplings.length}
        </Text>
      </View>
      {dumplings.map((d, i) => (
        <DumplingSlot
          key={d.id}
          dumpling={d}
          slot={g.slots[i]}
          k={k}
          isOwned={owned.has(d.id)}
          isNew={newDumplingId === d.id}
          isVisible={visibleIds.has(d.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
  dumplingBox: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  glowWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  glowBackdrop: { opacity: 0.45 },
  silhouette: { tintColor: collectionColors.silhouette, opacity: 0.62 },
  lockCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingTop: '12%' },
  lockPlate: {
    backgroundColor: collectionColors.lockPlate,
    borderWidth: 1.5,
    borderColor: collectionColors.lockPlateEdge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelBox: { position: 'absolute', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  labelText: { fontFamily: 'Inter_700Bold', color: collectionColors.labelInk, textAlign: 'center' },
  labelLocked: { color: collectionColors.labelInkLocked, letterSpacing: 1 },
  counter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  counterText: {
    fontFamily: 'Inter_700Bold',
    color: collectionColors.counterText,
    textShadowColor: collectionColors.counterShadow,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
