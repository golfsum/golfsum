import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import Storage from './storage';
import { getInProgressRound, saveInProgressRound } from './inProgressRoundService';
import { logger } from '../utils/logger';
import { saveLastError } from './userService';

const WATCH_EVENT_QUEUE_KEY = '@GolfSum:watchEventQueue';
const WATCH_END_ROUND_FLAG_KEY = '@GolfSum:watchEndRoundFlag';

export type WatchBridgeEventType = 'hole_saved' | 'end_round' | 'startRoundFromWatch' | 'requestActiveRound' | 'startRound' | 'roundState' | 'endRound' | 'roundEnded' | 'watchLog';

export interface WatchBridgeEvent {
  type: WatchBridgeEventType;
  roundId?: string;
  holeNumber?: number;
  currentHole?: number;
  par?: number;
  score?: number;
  putts?: number;
  fir?: boolean | null;
  gir?: boolean | null;
  scoreToPar?: number;
  totalPutts?: number;
  holesCompleted?: number;
  savedAt?: number;
  course?: string;
  courseName?: string;
  tee?: string;
  teeName?: string;
  yardage?: number;
  timestamp?: number;
  level?: 'debug' | 'info' | 'warn' | 'error';
  message?: string;
  source?: string;
  extra?: Record<string, unknown>;
}

type WatchBridgeModuleShape = {
  start?: () => void;
  stop?: () => void;
  updateWatchGpsContext?: (payload: Record<string, unknown>) => void;
};

const nativeModule = (NativeModules.GolfSumWatchBridge || null) as WatchBridgeModuleShape | null;

/** Set from GpsRoundScreen when mounted — Watch `addShot` / `addPutt` must work even if listener lived only on that screen before. */
let watchGpsCommandHandler: ((msg: Record<string, unknown>) => void) | null = null;

export function setWatchGpsCommandHandler(
  handler: ((msg: Record<string, unknown>) => void) | null
): void {
  watchGpsCommandHandler = handler;
}

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

  const holeNum = typeof event.holeNumber === 'number' ? event.holeNumber : 0;
  const holeIndex = Math.max(0, Math.min(draft.holes.length - 1, holeNum > 0 ? holeNum - 1 : 0));
  const hole = draft.holes[holeIndex];
  if (!hole) return;

  draft.holes[holeIndex] = {
    ...hole,
    par: event.par || hole.par,
    score: event.score ?? hole.score,
    putts: event.putts ?? hole.putts,
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

/** Push GPS round context to the watch (applicationContext; survives when not reachable). */
export function updateWatchGpsContext(payload: Record<string, unknown>): void {
  if (!isWatchBridgeAvailable() || !nativeModule?.updateWatchGpsContext) return;
  try {
    nativeModule.start?.();
    nativeModule.updateWatchGpsContext(payload);
  } catch (error) {
    logger.warn('Failed to update watch GPS context:', error);
  }
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
  onEvent?: (event: WatchBridgeEvent) => void,
  onGpsCommand?: (payload: Record<string, unknown>) => void,
): () => void {
  if (!isWatchBridgeAvailable() || !nativeModule) {
    return () => {};
  }

  const emitter = new NativeEventEmitter(NativeModules.GolfSumWatchBridge);
  const subGps = emitter.addListener('GolfSumWatchGpsCommand', (payload: unknown) => {
    try {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        logger.debug('[WatchBridge] GolfSumWatchGpsCommand:', payload);
      }
      if (watchGpsCommandHandler) {
        watchGpsCommandHandler(payload as Record<string, unknown>);
      } else {
        onGpsCommand?.(payload as Record<string, unknown>);
      }
    } catch (error) {
      logger.warn('Failed handling watch GPS command:', error);
    }
  });
  const sub = emitter.addListener('GolfSumWatchMessage', async (payload: unknown) => {
    const event = payload as WatchBridgeEvent;
    if (!event || !event.type) return;
    try {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        logger.debug('[WatchBridge] GolfSumWatchMessage:', event.type, event);
      }
      if (event.type === 'watchLog') {
        const level = event.level || 'info';
        const summary = `[WatchLog] ${event.message || 'No message'}`;
        const details = {
          source: event.source || 'watch',
          watchLevel: level,
          roundId: event.roundId || null,
          currentHole: event.currentHole || null,
          timestamp: event.timestamp || null,
          extra: event.extra || {},
        };
        if (level === 'error') {
          logger.error(summary, details);
        } else {
          logger.warn(summary, details);
        }
        try {
          await saveLastError({
            message: summary,
            name: 'WatchLog',
            stack: undefined,
            args: JSON.stringify(details),
            createdAt: event.timestamp
              ? new Date(event.timestamp * 1000).toISOString()
              : new Date().toISOString(),
          });
        } catch (persistError) {
          logger.warn('Failed to persist watch log to user lastError:', persistError);
        }
        onEvent?.(event);
        return;
      }
      if (event.type === 'hole_saved' || event.type === 'end_round') {
        if (!event.holeNumber) return;
        await enqueueWatchEvent(event);
        await applyToInProgressRound(event);
        if (event.type === 'end_round') {
          await setEndRoundFlag(event);
        }
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
    subGps.remove();
    try {
      nativeModule.stop?.();
    } catch {
      // no-op
    }
  };
}

