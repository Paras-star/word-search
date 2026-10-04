import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  DUMPLING_STORAGE_KEY, PROGRESS_STORAGE_KEY, TREASURE_TRANSACTION_KEY, readTreasureTransaction,
  type GameProgress, type TreasureTransaction,
} from './storage';
import type { RewardStore } from './dumplingRewards';

let writes: Promise<void> = Promise.resolve();

/** Idempotent redo: keep the commit until BOTH existing save keys are installed. */
export async function recoverTreasureTransaction(): Promise<void> {
  const transaction = await readTreasureTransaction();
  if (!transaction) return;
  await AsyncStorage.setItem(PROGRESS_STORAGE_KEY, transaction.progress);
  await AsyncStorage.setItem(DUMPLING_STORAGE_KEY, transaction.collection);
  await AsyncStorage.removeItem(TREASURE_TRANSACTION_KEY);
}

/** Shared by coin/progression changes, normal rewards, and paid rewards. */
export function withGameStateLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = async () => {
    // Never overwrite an interrupted purchase with a later normal-game save.
    await recoverTreasureTransaction();
    return operation();
  };
  const next = writes.catch(() => {}).then(() => {
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.locks) {
      return navigator.locks.request('word-hunt-progress-v2', run);
    }
    return run();
  });
  writes = next.then(() => {}, () => {});
  return next;
}

/** Call only inside withGameStateLock. Resolving the single commit is the purchase. */
export async function commitTreasureTransaction(progress: GameProgress, collection: RewardStore): Promise<boolean> {
  const transaction: TreasureTransaction = {
    version: 1, progress: JSON.stringify(progress), collection: JSON.stringify(collection),
  };
  await AsyncStorage.setItem(TREASURE_TRANSACTION_KEY, JSON.stringify(transaction));
  try {
    await recoverTreasureTransaction();
    return false;
  } catch (error) {
    // The purchase is already durably committed, not failed. Readers use the
    // commit and the next mutation retries recovery; never charge again.
    console.warn('[Word Hunt treasure] Purchase saved; local save recovery is pending.', error);
    return true;
  }
}