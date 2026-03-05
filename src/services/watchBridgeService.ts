import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import Storage from './storage';
import { getInProgressRound, saveInProgressRound } from './inProgressRoundService';
import { logger } from '../utils/logger';

const WATCH_EVENT_QUEUE_KEY = '@GolfSum:watchEventQueue';
const WATCH_END_ROUND_FLAG_KEY = '@GolfSum:watchEndRoundFlag';

export type WatchBridgeEventType = 'hole_saved' | 'end_round';

export interface WatchBridgeEvent {
  type: WatchBridgeEventType;
  roundId?: string;
  holeNumber: number;
  par: number;
  score: number;
  putts: number;
  fir?: boolean | null;
  gir?: boolean | null;
  scoreToPar?: number;
  totalPutts?: number;
  holesCompleted?: number;
  savedAt?: number;
}

type WatchBridgeModuleShape = {
  start?: () => void;
  stop?: () => void;
};

const nativeModule = (NativeModules.GolfSumWatchBridge || null) as WatchBridgeModuleShape | null;

const mapFir = (fir: boolean | null | undefined): 'hit' | 'right' | null => {
  if (fir === true) return 'hit';
  if (fir === false) return 'right'; // Generic miss marker for watch yes/no input.
  return null;
};

const mapGir = (gir: boolean | null | undefined): 'hit' | 'short' | null => {
  if (gir === true) return 'hit';
  if (gir === false) return 'short'; // Generic miss marker for watch yes/no input.
  return null;
};

async function enqueueWatchEvent(event: WatchBridgeEvent): Promise<void> {
  try {
    const raw = await Storage.getItem(WATCH_EVENT_QUEUE_KEY);
    const current = raw ? (JSON.parse(raw) as WatchBridgeEvent[]) : [];
    current.push(event);
    await Storage.setItem(WATCH_EVENT_QUEUE_KEY, JSON.stringify(current.slice(-200)));
  } catch (error) {
    logger.warn('Failed to enqueue watch event:', error);
  }
}

async function setEndRoundFlag(event: WatchBridgeEvent): Promise<void> {
  try {
    await Storage.setItem(WATCH_END_ROUND_FLAG_KEY, JSON.stringify({
      at: Date.now(),
      holeNumber: event.holeNumber,
      roundId: event.roundId || null,
    }));
  } catch (error) {
    logger.warn('Failed to set watch end-round flag:', error);
  }
}

async function applyToInProgressRound(event: WatchBridgeEvent): Promise<void> {
  const draft = await getInProgressRound();
  if (!draft) return;

  if (event.roundId && draft.courseId !== event.roundId && draft.courseName !== event.roundId) {
    // Round id namespaces may differ between watch/iPhone. Do not hard-reject.
  }

  const holeIndex = Math.max(0, Math.min(draft.holes.length - 1, event.holeNumber - 1));
  const hole = draft.holes[holeIndex];
  if (!hole) return;

  draft.holes[holeIndex] = {
    ...hole,
    par: event.par || hole.par,
    score: event.score,
    putts: event.putts,
    fir: mapFir(event.fir),
    gir: mapGir(event.gir),
    isSaved: true,
  };
  draft.currentHole = Math.min(draft.holes.length - 1, holeIndex + (event.type === 'hole_saved' ? 1 : 0));
  draft.updatedAt = new Date().toISOString();

  await saveInProgressRound(draft);
}

export function isWatchBridgeAvailable(): boolean {
  return Platform.OS === 'ios' && !!nativeModule;
}

export async function consumeWatchEndRoundFlag(): Promise<{ at: number; holeNumber?: number; roundId?: string | null } | null> {
  try {
    const raw = await Storage.getItem(WATCH_END_ROUND_FLAG_KEY);
    if (!raw) return null;
    await Storage.removeItem(WATCH_END_ROUND_FLAG_KEY);
    return JSON.parse(raw) as { at: number; holeNumber?: number; roundId?: string | null };
  } catch (error) {
    logger.warn('Failed to consume watch end-round flag:', error);
    return null;
  }
}

export async function getQueuedWatchEvents(): Promise<WatchBridgeEvent[]> {
  try {
    const raw = await Storage.getItem(WATCH_EVENT_QUEUE_KEY);
    return raw ? (JSON.parse(raw) as WatchBridgeEvent[]) : [];
  } catch (error) {
    logger.warn('Failed to read watch event queue:', error);
    return [];
  }
}

export function initializeWatchReceiver(
  onEvent?: (event: WatchBridgeEvent) => void
): () => void {
  if (!isWatchBridgeAvailable() || !nativeModule) {
    return () => {};
  }

  const emitter = new NativeEventEmitter(NativeModules.GolfSumWatchBridge);
  const sub = emitter.addListener('GolfSumWatchMessage', async (payload: unknown) => {
    const event = payload as WatchBridgeEvent;
    if (!event || !event.type || !event.holeNumber) return;
    try {
      await enqueueWatchEvent(event);
      await applyToInProgressRound(event);
      if (event.type === 'end_round') {
        await setEndRoundFlag(event);
      }
      onEvent?.(event);
    } catch (error) {
      logger.warn('Failed handling watch event:', error);
    }
  });

  try {
    nativeModule.start?.();
  } catch (error) {
    logger.warn('Failed starting watch bridge:', error);
  }

  return () => {
    sub.remove();
    try {
      nativeModule.stop?.();
    } catch {
      // no-op
    }
  };
}

