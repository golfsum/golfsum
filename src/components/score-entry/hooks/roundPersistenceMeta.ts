import type { PendingGpsRoundData } from '../../../types';

export function buildRoundPersistenceMeta(
  gpsRoundData: PendingGpsRoundData | null | undefined,
  firstSaveTimestamp: number | null,
  lastSaveTimestamp: number | null,
) {
  const roundStartedAt = gpsRoundData?.startedAt ?? firstSaveTimestamp ?? Date.now();
  const roundEndedAt = gpsRoundData?.endedAt ?? lastSaveTimestamp ?? Date.now();
  const roundDurationMinutes = Math.max(1, Math.round((roundEndedAt - roundStartedAt) / 60000));

  return {
    roundStartedAt,
    roundEndedAt,
    roundDurationMinutes,
    gpsShots: gpsRoundData?.gpsShots,
    gpsShotCount: gpsRoundData?.gpsShots?.length ?? 0,
    gpsHoleSummaries: gpsRoundData?.gpsHoleSummaries,
    gpsHoleFlags: gpsRoundData?.gpsHoleFlags,
    holeMapUrls: gpsRoundData?.holeMapUrls,
  };
}
