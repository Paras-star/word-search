import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Header, Screen, CoinPill, SoftButton } from '@/components/GameUI';
import { CATEGORIES, getCategory } from '@/data/categories';
import { BONUS_WORDS } from '@/data/bonusWords';
import { generatePuzzle, gridCellFromPoint, lettersFor, lineCells } from '@/game/puzzle';
import { completionBonus, formatTime, HIGHLIGHT_COLORS, scoreFoundWord } from '@/game/scoring';
import type { Cell, GameMode } from '@/game/types';
import { useGame } from '@/context/GameProvider';
import { rewardGateway } from '@/services/rewardGateway';
import { playSound } from '@/services/audio';
import { useColors } from '@/hooks/useColors';

function cellKey(cell: Cell) { return `${cell.row}-${cell.col}`; }

export default function GameScreen() {
  const router = useRouter();
  const colors = useColors();
  const { categoryId, mode: rawMode, seed } = useLocalSearchParams<{ categoryId?: string; mode?: GameMode; seed?: string }>();
  const mode: GameMode = rawMode === 'time' ? 'time' : 'classic';
  const category = getCategory(categoryId);
  const puzzle = useMemo(() => generatePuzzle(category, seed ?? `${category.id}:default`), [category, seed]);
  const { coins, awardCoins, completeLevel } = useGame();
  const [score, setScore] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [timeLeft, setTimeLeft] = useState(120);
  const [hints, setHints] = useState(3);
  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [bonusWords, setBonusWords] = useState<string[]>([]);
  const [foundPaths, setFoundPaths] = useState<Record<string, Cell[]>>({});
  const [selectedCells, setSelectedCells] = useState<Cell[]>([]);
  const [feedback, setFeedback] = useState<'idle' | 'wrong' | 'bonus'>('idle');
  const [hintCells, setHintCells] = useState<Cell[]>([]);
  const [gridBounds, setGridBounds] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const gridContentRef = useRef<View>(null);
  const completionStarted = useRef(false);
  const startTime = useRef(Date.now());
  const foundRef = useRef(foundWords);
  const hintTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  foundRef.current = foundWords;

  const finish = useCallback(async () => {
    if (completionStarted.current) return;
    completionStarted.current = true;
    const finalScore = score + completionBonus(mode, timeLeft);
    const finalTime = mode === 'time' ? 120 - timeLeft : Math.floor((Date.now() - startTime.current) / 1000);
    await awardCoins(50);
    await completeLevel(category.id);
    await rewardGateway.onPuzzleCompleted({ puzzleId: puzzle.id, categoryId: category.id, mode, score: finalScore });
    router.replace({ pathname: '/reward', params: { categoryId: category.id, mode, score: String(finalScore), time: String(finalTime), puzzleId: puzzle.id } });
  }, [awardCoins, category.id, completeLevel, mode, puzzle.id, router, score, timeLeft]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (completionStarted.current) return;
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

  useEffect(() => () => { if (hintTimeout.current) clearTimeout(hintTimeout.current); }, []);

  useEffect(() => { if (foundWords.length === puzzle.words.length) void finish(); }, [finish, foundWords.length, puzzle.words.length]);

  const refreshGridBounds = () => {
    gridContentRef.current?.measureInWindow((x, y, width, height) => {
      setGridBounds({ x, y, width, height });
    });
  };

  const cellFromEvent = (event: GestureResponderEvent): Cell | null => {
    return gridCellFromPoint(event.nativeEvent.pageX, event.nativeEvent.pageY, gridBounds, puzzle.size);
  };

  const updateSelection = (cell: Cell | null) => {
    if (!cell || !selectedCells[0]) return;
    const next = lineCells(selectedCells[0], cell, puzzle.size);
    if (next.length) setSelectedCells(next);
  };

  const endSelection = () => {
    if (!selectedCells.length || completionStarted.current) { setSelectedCells([]); return; }
    const selectedWord = lettersFor(puzzle.grid, selectedCells);
    const reversed = selectedWord.split('').reverse().join('');
    const target = puzzle.words.find((word) => !foundRef.current.includes(word) && (word === selectedWord || word === reversed));
    if (target) {
      setFoundWords((current) => current.includes(target) ? current : [...current, target]);
      setFoundPaths((current) => ({ ...current, [target]: [...selectedCells].reverse().map((cell, index) => selectedWord === target ? selectedCells[index] : cell) }));
      setScore((current) => scoreFoundWord(current, true));
      playSound('correct');
      setFeedback('idle');
    } else if (selectedWord.length >= 3 && BONUS_WORDS.has(selectedWord) && !bonusWords.includes(selectedWord) && !puzzle.words.includes(selectedWord)) {
      setBonusWords((current) => [...current, selectedWord]);
      setScore((current) => scoreFoundWord(current, false));
      playSound('bonus');
      setFeedback('bonus');
    } else {
      playSound('wrong');
      setFeedback('wrong');
    }
    setSelectedCells([]);
  };

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (event) => {
      const cell = cellFromEvent(event);
      if (cell) { setSelectedCells([cell]); playSound('drag'); }
    },
    onPanResponderMove: (event) => updateSelection(cellFromEvent(event)),
    onPanResponderRelease: endSelection,
    onPanResponderTerminate: endSelection,
  }), [gridBounds, puzzle.size, selectedCells]);

  const useHint = () => {
    if (hints <= 0 || foundWords.length === puzzle.words.length) return;
    const remaining = puzzle.words.filter((word) => !foundWords.includes(word));
    const word = remaining[Math.floor(Math.random() * remaining.length)];
    const cells = puzzle.placements[word].cells;
    setHints((value) => Math.max(0, value - 1));
    setHintCells(cells);
    if (hintTimeout.current) clearTimeout(hintTimeout.current);
    hintTimeout.current = setTimeout(() => setHintCells([]), 1500);
  };

  const getCellStyle = (cell: Cell) => {
    const key = cellKey(cell);
    const foundIndex = Object.entries(foundPaths).findIndex(([, cells]) => cells.some((item) => cellKey(item) === key));
    if (selectedCells.some((item) => cellKey(item) === key)) return { backgroundColor: colors.primary };
    if (hintCells.some((item) => cellKey(item) === key)) return { backgroundColor: '#f6c445' };
    if (foundIndex >= 0) return { backgroundColor: `${HIGHLIGHT_COLORS[foundIndex % HIGHLIGHT_COLORS.length]}59` };
    return { backgroundColor: colors.card };
  };

  return <Screen style={styles.screen}>
    <Header title={category.name} onBack={() => router.back()} right={<CoinPill coins={coins} />} />
    <View style={styles.metaRow}><View><Text style={[styles.scoreLabel, { color: colors.mutedForeground }]}>SCORE</Text><Text style={[styles.score, { color: colors.foreground }]}>{score}</Text></View><View style={[styles.timerPill, { backgroundColor: mode === 'time' && timeLeft < 30 ? '#ffe4e4' : colors.card, borderColor: mode === 'time' && timeLeft < 30 ? colors.warning : colors.border }]}><Feather name="clock" size={16} color={mode === 'time' && timeLeft < 30 ? colors.warning : colors.primary} /><Text style={[styles.timerText, { color: mode === 'time' && timeLeft < 30 ? colors.warning : colors.foreground }]}>{formatTime(mode === 'time' ? timeLeft : elapsed)}</Text></View><Pressable onPress={useHint} disabled={hints === 0} style={[styles.hintButton, { backgroundColor: hints ? colors.orange : colors.border }]} testID="hint-button"><Feather name="zap" size={16} color="#fff" /><Text style={styles.hintText}>{hints}</Text></Pressable></View>
    <View style={styles.gridWrap}><View style={[styles.grid, { borderColor: colors.border }]}><View ref={gridContentRef} style={styles.gridContent} onLayout={refreshGridBounds} {...panResponder.panHandlers}>{puzzle.grid.map((row, rowIndex) => row.map((letter, colIndex) => <View key={`${rowIndex}-${colIndex}`} style={[styles.cell, { width: `${100 / puzzle.size}%`, height: `${100 / puzzle.size}%`, borderColor: colors.border }, getCellStyle({ row: rowIndex, col: colIndex })]}><Text style={[styles.letter, { color: colors.foreground }]}>{letter}</Text></View>))}</View></View></View>
    <View style={styles.listHeader}><Text style={[styles.listTitle, { color: colors.foreground }]}>Find these words</Text><Text style={[styles.progress, { color: colors.mutedForeground }]}>{foundWords.length}/{puzzle.words.length}</Text></View>
    <View style={styles.words}>{puzzle.words.map((word) => <View key={word} style={styles.wordItem}><Feather name={foundWords.includes(word) ? 'check' : 'circle'} size={14} color={foundWords.includes(word) ? colors.success : colors.border} /><Text style={[styles.word, { color: foundWords.includes(word) ? colors.foundWord : colors.foreground, textDecorationLine: foundWords.includes(word) ? 'line-through' : 'none' }]}>{word}</Text></View>)}</View>
    {feedback !== 'idle' && <Text style={[styles.feedback, { color: feedback === 'bonus' ? colors.orange : colors.warning }]}>{feedback === 'bonus' ? '+5 bonus word' : 'That word is not on the list'}</Text>}
    <SoftButton onPress={useHint} disabled={hints === 0} style={styles.hintFooter}>{hints ? `USE HINT  ·  ${hints} LEFT` : 'NO HINTS LEFT'}</SoftButton>
  </Screen>;
}

const styles = StyleSheet.create({
  screen: { paddingBottom: 14 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  scoreLabel: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1 },
  score: { fontFamily: 'Inter_700Bold', fontSize: 27, marginTop: 2 },
  timerPill: { flexDirection: 'row', alignItems: 'center', gap: 7, borderWidth: 1, borderRadius: 18, paddingHorizontal: 13, paddingVertical: 10 },
  timerText: { fontFamily: 'Inter_700Bold', fontSize: 16 },
  hintButton: { minWidth: 50, height: 42, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  hintText: { color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 },
  gridWrap: { width: '100%', aspectRatio: 1, maxHeight: 365, alignSelf: 'center' },
  grid: { flex: 1, borderWidth: 1, borderRadius: 18, overflow: 'hidden', padding: 3, backgroundColor: '#fff' },
  gridContent: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' },
  cell: { alignItems: 'center', justifyContent: 'center', borderWidth: 0.5 },
  letter: { fontFamily: 'Inter_700Bold', fontSize: 15 },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 8 },
  listTitle: { fontFamily: 'Inter_700Bold', fontSize: 17 },
  progress: { fontFamily: 'Inter_600SemiBold', fontSize: 13 },
  words: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, maxHeight: 88, overflow: 'hidden' },
  wordItem: { flexDirection: 'row', alignItems: 'center', gap: 5, width: '31%', minHeight: 22 },
  word: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  feedback: { textAlign: 'center', fontFamily: 'Inter_600SemiBold', fontSize: 12, marginTop: 5 },
  hintFooter: { minHeight: 44, marginTop: 'auto' },
});