import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { advanceOnboarding, loadProgress, saveProgress, STARTING_COINS, type GameProgress } from '@/services/storage';

type GameContextValue = {
  coins: number;
  completedLevels: string[];
  onboardingStep: number;
  hydrated: boolean;
  awardCoins: (amount: number) => Promise<void>;
  completeLevel: (categoryId: string) => Promise<void>;
  completeOnboardingStep: (step: number) => Promise<boolean>;
};

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [coins, setCoins] = useState(STARTING_COINS);
  const [completedLevels, setCompletedLevels] = useState<string[]>([]);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const progressRef = useRef<GameProgress>({ coins: STARTING_COINS, completedLevels: [], onboardingStep: 0 });
  const writes = useRef<Promise<void>>(Promise.resolve());
  const loadVersion = useRef(0);

  const reload = useCallback(async () => {
    const version = ++loadVersion.current;
    // Queue the read with writes so a foreground reload cannot install an older
    // snapshot after a completion has already started saving.
    const read = writes.current.catch(() => {}).then(loadProgress);
    writes.current = read.then(() => {});
    try {
      const progress = await read;
      if (version !== loadVersion.current) return;
      progressRef.current = progress;
      setCoins(progress.coins);
      setCompletedLevels(progress.completedLevels);
      setOnboardingStep(progress.onboardingStep);
      setHydrated(true);
      setStorageError(null);
    } catch {
      if (version !== loadVersion.current) return;
      setStorageError('Saved progress could not be loaded. Your data has not been reset.');
      setHydrated(false);
    }
  }, []);

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
    const next = writes.current.catch(() => {}).then(save);
    writes.current = next.then(() => {});
    return next;
  }, []);

  const value = useMemo<GameContextValue>(() => ({
    coins,
    completedLevels,
    onboardingStep,
    hydrated,
    awardCoins: (amount) => queueSave(async () => {
      const next = { ...progressRef.current, coins: progressRef.current.coins + amount };
      await saveProgress(next);
      progressRef.current = next;
      setCoins(next.coins);
    }),
    completeLevel: (categoryId) => queueSave(async () => {
      if (progressRef.current.completedLevels.includes(categoryId)) return;
      const next = { ...progressRef.current, completedLevels: [...progressRef.current.completedLevels, categoryId] };
      await saveProgress(next);
      progressRef.current = next;
      setCompletedLevels(next.completedLevels);
    }),
    completeOnboardingStep: (step) => queueSave(async () => {
      const next = advanceOnboarding(progressRef.current, step);
      if (!next) return false;
      await saveProgress(next);
      progressRef.current = next;
      setCoins(next.coins);
      setOnboardingStep(next.onboardingStep);
      return true;
    }),
  }), [coins, completedLevels, onboardingStep, hydrated, queueSave]);

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