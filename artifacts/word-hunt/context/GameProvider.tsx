import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { loadProgress, saveCoins, saveCompletedLevels } from '@/services/storage';

type GameContextValue = {
  coins: number;
  completedLevels: string[];
  hydrated: boolean;
  awardCoins: (amount: number) => Promise<void>;
  completeLevel: (categoryId: string) => Promise<void>;
};

const GameContext = createContext<GameContextValue | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [coins, setCoins] = useState(300);
  const [completedLevels, setCompletedLevels] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const progressRef = useRef({ coins: 300, completedLevels: [] as string[] });
  const writes = useRef<Promise<void>>(Promise.resolve());
  const loadVersion = useRef(0);

  const reload = useCallback(async () => {
    const version = ++loadVersion.current;
    try {
      await writes.current.catch(() => {});
      const progress = await loadProgress();
      if (version !== loadVersion.current) return;
      progressRef.current = progress;
      setCoins(progress.coins);
      setCompletedLevels(progress.completedLevels);
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

  const queueSave = useCallback((save: () => Promise<void>) => {
    const next = writes.current.catch(() => {}).then(save);
    writes.current = next;
    return next;
  }, []);

  const value = useMemo<GameContextValue>(() => ({
    coins,
    completedLevels,
    hydrated,
    awardCoins: (amount) => queueSave(async () => {
      const next = progressRef.current.coins + amount;
      await saveCoins(next);
      progressRef.current = { ...progressRef.current, coins: next };
      setCoins(next);
    }),
    completeLevel: (categoryId) => queueSave(async () => {
      if (progressRef.current.completedLevels.includes(categoryId)) return;
      const next = [...progressRef.current.completedLevels, categoryId];
      await saveCompletedLevels(next);
      progressRef.current = { ...progressRef.current, completedLevels: next };
      setCompletedLevels(next);
    }),
  }), [coins, completedLevels, hydrated, queueSave]);

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