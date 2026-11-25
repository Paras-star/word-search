import React, { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { localDateKey } from '@/game/daily';
import { DAILY_MONTHS, DAILY_WEEKDAYS, dailyCellModel, monthCells } from '@/components/dailyCalendarState';

export const DAILY_ART = {
  calendar: require('@/assets/images/daily/calendar.png'),
  regular: require('@/assets/images/daily/regular-dumpling.png'),
  crowned: require('@/assets/images/daily/crowned-dumpling.png'),
  golden: require('@/assets/images/daily/golden-selected-dumpling.png'),
  paper: require('@/assets/images/daily/calendar-background.png'),
};

/** Clean parchment region of calendar-background.png (1182 x 1330): below the
 *  wood strip (ends y~340), above the corner clouds (start y~1100), no dates. */
export const PAPER_ART = { width: 1182, height: 1330 };
export const PAPER_SOURCE = { x: 250, y: 380, width: 750, height: 650 };

/** Uniform cover-scale of PAPER_SOURCE into the mask, centred within the region. */
export function paperTexture(maskWidth: number, maskHeight: number) {
  const k = Math.max(maskWidth / PAPER_SOURCE.width, maskHeight / PAPER_SOURCE.height);
  return {
    k,
    left: -(PAPER_SOURCE.x + (PAPER_SOURCE.width - maskWidth / k) / 2) * k,
    top: -(PAPER_SOURCE.y + (PAPER_SOURCE.height - maskHeight / k) / 2) * k,
    width: PAPER_ART.width * k,
    height: PAPER_ART.height * k,
  };
}

// Native pixel geometry of calendar.png (448 x 556). Only the transparent
// exterior padding is cropped away (by an overflow-hidden frame and a negative
// image offset); the bitmap itself is drawn at its original uniform scale.
// The mask covers the baked month title, arrows, weekdays, numbers and sample
// dumplings while leaving the rings, wooden frame and page edges untouched.
export const CALENDAR_ART = { width: 448, height: 556 };
export const CALENDAR_VISIBLE = { x: 28, y: 65, width: 404, height: 347 };
export const CALENDAR_MASK = { left: 44, top: 119, width: 366, height: 268 };
/** Smallest uniform scale that keeps six-week rows ~32pt tall. */
export const MIN_SIX_WEEK_SCALE = 0.9;

/** ~90% of the safe viewport width, never below the six-week minimum scale. */
export function calendarWidth(viewportWidth: number, left: number, right: number, rows: number) {
  const available = viewportWidth - left - right;
  const preferred = Math.min(available * 0.92, 500);
  const minimum = rows >= 6 ? CALENDAR_VISIBLE.width * MIN_SIX_WEEK_SCALE : 0;
  const width = Math.max(preferred, minimum);
  return { width, available, scrollsHorizontally: width + 8 > available };
}

export function calendarLayout(width: number, rows: number) {
  const s = width / CALENDAR_VISIBLE.width;
  const compact = rows >= 6;
  const monthRow = (compact ? 34 : 40) * s;
  const weekRow = (compact ? 18 : 22) * s;
  const gridPad = (compact ? 2 : 6) * s;
  const mask = {
    left: (CALENDAR_MASK.left - CALENDAR_VISIBLE.x) * s,
    top: (CALENDAR_MASK.top - CALENDAR_VISIBLE.y) * s,
    width: CALENDAR_MASK.width * s,
    height: CALENDAR_MASK.height * s,
  };
  const inset = 6 * s;
  const gridH = mask.height - monthRow - weekRow - gridPad;
  const cellW = (mask.width - inset * 2) / 7;
  const rowH = gridH / rows;
  return {
    s, monthRow, weekRow, mask, inset, gridH, cellW, rowH,
    height: CALENDAR_VISIBLE.height * s,
    image: { left: -CALENDAR_VISIBLE.x * s, top: -CALENDAR_VISIBLE.y * s, width: CALENDAR_ART.width * s, height: CALENDAR_ART.height * s },
    // Never taller than a row, so adjacent dumplings cannot overlap.
    art: Math.min(cellW * 0.94, rowH),
  };
}

const INK = '#4A230C';
const INK_SOFT = '#8A5A33';
const PAPER = '#FFEFD1';
const RULE = '#E9D2AE';
const GOLD = '#E8A317';
export const SELECTION_FADE_MS = 200;
const NO_COMPLETIONS: ReadonlySet<string> = new Set();

/** Mount both sources immediately, including the invisible golden layer. This
 * warms the small state artwork without awaiting prefetch or hiding the calendar.
 * Selection only changes wrapper opacity/test IDs, never an Image's source. */
function DumplingLayers({ selected, dateKey, art }: { selected: boolean; dateKey: string; art: number }) {
  const golden = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const regular = useMemo(() => golden.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), [golden]);
  const previous = useRef(selected);
  useEffect(() => {
    if (previous.current === selected) return;
    previous.current = selected;
    const animation = Animated.timing(golden, {
      toValue: selected ? 1 : 0, duration: SELECTION_FADE_MS, useNativeDriver: true,
    });
    animation.start();
    // Stop at the current opacity on rapid retaps, then animate toward the latest
    // selection; an old completion callback can never restore a stale state.
    return () => animation.stop();
  }, [golden, selected]);
  return <View style={{ width: art, height: art }} pointerEvents="none">
    <Animated.View style={[styles.artLayer, { opacity: regular }]} testID={`daily-layer-regular-${dateKey}`}>
      <Image source={DAILY_ART.regular} testID={!selected ? `daily-art-available-${dateKey}` : undefined}
        accessible={false} style={{ width: art, height: art }} resizeMode="contain" />
    </Animated.View>
    <Animated.View style={[styles.artLayer, { opacity: golden }]} testID={`daily-layer-golden-${dateKey}`}>
      <Image source={DAILY_ART.golden} testID={selected ? `daily-art-selected-${dateKey}` : undefined}
        accessible={false} style={{ width: art, height: art }} resizeMode="contain" />
    </Animated.View>
  </View>;
}

type DateCellProps = {
  date: Date;
  now: Date;
  completed: boolean;
  selected: boolean;
  firstColumn: boolean;
  firstRow: boolean;
  cellW: number;
  rowH: number;
  art: number;
  numberSize: number;
  onSelect: (key: string) => void;
};

// Stable dates, callback and primitive state/layout props let React skip every
// unaffected date. Eligibility and accessibility still use the original model.
const DailyDateCell = memo(function DailyDateCell({
  date, now, completed, selected, firstColumn, firstRow, cellW, rowH, art, numberSize, onSelect,
}: DateCellProps) {
  const key = localDateKey(date);
  const cell = dailyCellModel(date, now, completed ? new Set([key]) : NO_COMPLETIONS, selected ? key : '');
  const hasArt = cell.completed || cell.selectable;
  const frame = { width: cellW, height: rowH, borderLeftWidth: firstColumn ? 1 : 0, borderTopWidth: firstRow ? 1 : 0 };
  return <View style={[styles.cell, frame, cell.completed && cell.selected ? styles.completedSelected : null]}>
    <Pressable
      disabled={!cell.selectable}
      onPress={() => onSelect(cell.key)}
      accessibilityRole="button"
      accessibilityLabel={cell.label}
      accessibilityState={{ disabled: !cell.selectable, selected: cell.selected }}
      testID={`daily-date-${cell.key}`}
      style={({ pressed }) => [styles.hit, { opacity: pressed ? 0.75 : 1, transform: [{ scale: pressed ? 0.94 : 1 }] }]}
    >
      {cell.completed
        ? <Image source={DAILY_ART.crowned} testID={`daily-art-completed-${cell.key}`}
          style={{ width: art, height: art, marginTop: -art * 0.06 }} resizeMode="contain" />
        : cell.selectable ? <DumplingLayers selected={cell.selected} dateKey={cell.key} art={art} /> : null}
      {!cell.completed ? <Text style={[styles.dayNumber, hasArt ? styles.dayOnArt : null, {
        fontSize: numberSize,
        top: hasArt ? rowH / 2 - numberSize * 0.4 : undefined,
        textDecorationLine: cell.today && !hasArt ? 'underline' : 'none',
      }]}>{cell.day}</Text> : null}
    </Pressable>
  </View>;
});

export function DailyCalendar({ width, month, now, completed, selected, canGoNext, onShiftMonth, onSelect }: {
  width: number;
  month: Date;
  now: Date;
  completed: ReadonlySet<string>;
  selected: string;
  canGoNext: boolean;
  onShiftMonth: (offset: number) => void;
  onSelect: (key: string) => void;
}) {
  const cells = useMemo(() => monthCells(month), [month]);
  const L = useMemo(() => calendarLayout(width, cells.length / 7), [width, cells.length]);
  const { s, cellW, rowH, gridH, art } = L;
  const numberSize = Math.max(11, Math.min(17, rowH * 0.46, cellW * 0.36));

  return <View style={{ width, height: L.height, overflow: 'hidden' }} testID="daily-calendar">
    <Image source={DAILY_ART.calendar} testID="daily-calendar-art" style={{ position: 'absolute', ...L.image }} resizeMode="stretch" accessibilityIgnoresInvertColors />
    <View testID="daily-calendar-mask" style={[styles.mask, { ...L.mask, borderRadius: 6 * s, paddingHorizontal: L.inset }]}>
      <Image source={DAILY_ART.paper} testID="daily-calendar-paper" accessible={false} resizeMode="stretch" style={[styles.paper, (({ k: _k, ...r }) => r)(paperTexture(L.mask.width, L.mask.height))]} />
      <View pointerEvents="none" style={styles.paperWash} />
      <View style={[styles.monthRow, { height: L.monthRow }]}>
        <Pressable onPress={() => onShiftMonth(-1)} accessibilityRole="button" accessibilityLabel="Previous month" testID="daily-prev-month" hitSlop={10} style={({ pressed }) => [styles.arrow, { width: 30 * s, height: 26 * s, borderRadius: 7 * s, opacity: pressed ? 0.65 : 1 }]}>
          <Feather name="chevron-left" size={Math.max(15, 19 * s)} color={INK} />
        </Pressable>
        <Text style={[styles.monthLabel, { fontSize: Math.max(16, 21 * s) }]} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit>{DAILY_MONTHS[month.getMonth()]} {month.getFullYear()}</Text>
        <Pressable onPress={() => onShiftMonth(1)} disabled={!canGoNext} accessibilityRole="button" accessibilityLabel="Next month" accessibilityState={{ disabled: !canGoNext }} testID="daily-next-month" hitSlop={10} style={[styles.arrow, { width: 30 * s, height: 26 * s, borderRadius: 7 * s, opacity: canGoNext ? 1 : 0.32 }]}>
          <Feather name="chevron-right" size={Math.max(15, 19 * s)} color={INK} />
        </Pressable>
      </View>
      <View style={[styles.weekRow, { height: L.weekRow }]}>
        {DAILY_WEEKDAYS.map((day) => <Text key={day} style={[styles.weekday, { fontSize: Math.max(10, 12.5 * s) }]}>{day}</Text>)}
      </View>
      <View style={[styles.grid, { height: gridH }]}>
        {cells.map((date, index) => {
          const col = index % 7;
          const row = Math.floor(index / 7);
          const frame = { width: cellW, height: rowH, borderLeftWidth: col === 0 ? 1 : 0, borderTopWidth: row === 0 ? 1 : 0 };
          if (!date) return <View key={`blank-${index}`} style={[styles.cell, frame]} />;
          const key = localDateKey(date);
          return <DailyDateCell key={key} date={date} now={now}
            completed={completed.has(key)} selected={key === selected}
            firstColumn={col === 0} firstRow={row === 0}
            cellW={cellW} rowH={rowH} art={art} numberSize={numberSize} onSelect={onSelect} />;
        })}
      </View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  artLayer: { position: 'absolute', left: 0, top: 0 },
  mask: { position: 'absolute', backgroundColor: PAPER, overflow: 'hidden' },
  paper: { position: 'absolute', pointerEvents: 'none' },
  paperWash: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255, 243, 222, 0.28)' },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  arrow: { backgroundColor: '#FFF6E4', borderWidth: 1, borderColor: '#D9B88A', alignItems: 'center', justifyContent: 'center' },
  monthLabel: { flex: 1, textAlign: 'center', fontFamily: 'Inter_700Bold', color: INK, letterSpacing: -0.3, marginHorizontal: 6 },
  weekRow: { flexDirection: 'row', alignItems: 'center' },
  weekday: { flex: 1, textAlign: 'center', fontFamily: 'Inter_600SemiBold', color: INK_SOFT },
  grid: { flexDirection: 'row', flexWrap: 'wrap', borderColor: RULE },
  cell: { borderColor: RULE, borderRightWidth: 1, borderBottomWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'visible' },
  completedSelected: { backgroundColor: '#FBE0A0', borderColor: GOLD, borderWidth: 2 },
  hit: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  dayNumber: { fontFamily: 'Inter_700Bold', color: INK },
  dayOnArt: { position: 'absolute' },
});
