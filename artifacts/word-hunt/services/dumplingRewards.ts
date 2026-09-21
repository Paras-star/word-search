import AsyncStorage from '@react-native-async-storage/async-storage';
import { DUMPLINGS, DUMPLING_BY_ID, type Dumpling, type DumplingRarity } from '@/data/dumplings';
import type { PuzzleCompletion } from '@/services/rewardGateway';

const STORAGE_KEY = '@word-hunt/dumpling-rewards-v1';

export type RewardCollectionState = 'earned' | 'collected';

export type DumplingReward = {
  id: string;
  dumplingId: string;
  rarity: DumplingRarity;
  earnedAt: string;
  collectionState: RewardCollectionState;
  puzzleId: string;
};

type RewardStore = {
  rewards: DumplingReward[];
  ownedDumplingIds: string[];
  pendingRewardId: string | null;
};

const EMPTY_STORE: RewardStore = { rewards: [], ownedDumplingIds: [], pendingRewardId: null };
const RARITY_WEIGHTS: Record<DumplingRarity, number> = {
  Common: 50,
  Uncommon: 27,
  Rare: 14,
  Epic: 7,
  Legendary: 2,
};

function isRarity(value: unknown): value is DumplingRarity {
  return value === 'Common' || value === 'Uncommon' || value === 'Rare' || value === 'Epic' || value === 'Legendary';
}

function parseStore(value: string | null): RewardStore {
  if (!value) return EMPTY_STORE;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object') return EMPTY_STORE;
    const candidate = parsed as Partial<RewardStore>;
    const rewards = Array.isArray(candidate.rewards)
      ? candidate.rewards.filter((reward): reward is DumplingReward => Boolean(
          reward
          && typeof reward.id === 'string'
          && typeof reward.dumplingId === 'string'
          && DUMPLING_BY_ID[reward.dumplingId]
          && isRarity(reward.rarity)
          && typeof reward.earnedAt === 'string'
          && (reward.collectionState === 'earned' || reward.collectionState === 'collected')
          && typeof reward.puzzleId === 'string',
        ))
      : [];
    const ownedDumplingIds = Array.isArray(candidate.ownedDumplingIds)
      ? candidate.ownedDumplingIds.filter((id): id is string => typeof id === 'string' && Boolean(DUMPLING_BY_ID[id]))
      : [];
    const pendingRewardId = typeof candidate.pendingRewardId === 'string' && rewards.some((reward) => reward.id === candidate.pendingRewardId)
      ? candidate.pendingRewardId
      : null;
    return { rewards, ownedDumplingIds: [...new Set(ownedDumplingIds)], pendingRewardId };
  } catch {
    return EMPTY_STORE;
  }
}

async function loadStore(): Promise<RewardStore> {
  return parseStore(await AsyncStorage.getItem(STORAGE_KEY));
}

async function saveStore(store: RewardStore): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function chooseDumpling(randomValue = Math.random()): Dumpling {
  const clamped = Math.min(Math.max(randomValue, 0), 0.999999);
  const totalWeight = Object.values(RARITY_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  let cursor = clamped * totalWeight;
  let chosenRarity: DumplingRarity = 'Common';
  for (const rarity of Object.keys(RARITY_WEIGHTS) as DumplingRarity[]) {
    cursor -= RARITY_WEIGHTS[rarity];
    if (cursor < 0) {
      chosenRarity = rarity;
      break;
    }
  }
  const candidates = DUMPLINGS.filter((dumpling) => dumpling.rarity === chosenRarity);
  const normalizedWithinTier = (clamped * 997) % 1;
  return candidates[Math.floor(normalizedWithinTier * candidates.length)] ?? candidates[0] ?? DUMPLINGS[0];
}

function createRewardId(puzzleId: string): string {
  return `${puzzleId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function generateAndPersistReward(completion: PuzzleCompletion): Promise<DumplingReward> {
  const store = await loadStore();
  const existingPending = store.pendingRewardId
    ? store.rewards.find((reward) => reward.id === store.pendingRewardId && reward.collectionState === 'earned')
    : undefined;
  if (existingPending) return existingPending;

  const dumpling = chooseDumpling();
  const reward: DumplingReward = {
    id: createRewardId(completion.puzzleId),
    dumplingId: dumpling.id,
    rarity: dumpling.rarity,
    earnedAt: new Date().toISOString(),
    collectionState: 'earned',
    puzzleId: completion.puzzleId,
  };
  await saveStore({
    ...store,
    rewards: [...store.rewards, reward],
    pendingRewardId: reward.id,
  });
  return reward;
}

export async function getPendingReward(): Promise<DumplingReward | null> {
  const store = await loadStore();
  if (!store.pendingRewardId) return null;
  return store.rewards.find((reward) => reward.id === store.pendingRewardId) ?? null;
}

export async function collectReward(rewardId: string): Promise<{ reward: DumplingReward; isDuplicate: boolean }> {
  const store = await loadStore();
  const reward = store.rewards.find((item) => item.id === rewardId);
  if (!reward) throw new Error('Reward not found');
  const isDuplicate = store.ownedDumplingIds.includes(reward.dumplingId);
  const collectedReward: DumplingReward = { ...reward, collectionState: 'collected' };
  await saveStore({
    rewards: store.rewards.map((item) => item.id === rewardId ? collectedReward : item),
    ownedDumplingIds: isDuplicate ? store.ownedDumplingIds : [...store.ownedDumplingIds, reward.dumplingId],
    pendingRewardId: store.pendingRewardId === rewardId ? null : store.pendingRewardId,
  });
  return { reward: collectedReward, isDuplicate };
}

export async function getCollection(): Promise<{ ownedDumplingIds: string[]; rewards: DumplingReward[] }> {
  const store = await loadStore();
  return { ownedDumplingIds: store.ownedDumplingIds, rewards: store.rewards };
}