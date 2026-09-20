import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    loadProgress().then((progress) => {
      setCoins(progress.coins);
      setCompletedLevels(progress.completedLevels);
      setHydrated(true);
    }).catch(() => setHydrated(true));
  }, []);

  const value = useMemo<GameContextValue>(() => ({
    coins,
    completedLevels,
    hydrated,
    awardCoins: async (amount) => {
      const next = coins + amount;
      setCoins(next);
      await saveCoins(next);
    },
    completeLevel: async (categoryId) => {
      if (completedLevels.includes(categoryId)) return;
      const next = [...completedLevels, categoryId];
      setCompletedLevels(next);
      await saveCompletedLevels(next);
    },
  }), [coins, completedLevels, hydrated]);

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

export function useGame() {
  const value = useContext(GameContext);
  if (!value) throw new Error('useGame must be used inside GameProvider');
  return value;
}