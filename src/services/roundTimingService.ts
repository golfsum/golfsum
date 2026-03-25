/**
 * Round timing: play time, pauses (weather / breaks), hole timestamps, resume.
 */

export type PauseReason = 'weather' | 'suspended_play' | 'break' | 'unknown' | 'estimated';

export interface PauseEvent {
  pausedAt: number;
  resumedAt: number | null;
  durationMs: number | null;
  reason: PauseReason;
  isEstimated: boolean;
  estimatedBucket?: string;
}

export interface HoleTimestamp {
  holeNumber: number;
  startedAt: number;
  teeShotAt: number | null;
  savedAt: number | null;
  pausedMs: number;
}

export interface InProgressTimingState {
  roundStartedAt: number;
  lastActiveAt: number;
  /** Accumulated active play ms from prior sessions (e.g. after resume). */
  playedMs: number;
  pauseEvents: PauseEvent[];
  holeTimestamps: Record<number, HoleTimestamp>;
}

export interface RoundTiming {
  roundStartedAt: number;
  roundEndedAt: number;
  totalElapsedMs: number;
  playedMs: number;
  pausedMs: number;
  sessions: number;
  pauseEvents: PauseEvent[];
  holeTimestamps: Record<number, HoleTimestamp>;
  holesCompleted: number;
  avgPerHoleMs: number;
  wasResumed: boolean;
  resumedNextDay: boolean;
}

/** Max age of last activity to offer “resume paused GPS round”. */
export const GPS_RESUME_WINDOW_MS = 48 * 60 * 60 * 1000;

export function calculatePlayedMs(timing: {
  roundStartedAt: number;
  pauseEvents: PauseEvent[];
}): number {
  const now = Date.now();
  const totalPausedMs = timing.pauseEvents.reduce((sum, p) => {
    const dur =
      p.durationMs ??
      (p.resumedAt != null ? p.resumedAt - p.pausedAt : now - p.pausedAt);
    return sum + Math.max(0, dur);
  }, 0);
  return Math.max(0, now - timing.roundStartedAt - totalPausedMs);
}

export function calculateFinalTiming(
  timing: InProgressTimingState,
  holesCompleted: number,
  roundEndedAt: number = Date.now(),
): RoundTiming {
  const totalPausedMs = timing.pauseEvents.reduce((sum, p) => {
    if (p.durationMs != null) return sum + p.durationMs;
    if (p.resumedAt != null) return sum + (p.resumedAt - p.pausedAt);
    return sum;
  }, 0);

  const totalElapsedMs = roundEndedAt - timing.roundStartedAt;
  const playedMs = Math.max(0, totalElapsedMs - totalPausedMs);
  const resumedCount = timing.pauseEvents.filter((p) => p.resumedAt != null).length;
  const sessions = Math.max(1, resumedCount + 1);

  return {
    roundStartedAt: timing.roundStartedAt,
    roundEndedAt: roundEndedAt,
    totalElapsedMs,
    playedMs,
    pausedMs: totalPausedMs,
    sessions,
    pauseEvents: timing.pauseEvents,
    holeTimestamps: timing.holeTimestamps,
    holesCompleted,
    avgPerHoleMs: holesCompleted > 0 ? playedMs / holesCompleted : 0,
    wasResumed: timing.pauseEvents.length > 0,
    resumedNextDay: timing.pauseEvents.some((p) => {
      if (p.resumedAt == null) return false;
      const pauseDay = new Date(p.pausedAt).toDateString();
      const resumeDay = new Date(p.resumedAt).toDateString();
      return pauseDay !== resumeDay;
    }),
  };
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return '0m';
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatTimeAgo(timestamp: number): string {
  const ms = Date.now() - timestamp;
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

export function createPauseEvent(reason: PauseEvent['reason']): PauseEvent {
  return {
    pausedAt: Date.now(),
    resumedAt: null,
    durationMs: null,
    reason,
    isEstimated: false,
  };
}

export function closePauseEvent(event: PauseEvent, resumedAt: number = Date.now()): PauseEvent {
  return {
    ...event,
    resumedAt,
    durationMs: resumedAt - event.pausedAt,
  };
}

export function createEstimatedPauseEvent(bucket: string, pausedApproxAt: number): PauseEvent {
  const durationMap: Record<string, number> = {
    '<30min': 25 * 60 * 1000,
    '30-60min': 45 * 60 * 1000,
    '1-2h': 90 * 60 * 1000,
    '2h+': 150 * 60 * 1000,
    next_day: 16 * 60 * 60 * 1000,
  };
  const durationMs = durationMap[bucket] ?? 0;
  const now = Date.now();
  return {
    pausedAt: pausedApproxAt,
    resumedAt: now,
    durationMs,
    reason: 'estimated',
    isEstimated: true,
    estimatedBucket: bucket,
  };
}
