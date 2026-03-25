import type { PendingGpsRoundData } from '../../../types';

export function buildRoundPersistenceMeta(
  gpsRoundData: PendingGpsRoundData | null | undefined,
  firstSaveTimestamp: number | null,
  lastSaveTimestamp: number | null,
  /** Merged/final per-hole static map URLs (e.g. gap-filled at save). Prefer over gpsRoundData.holeMapUrls when set. */
  holeMapUrls?: Record<number, string> | null,
) {
  const rt = gpsRoundData?.roundTiming;
  const roundStartedAt = rt?.roundStartedAt ?? gpsRoundData?.startedAt ?? firstSaveTimestamp ?? Date.now();
  const roundEndedAt = rt?.roundEndedAt ?? gpsRoundData?.endedAt ?? lastSaveTimestamp ?? Date.now();
  const roundDurationMinutes = rt
    ? Math.max(1, Math.round(rt.totalElapsedMs / 60000))
    : Math.max(1, Math.round((roundEndedAt - roundStartedAt) / 60000));

  return {
    roundStartedAt,
    roundEndedAt,
    roundDurationMinutes,
    gpsShots: gpsRoundData?.gpsShots,
    gpsShotCount: gpsRoundData?.gpsShots?.length ?? 0,
    gpsHoleSummaries: gpsRoundData?.gpsHoleSummaries,
    gpsHoleFlags: gpsRoundData?.gpsHoleFlags,
    holeMapUrls: holeMapUrls ?? gpsRoundData?.holeMapUrls,
    roundTiming: rt,
  };
}
