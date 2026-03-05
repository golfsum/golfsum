import Storage from './storage';
import { logger } from '../utils/logger';

const SYNC_QUEUE_KEY = '@GolfSum:syncQueue';
const DEAD_LETTER_KEY = '@GolfSum:syncQueueDead';
const MAX_RETRIES = 5;
const BASE_BACKOFF_MS = 1000;

type SyncTaskType = 'local_data_sync';

export interface QueuedSyncTask {
  id: string;
  type: SyncTaskType;
  reason?: string;
  createdAt: number;
  retryCount: number;
  lastAttemptAt?: number;
  lastError?: string;
}

export interface DeadSyncTask extends QueuedSyncTask {
  droppedAt: number;
  finalError: string;
}

const createId = () => `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const readQueue = async (): Promise<QueuedSyncTask[]> => {
  try {
    const raw = await Storage.getItem(SYNC_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    logger.warn('Failed to read sync queue:', error);
    return [];
  }
};

const writeQueue = async (queue: QueuedSyncTask[]) => {
  try {
    await Storage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    logger.warn('Failed to write sync queue:', error);
  }
};

const appendDeadLetter = async (task: QueuedSyncTask, finalError: string) => {
  try {
    const raw = await Storage.getItem(DEAD_LETTER_KEY);
    const existing: DeadSyncTask[] = raw ? JSON.parse(raw) : [];
    const next: DeadSyncTask[] = [
      ...existing.slice(-19),
      { ...task, droppedAt: Date.now(), finalError },
    ];
    await Storage.setItem(DEAD_LETTER_KEY, JSON.stringify(next));
  } catch {
    // Non-fatal path.
  }
};

const msSinceLastAttempt = (task: QueuedSyncTask): number => {
  if (!task.lastAttemptAt) return Infinity;
  return Date.now() - task.lastAttemptAt;
};

const backoffMs = (retryCount: number) => BASE_BACKOFF_MS * Math.pow(2, retryCount);
const isReadyToRetry = (task: QueuedSyncTask) => msSinceLastAttempt(task) >= backoffMs(task.retryCount);

export const enqueueLocalDataSync = async (reason?: string) => {
  const queue = await readQueue();
  const hasPending = queue.some(task => task.type === 'local_data_sync');
  if (hasPending) return;

  queue.push({
    id: createId(),
    type: 'local_data_sync',
    reason,
    createdAt: Date.now(),
    retryCount: 0,
  });
  await writeQueue(queue);
};

export const getPendingSyncCount = async (): Promise<number> => {
  const queue = await readQueue();
  return queue.length;
};

export const getDeadLetterQueue = async (): Promise<DeadSyncTask[]> => {
  try {
    const raw = await Storage.getItem(DEAD_LETTER_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const clearDeadLetterQueue = async () => {
  await Storage.removeItem(DEAD_LETTER_KEY);
};

export const processSyncQueue = async (
  syncLocalData: () => Promise<void>
): Promise<{ processed: number; failed: number; skipped: number; dropped: number }> => {
  const queue = await readQueue();
  if (!queue.length) return { processed: 0, failed: 0, skipped: 0, dropped: 0 };

  const remaining: QueuedSyncTask[] = [];
  let processed = 0;
  let failed = 0;
  let skipped = 0;
  let dropped = 0;

  for (const task of queue) {
    if (task.retryCount >= MAX_RETRIES) {
      dropped += 1;
      await appendDeadLetter(task, task.lastError ?? 'max retries exceeded');
      logger.warn(`Sync task dropped after ${MAX_RETRIES} retries`, task.id);
      continue;
    }

    if (!isReadyToRetry(task)) {
      skipped += 1;
      remaining.push(task);
      continue;
    }

    try {
      if (task.type === 'local_data_sync') {
        await syncLocalData();
      }
      processed += 1;
    } catch (error) {
      failed += 1;
      remaining.push({
        ...task,
        retryCount: task.retryCount + 1,
        lastAttemptAt: Date.now(),
        lastError: error instanceof Error ? error.message : String(error),
      });
      logger.warn('Sync queue task failed:', error);
    }
  }

  await writeQueue(remaining);
  return { processed, failed, skipped, dropped };
};
