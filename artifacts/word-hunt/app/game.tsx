import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { Redirect, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen, CoinPill, SoftButton } from '@/components/GameUI';
import { CATEGORIES, getCategory } from '@/data/categories';
import { BONUS_WORDS } from '@/data/bonusWords';
import { generatePuzzle, gridCellFromPoint, lettersFor, lineCells, type GridBounds } from '@/game/puzzle';
import { getPuzzleCategory } from '@/game/puzzleConfig';
import { getOnboardingStep } from '@/game/onboarding';
import { dailyCategory, dailySeed, isDailyDatePlayable, parseLocalDateKey } from '@/game/daily';
import { getDailyPuzzle } from '@/game/dailyPuzzle';
import { isCategoryUnlocked } from '@/game/progression';
import { completionBonus, formatTime, scoreFoundWord } from '@/game/scoring';
import { homeColors } from '@/constants/homePalette';
import { buildFoundHighlights } from '@/game/foundHighlights';
import type { Cell, GameMode, Puzzle } from '@/game/types';
import { useGame } from '@/context/GameProvider';
import { rewardGateway } from '@/services/rewardGateway';
import { playSound } from '@/services/audio';
import { useColors } from '@/hooks/useColors';
import { useRewardedAd } from '@/hooks/useRewardedAd';
import { RewardedAdButton } from '@/components/RewardedAdButton';
import { createHintReward, REWARDED_HINTS } from '@/services/rewardedBenefits';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function cellKey(cell: Cell) { return `${cell.row}-${cell.col}`; }
function sameCell(a: Cell, b: Cell) { return a.row === b.row && a.col === b.col; }
function nearCurrentLine(start: Cell, end: Cell, current: Cell[], size: number): Cell[] {
  if (current.length < 3) return [];
  const rowStep = current[1].row - start.row;
  const colStep = current[1].col - start.col;
  const rowDistance = (end.row - start.row) * rowStep;
  const colDistance = (end.col - start.col) * colStep;
  let steps: number;
  if (rowStep === 0) {
    if (Math.abs(end.row - start.row) !== 1 || colDistance < 2) return [];
    steps = colDistance;
  } else if (colStep === 0) {
    if (Math.abs(end.col - start.col) !== 1 || rowDistance < 2) return [];
    steps = rowDistance;
  } else {
    if (rowDistance < 2 || colDistance < 2 || Math.abs(rowDistance - colDistance) !== 1) return [];
    steps = Math.min(rowDistance, colDistance);
  }
  return lineCells(start, { row: start.row + rowStep * steps, col: start.col + colStep * steps }, size);
}
const GAME_PADDING = 16;
const BOARD_MAX_WIDTH = 380;
// Leave room for the header, status row, word list and hint button on short screens.
const NON_BOARD_HEIGHT = 350;

type GameParams = { categoryId?: string; mode?: GameMode; seed?: string; onboardingStep?: string; dailyDate?: string };

export default function GameScreen() {
  const params = useLocalSearchParams<GameParams>();
  const sessionKey = params.onboardingStep !== undefined
    ? `onboarding:${params.onboardingStep}`
    : params.dailyDate !== undefined
      ? `daily:${params.dailyDate}`
      : `category:${params.categoryId ?? ''}:${params.mode ?? ''}:${params.seed ?? ''}`;
  return <GameSession key={sessionKey} params={params} />;
}

function GameSession({ params }: { params: GameParams }) {
  const router = useRouter();
  const colors = useColors();
  const { width, height } = useWindowDimensions();
  const { top, bottom } = useSafeAreaInsets();
  const { categoryId, mode: rawMode, seed, onboardingStep: rawOnboardingStep, dailyDate: rawDailyDate } = params;
  const requestedStep = rawOnboardingStep === undefined ? null : Number(rawOnboardingStep);
  const onboarding = requestedStep !== null && Number.isInteger(requestedStep) ? getOnboardingStep(requestedStep) : undefined;
  const daily = !onboarding && rawDailyDate !== undefined && parseLocalDateKey(rawDailyDate)
    ? { category: dailyCategory(rawDailyDate), seed: dailySeed(rawDailyDate) } : null;
  const expandedWordCount = onboarding?.words.length
    ?? (!daily && categoryId === 'human-anatomy' ? getCategory(categoryId).words.length : 0);
  const extraWordHeight = Math.max(0, Math.ceil(expandedWordCount / 3) - 3) * 29;
  const boardSize = Math.max(0, Math.min(width - GAME_PADDING * 2, BOARD_MAX_WIDTH, height - top - bottom - NON_BOARD_HEIGHT - (onboarding ? 48 + extraWordHeight : daily ? 28 : extraWordHeight)));
  const mode: GameMode = onboarding || daily ? 'classic' : rawMode === 'time' ? 'time' : 'classic';
  const category = onboarding
    ? { id: `onboarding-${requestedStep}`, name: onboarding.label, emoji: '✨', words: onboarding.words }
    : daily?.category ?? getCategory(categoryId);
  const { coins, awardCoins, completeLevel, completeOnboardingStep, completeDailyPuzzle, completedDailyPuzzles, completedLevels, onboardingStep } = useGame();
  const puzzleSeed = onboarding ? onboarding.seed : daily?.seed ?? seed ?? `${category.id}:default`;
  // Saving the first completion updates progress before navigation; keep this puzzle unchanged.
  const activePuzzle = useRef<{ categoryId: string; seed: string; puzzle: Puzzle } | null>(null);
  if (activePuzzle.current?.categoryId !== category.id || activePuzzle.current.seed !== puzzleSeed) {
    activePuzzle.current = {
      categoryId: category.id,
      seed: puzzleSeed,
      puzzle: daily ? getDailyPuzzle(rawDailyDate!) : generatePuzzle(onboarding ? category : getPuzzleCategory(category, completedLevels), puzzleSeed, onboarding?.options),
    };
  }
  const puzzle = activePuzzle.current.puzzle;
  const [score, setScore] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [timeLeft, setTimeLeft] = useState(120);
  const [hints, setHints] = useState(3);
  const [hintCells, setHintCells] = useState<Cell[]>([]);
  const hintTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [bonusWords, setBonusWords] = useState<string[]>([]);
  const [foundPaths, setFoundPaths] = useState<Record<string, Cell[]>>({});
  const [selectedCells, setSelectedCells] = useState<Cell[]>([]);
  const [feedback, setFeedback] = useState<'idle' | 'wrong' | 'bonus'>('idle');
  const [finishError, setFinishError] = useState(false);
  const gridBoundsRef = useRef<GridBounds | null>(null);
  const measurementVersion = useRef(0);
  const gridContentRef = useRef<View>(null);
  const selectedCellsRef = useRef<Cell[]>([]);
  const completionStarted = useRef(false);
  const completionStage = useRef(0);
  const completionSoundPlayed = useRef(false);
  const startTime = useRef(Date.now());
  const foundRef = useRef(foundWords);
  foundRef.current = foundWords;
  const hintAd = useRewardedAd('puzzle-hints');
  // Only the focused, mounted, unfinished puzzle may receive a rewarded-hint grant.
  const activePuzzleKey = useRef<string | null>(null);
  const adPaused = useRef(false);
  useFocusEffect(useCallback(() => {
    activePuzzleKey.current = puzzle.id;
    setHintCells([]);
    return () => {
      activePuzzleKey.current = null;
      if (hintTimeout.current) clearTimeout(hintTimeout.current);
      hintTimeout.current = null;
    };
  }, [puzzle.id]));
  const watchHintAd = () => {
    if (adPaused.current || hintAd.loading || completionStarted.current || foundWords.length === puzzle.words.length) return;
    const onEarned = createHintReward(
      puzzle.id,
      () => completionStarted.current ? null : activePuzzleKey.current,
      (amount) => setHints((prev) => prev + amount),
    );
    adPaused.current = true;
    const pausedAt = Date.now();
    playSound('tap');
    void hintAd.watch(onEarned).finally(() => {
      adPaused.current = false;
      // Keep the ad presentation out of classic-mode final-time bookkeeping.
      startTime.current += Date.now() - pausedAt;
    });
  };

  const finish = useCallback(async () => {
    if (completionStarted.current) return;
    completionStarted.current = true;
    const finalScore = score + completionBonus(mode, timeLeft);
    const finalTime = mode === 'time' ? 120 - timeLeft : Math.floor((Date.now() - startTime.current) / 1000);
    try {
      if (onboarding && requestedStep !== null) {
        if (completionStage.current < 1) {
          const awarded = await completeOnboardingStep(requestedStep);
          if (!awarded) {
            router.replace('/');
            return;
          }
          completionStage.current = 1;
        }
        router.replace({ pathname: '/results', params: { onboardingStep: String(requestedStep), score: String(finalScore), time: String(finalTime) } });
        return;
      }
      if (rawDailyDate !== undefined) {
        if (!daily || !isDailyDatePlayable(rawDailyDate)) {
          if (router.canGoBack()) router.back();
          else router.replace('/daily');
          return;
        }
        if (completionStage.current < 1) {
          const awarded = await completeDailyPuzzle(rawDailyDate);
          if (!awarded) {
            if (router.canGoBack()) router.back();
            else router.replace('/daily');
            return;
          }
          completionStage.current = 1;
        }
        router.replace({ pathname: '/results', params: { dailyDate: rawDailyDate, score: String(finalScore), time: String(finalTime) } });
        return;
      }
      if (completionStage.current < 1) {
        await awardCoins(50);
        completionStage.current = 1;
      }
      if (completionStage.current < 2) {
        await completeLevel(category.id);
        completionStage.current = 2;
        if (!completionSoundPlayed.current) {
          completionSoundPlayed.current = true;
          playSound('complete');
        }
      }
      if (completionStage.current < 3) {
        await rewardGateway.onPuzzleCompleted({ puzzleId: puzzle.id, categoryId: category.id, mode, score: finalScore });
        completionStage.current = 3;
      }
      router.replace({ pathname: '/reward', params: { categoryId: category.id, mode, score: String(finalScore), time: String(finalTime), puzzleId: puzzle.id } });
    } catch {
      setFinishError(true);
    }
  }, [awardCoins, category.id, completeLevel, completeOnboardingStep, completeDailyPuzzle, daily, mode, onboarding, puzzle.id, rawDailyDate, requestedStep, router, score, timeLeft]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (completionStarted.current || adPaused.current) return;
      if (mode === 'classic') setElapsed((value) => value + 1);
      else setTimeLeft((value) => {
        if (value <= 1) {
          clearInterval(timer);
          playSound('gameOver');
          router.replace({ pathname: '/results', params: { categoryId: category.id, mode, score: String(score), time: '120', gameOver: '1' } });
          return 0;
        }
        if (value <= 30) playSound('countdown');
        return value - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [category.id, mode, router, score]);

  useEffect(() => { if (foundWords.length === puzzle.words.length) void finish(); }, [finish, foundWords.length, puzzle.words.length]);

  const refreshGridBounds = () => {
    const version = ++measurementVersion.current;
    gridBoundsRef.current = null;
    gridContentRef.current?.measureInWindow((x, y, width, height) => {
      if (version === measurementVersion.current && width > 0 && height > 0) {
        gridBoundsRef.current = { x, y, width, height };
      }
    });
  };

  const cellFromEvent = (event: GestureResponderEvent): Cell | null => {
    const bounds = gridBoundsRef.current;
    if (!bounds) return null;
    const { pageX, pageY } = event.nativeEvent;
    // RN Web measures in viewport coordinates; DOM page coordinates include scroll.
    return gridCellFromPoint(
      Platform.OS === 'web' ? pageX - window.scrollX : pageX,
      Platform.OS === 'web' ? pageY - window.scrollY : pageY,
      bounds,
      puzzle.size,
    );
  };

  const grantSelection = (cell: Cell | null) => {
    if (!cell) return;
    const previous = selectedCellsRef.current;
    const selection = [cell];
    selectedCellsRef.current = selection;
    setSelectedCells(selection);
    if (!previous.some((item) => sameCell(item, cell))) playSound('drag');
  };

  const updateSelection = (cell: Cell | null) => {
    const current = selectedCellsRef.current;
    const start = current[0];
    if (!cell || !start) return;
    if (sameCell(current[current.length - 1], cell)) return;
    const exact = lineCells(start, cell, puzzle.size);
    // Only tolerate a one-cell drift after the gesture has established a straight direction.
    const next = exact.length ? exact : nearCurrentLine(start, cell, current, puzzle.size);
    if (next.length && (next.length !== current.length || next.some((item, index) => !sameCell(item, current[index])))) {
      const addedCells = next.filter((item) => !current.some((selected) => sameCell(selected, item)));
      selectedCellsRef.current = next;
      setSelectedCells(next);
      addedCells.forEach(() => playSound('drag'));
    }
  };

  const endSelection = (suppressInvalidSound = false) => {
    const selection = selectedCellsRef.current;
    selectedCellsRef.current = [];
    setSelectedCells([]);
    if (!selection.length || completionStarted.current) return;
    const selectedWord = lettersFor(puzzle.grid, selection);
    const reversed = selectedWord.split('').reverse().join('');
    const target = puzzle.words.find((word) => !foundRef.current.includes(word) && (word === selectedWord || word === reversed));
    if (target) {
      setFoundWords((current) => current.includes(target) ? current : [...current, target]);
      setFoundPaths((current) => ({ ...current, [target]: selectedWord === target ? selection : [...selection].reverse() }));
      setScore((current) => scoreFoundWord(current, true));
      playSound('correct');
      setFeedback('idle');
    } else if (selectedWord.length >= 3 && BONUS_WORDS.has(selectedWord) && !bonusWords.includes(selectedWord) && !puzzle.words.includes(selectedWord)) {
      setBonusWords((current) => [...current, selectedWord]);
      setScore((current) => scoreFoundWord(current, false));
      playSound('bonus');
      setFeedback('bonus');
    } else {
      if (!suppressInvalidSound && selectedWord.length >= 2) playSound('wrong');
      setFeedback('wrong');
    }
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      grantSelection(cellFromEvent(event));
    },
    onPanResponderMove: (event) => updateSelection(cellFromEvent(event)),
    onPanResponderRelease: () => endSelection(false),
    onPanResponderTerminate: () => endSelection(true),
  }), [bonusWords, puzzle]);

  const useHint = () => {
    if (hints <= 0 || hintTimeout.current || adPaused.current || completionStarted.current
      || activePuzzleKey.current !== puzzle.id) return;
    const remaining = puzzle.words.filter(word => {
      if (foundRef.current.includes(word)) return false;
      const cells = puzzle.placements[word]?.cells;
      return cells?.length === word.length && cells.length > 0 && cells.every((cell, index) =>
        Number.isInteger(cell.row) && Number.isInteger(cell.col)
        && cell.row >= 0 && cell.col >= 0 && puzzle.grid[cell.row]?.[cell.col] === word[index]);
    });
    if (!remaining.length) return;
    const word = remaining[Math.floor(Math.random() * remaining.length)];
    const cells = puzzle.placements[word].cells;
    // Lock before any state updates; rapid duplicate taps cannot spend another hint.
    const timer = setTimeout(() => {
      if (hintTimeout.current !== timer) return;
      hintTimeout.current = null;
      if (activePuzzleKey.current === puzzle.id) setHintCells([]);
    }, 1500);
    hintTimeout.current = timer;
    setHints(value => Math.max(0, value - 1));
    setHintCells(cells);
    playSound('hint');
  };

  const selectedKeys = useMemo(() => new Set(selectedCells.map(cellKey)), [selectedCells]);
  const hintKeys = useMemo(() => new Set(hintCells.map(cellKey)), [hintCells]);
  const foundCellColors = useMemo(
    () => buildFoundHighlights(foundWords, foundPaths).cellColors,
    [foundWords, foundPaths],
  );

  const getCellStyle = (cell: Cell) => {
    const key = cellKey(cell);
    const foundColor = foundCellColors.get(key);
    if (selectedKeys.has(key)) return { backgroundColor: colors.primary, borderColor: colors.primary, borderRadius: 4 };
    if (hintKeys.has(key)) return { backgroundColor: colors.accent };
    if (foundColor !== undefined) return { backgroundColor: foundColor, borderColor: foundColor };
    return { backgroundColor: colors.card };
  };

  const finishingPreviousStep = Boolean(onboarding && completionStarted.current && requestedStep === onboardingStep - 1);
  if (onboardingStep < 6 && (!onboarding || requestedStep !== onboardingStep) && !finishingPreviousStep) {
    return <Redirect href={{ pathname: '/game', params: { onboardingStep: String(onboardingStep) } }} />;
  }
  if (onboardingStep === 6 && rawOnboardingStep !== undefined && !finishingPreviousStep) return <Redirect href="/categories" />;
  if (rawDailyDate !== undefined && (!daily
    || (!completionStarted.current && (!isDailyDatePlayable(rawDailyDate) || completedDailyPuzzles.includes(rawDailyDate))))) {
    return <Redirect href="/daily" />;
  }
  const categoryIndex = CATEGORIES.findIndex((item) => item.id === category.id);
  if (!onboarding && !daily && !isCategoryUnlocked(categoryIndex, completedLevels, CATEGORIES)) return <Redirect href="/categories" />;

  return <Screen style={styles.screen}>
    <Header title={category.name} onBack={() => daily ? (router.canGoBack() ? router.back() : router.replace('/daily')) : onboarding ? router.replace('/') : router.back()} right={<CoinPill coins={coins} />} />
    <View style={styles.metaRow}><View><Text style={[styles.scoreLabel, { color: colors.mutedForeground }]}>SCORE</Text><Text style={[styles.score, { color: colors.foreground }]}>{score}</Text></View><View style={[styles.timerPill, { backgroundColor: mode === 'time' && timeLeft < 30 ? colors.accent : colors.card, borderColor: mode === 'time' && timeLeft < 30 ? colors.warning : colors.border }]}><Feather name="clock" size={16} color={mode === 'time' && timeLeft < 30 ? colors.warning : colors.primary} /><Text style={[styles.timerText, { color: mode === 'time' && timeLeft < 30 ? colors.warning : colors.foreground }]}>{formatTime(mode === 'time' ? timeLeft : elapsed)}</Text></View><Pressable accessible accessibilityRole="button" onPress={useHint} disabled={hints <= 0} accessibilityState={{ disabled: hints <= 0 }} accessibilityLabel={`Use hint, ${hints} ${hints === 1 ? 'hint' : 'hints'} left`} accessibilityHint="Highlights one unfound word and uses one hint" style={[styles.hintButton, { backgroundColor: colors.card, borderColor: colors.border }]} testID="hint-balance"><Feather name="zap" size={15} color={colors.primary} /><Text style={[styles.hintText, { color: colors.foreground }]}>{hints}</Text></Pressable></View>
    {onboarding && <Text style={[styles.tutorialHelp, { color: colors.mutedForeground }]}>
      {requestedStep === 0 ? 'Touch the first letter, drag in a straight line through a word below, then release.' : `Find all ${onboarding.words.length} words to earn 10 coins.`}
    </Text>}
    {daily && <Text style={[styles.tutorialHelp, { color: colors.mutedForeground }]}>Daily challenge · {rawDailyDate} · +20 coins</Text>}
    <View style={[styles.gridWrap, { width: boardSize }]}><View style={[styles.grid, { borderColor: colors.border }]}><View ref={gridContentRef} style={Platform.OS === 'web' ? [styles.gridContent, styles.webGridContent] : styles.gridContent} onLayout={refreshGridBounds} {...panResponder.panHandlers}>{puzzle.grid.map((row, rowIndex) => <View key={rowIndex} style={styles.gridRow}>{row.map((letter, colIndex) => <View key={colIndex} style={[styles.cell, { borderColor: colors.border }, getCellStyle({ row: rowIndex, col: colIndex })]}><Text style={[styles.letter, { color: selectedKeys.has(`${rowIndex}-${colIndex}`) ? '#FFFFFF' : colors.foreground }]}>{letter}</Text></View>)}</View>)}</View></View></View>
    <View style={styles.listHeader}><Text style={[styles.listTitle, { color: colors.foreground }]}>Find these words</Text><Text style={[styles.progress, { color: colors.mutedForeground }]}>{foundWords.length}/{puzzle.words.length}</Text></View>
    <View style={[styles.words, expandedWordCount > 0 && { maxHeight: Math.ceil(expandedWordCount / 3) * 29, overflow: 'visible' }]}>{puzzle.words.map((word) => <View key={word} style={styles.wordItem}><Feather name={foundWords.includes(word) ? 'check' : 'circle'} size={14} color={foundWords.includes(word) ? colors.success : colors.border} /><Text style={[styles.word, { color: foundWords.includes(word) ? colors.foundWord : colors.foreground, textDecorationLine: foundWords.includes(word) ? 'line-through' : 'none' }]}>{word}</Text></View>)}</View>
    {feedback !== 'idle' && <Text style={[styles.feedback, { color: feedback === 'bonus' ? colors.orange : colors.warning }]}>{feedback === 'bonus' ? '+5 bonus word' : 'That word is not on the list'}</Text>}
    {finishError && <SoftButton onPress={() => { setFinishError(false); completionStarted.current = false; void finish(); }}>{daily ? 'RETRY SAVING DAILY PUZZLE' : 'RETRY SAVING COMPLETED LEVEL'}</SoftButton>}
    <View style={[styles.hintFooterRow, { paddingBottom: bottom }]}>
      <RewardedAdButton
        variant="bar"
        label="WATCH AD ·"
        loading={hintAd.loading}
        reward={`+${REWARDED_HINTS} HINTS`}
        status={hintAd.status}
        onDismiss={hintAd.dismiss}
        emphasized={hints === 0}
        disabled={foundWords.length === puzzle.words.length}
        onPress={watchHintAd}
        accessibilityLabel={`Watch an ad for ${REWARDED_HINTS} extra hints`}
        testID="hint-rewarded-button"
        style={styles.hintAd}
      />
    </View>
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: GAME_PADDING, paddingBottom: 14 },
  tutorialHelp: { fontFamily: 'Inter_500Medium', fontSize: 13, lineHeight: 18, marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  scoreLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 },
  score: { fontFamily: 'Inter_700Bold', fontSize: 27, marginTop: 2 },
  timerPill: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 10 },
  timerText: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  hintButton: { minWidth: 50, height: 42, borderRadius: 15, borderWidth: 1, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  hintText: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  gridWrap: { aspectRatio: 1, alignSelf: 'center' },
  grid: { flex: 1, borderWidth: 1, borderRadius: 18, overflow: 'hidden', padding: 3, backgroundColor: homeColors.tile },
  gridContent: { flex: 1 },
  webGridContent: { userSelect: 'none', touchAction: 'none' },
  gridRow: { flex: 1, flexDirection: 'row' },
  cell: { flex: 1, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5 },
  letter: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 8 },
  listTitle: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  progress: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  words: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, maxHeight: 88, overflow: 'hidden' },
  wordItem: { flexDirection: 'row', alignItems: 'center', gap: 5, width: '31%', minHeight: 22 },
  word: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  feedback: { textAlign: 'center', fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 5 },
  hintFooterRow: { marginTop: 'auto', paddingTop: 10 },
  hintAd: { width: '100%', minHeight: 48 },
});