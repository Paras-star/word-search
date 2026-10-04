import { DUMPLINGS, type Dumpling } from '@/data/dumplings';
import { loadProgress, type GameProgress } from './storage';
import { loadRewardStore, type DumplingReward } from './dumplingRewards';
import { commitTreasureTransaction, withGameStateLock } from './gameStateLock';

export const TREASURE_CHEST_COST = 700;
export const TREASURE_RARE_WEIGHT = 0.75;

export type TreasurePurchaseResult = {
  reward: DumplingReward;
  isDuplicate: boolean;
  progress: GameProgress;
  recoveryPending: boolean;
};

/** Separate premium distribution; normal puzzle chooseDumpling is unchanged. */
export function chooseTreasureDumpling(
  rarityRoll = Math.random(), ownedDumplingIds: readonly string[] = [], itemRoll = Math.random(),
): Dumpling {
  if (!Number.isFinite(rarityRoll) || !Number.isFinite(itemRoll)) throw new Error('Invalid treasure reward roll');
  const rarity = Math.max(0, Math.min(1, rarityRoll)) < TREASURE_RARE_WEIGHT ? 'Rare' : 'Epic';
  const candidates = DUMPLINGS.filter(dumpling => dumpling.rarity === rarity);
  const owned = new Set(ownedDumplingIds);
  const unowned = candidates.filter(dumpling => !owned.has(dumpling.id));
  const pool = unowned.length ? unowned : candidates;
  if (!pool.length) throw new Error('Treasure rewards are unavailable');
  return pool[Math.min(pool.length - 1, Math.floor(Math.max(0, Math.min(1, itemRoll)) * pool.length))];
}

/** Stable request IDs make double taps and lost-write-response retries idempotent. */
export function purchaseTreasureChest(requestId: string): Promise<TreasurePurchaseResult> {
  if (!requestId || requestId.length > 200) return Promise.reject(new Error('Invalid treasure purchase request'));
  return withGameStateLock(async () => {
    const progress = await loadProgress();
    const store = await loadRewardStore();
    const puzzleId = `treasure:${requestId}`;
    const existing = store.rewards.find(reward => reward.puzzleId === puzzleId);
    if (existing) {
      return {
        reward: existing, progress, recoveryPending: false,
        isDuplicate: existing.treasureDuplicate ?? store.rewards.some(reward => reward.id !== existing.id
          && reward.dumplingId === existing.dumplingId && reward.collectionState === 'collected'),
      };
    }
    if (progress.coins < TREASURE_CHEST_COST) throw new Error('700 coins are required to open this Treasure Chest.');
    // Generate BEFORE any write. The commit contains exactly one collected
    // reward and its deduction, while leaving the normal pending reward alone.
    const dumpling = chooseTreasureDumpling(Math.random(), store.ownedDumplingIds);
    const isDuplicate = store.ownedDumplingIds.includes(dumpling.id);
    const reward: DumplingReward = {
      id: puzzleId, puzzleId, dumplingId: dumpling.id, rarity: dumpling.rarity,
      earnedAt: new Date().toISOString(), collectionState: 'collected',
      treasureDuplicate: isDuplicate,
    };
    const next = { ...progress, coins: progress.coins - TREASURE_CHEST_COST };
    const recoveryPending = await commitTreasureTransaction(next, {
      ...store,
      rewards: [...store.rewards, reward],
      ownedDumplingIds: isDuplicate ? store.ownedDumplingIds : [...store.ownedDumplingIds, dumpling.id],
    });
    return { reward, isDuplicate, progress: next, recoveryPending };
  });
}