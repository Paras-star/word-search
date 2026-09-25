import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { advanceOnboarding, awardDailyPuzzle, loadProgress, saveProgress, STARTING_COINS, type GameProgress } from '@/services/storage';

type GameContextValue = {
  coins: number;
  completedLevels: string[];
  completedDailyPuzzles: string[];
  onboardingStep: number;
  hydrated: boolean;
  awardCoins: (amount: number) => Promise<void>;
  completeLevel: (categoryId: string) => Promise<void>;
  completeOnboardingStep: (step: number) => Promise<boolean>;
  completeDailyPuzzle: (dateKey: string) => Promise<boolean>;
};

const GameContext = createContext<GameContextValue | null>(null);

async function withProgressLock<T>(operation: () => Promise<T>): Promise<T> {
  // A provider's promise queue handles repeated taps. Browser tabs need a
  // shared lock as well so their read/modify/write cycles cannot interleave.
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request('word-hunt-progress-v2', operation);
  }
  return operation();
}

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [coins, setCoins] = useState(STARTING_COINS);
  const [completedLevels, setCompletedLevels] = useState<string[]>([]);
  const [completedDailyPuzzles, setCompletedDailyPuzzles] = useState<string[]>([]);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const loadVersion = useRef(0);

  const installProgress = useCallback((progress: GameProgress) => {
    setCoins(progress.coins);
    setCompletedLevels(progress.completedLevels);
    setCompletedDailyPuzzles(progress.completedDailyPuzzles ?? []);
    setOnboardingStep(progress.onboardingStep);
  }, []);

  const reload = useCallback(async () => {
    const version = ++loadVersion.current;
    // Queue the read with writes so a foreground reload cannot install an older
    // snapshot after a completion has already started saving.
    const read = writes.current.catch(() => {}).then(loadProgress);
    writes.current = read.then(() => {});
    try {
      const progress = await read;
      if (version !== loadVersion.current) return;
      installProgress(progress);
      setHydrated(true);
      setStorageError(null);
    } catch {
      if (version !== loadVersion.current) return;
      setStorageError('Saved progress could not be loaded. Your data has not been reset.');
      setHydrated(false);
    }
  }, [installProgress]);

  useEffect(() => {
    void reload();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reload();
    });
    return () => {
      loadVersion.current += 1;
      subscription.remove();
    };
  }, [reload]);

  const queueSave = useCallback(function enqueue<T>(save: () => Promise<T>): Promise<T> {
    const next = writes.current.catch(() => {}).then(() => withProgressLock(save));
    writes.current = next.then(() => {});
    return next;
  }, []);

  const value = useMemo<GameContextValue>(() => ({
    coins,
    completedLevels,
    completedDailyPuzzles,
    onboardingStep,
    hydrated,
    awardCoins: (amount) => queueSave(async () => {
      const saved = await loadProgress();
      const next = { ...saved, coins: saved.coins + amount };
      await saveProgress(next);
      installProgress(next);
    }),
    completeLevel: (categoryId) => queueSave(async () => {
      const saved = await loadProgress();
      if (saved.completedLevels.includes(categoryId)) {
        installProgress(saved);
        return;
      }
      const next = { ...saved, completedLevels: [...saved.completedLevels, categoryId] };
      await saveProgress(next);
      installProgress(next);
    }),
    completeOnboardingStep: (step) => queueSave(async () => {
      const saved = await loadProgress();
      const next = advanceOnboarding(saved, step);
      if (!next) {
        installProgress(saved);
        return false;
      }
      await saveProgress(next);
      installProgress(next);
      return true;
    }),
    completeDailyPuzzle: (dateKey) => queueSave(async () => {
      // Read inside the serialized queue: if storage committed but lost its
      // acknowledgment, retrying must not award the date a second time.
      const saved = await loadProgress();
      const next = awardDailyPuzzle(saved, dateKey);
      if (!next) {
        installProgress(saved);
        return false;
      }
      await saveProgress(next);
      installProgress(next);
      return true;
    }),
  }), [coins, completedLevels, completedDailyPuzzles, onboardingStep, hydrated, queueSave, installProgress]);

  if (storageError) {
    return <View style={styles.errorScreen}>
      <Text style={styles.errorText}>{storageError}</Text>
      <Pressable onPress={() => void reload()} style={styles.retryButton}>
        <Text style={styles.retryText}>RETRY LOADING</Text>
      </Pressable>
    </View>;
  }
  if (!hydrated) return null;
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

const styles = StyleSheet.create({
  errorScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 28, backgroundColor: '#F8F9FC' },
  errorText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, textAlign: 'center', marginBottom: 20, color: '#252B39' },
  retryButton: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 14, backgroundColor: '#2F80ED' },
  retryText: { fontFamily: 'Inter_700Bold', color: '#FFFFFF' },
});

export function useGame() {
  const value = useContext(GameContext);
  if (!value) throw new Error('useGame must be used inside GameProvider');
  return value;
}