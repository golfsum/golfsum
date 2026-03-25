import type {
  GpsHoleDataQuality,
  GpsHoleSummary,
  GpsShotLog,
  PendingGpsRoundData,
  RoundHole,
  SavedRound,
} from '../types';
import { resolveHoleMapUrlsForRoundSave } from '../utils/gpsHoleMapSnapshot';
import { buildCourseSnapshot } from '../components/score-entry/scoreEntryUtils';
import { buildRoundPersistenceMeta } from '../components/score-entry/hooks/roundPersistenceMeta';
import { deriveGreenSummary } from './greenSummaryService';
import type { CourseDetails, HoleDetail, TeeBox } from './golfCourseApiService';
import { getCourseDetails } from './golfCourseApiService';
import type { GpsInProgressRound } from './inProgressRoundService';
import { saveRound } from './roundsService';
import { calculateFinalTiming, closePauseEvent } from './roundTimingService';
import type { InProgressTimingState } from './roundTimingService';
import { getStatPreferencesFromProfile } from '../utils/statPreferences';
import { getUserProfile } from './userService';
import { logger } from '../utils/logger';

function resolveTeeBox(course: CourseDetails, paused: GpsInProgressRound): TeeBox | null {
  const boxes = course.teeBoxes || [];
  if (!boxes.length) return null;
  const want = (paused.selectedTee?.name || paused.teeColor || '').trim().toLowerCase();
  if (want) {
    const byName = boxes.find((t) => t.name.toLowerCase() === want);
    if (byName) return byName;
    const byColor = boxes.find((t) => (t.color || '').toLowerCase() === want);
    if (byColor) return byColor;
  }
  return boxes[0];
}

/** Visible holes for this GPS session (matches GpsRoundScreen `visibleHoles` / index keys). */
export function buildVisibleHoleDetails(
  teeBox: TeeBox,
  paused: Pick<GpsInProgressRound, 'routeHoleNumbers' | 'roundLength'>
): HoleDetail[] {
  const all = teeBox.holes || [];
  if (paused.routeHoleNumbers?.length) {
    const map = new Map(all.map((h) => [h.hole, h]));
    return paused.routeHoleNumbers
      .map((n) => map.get(Number(n)))
      .filter((h): h is HoleDetail => Boolean(h));
  }
  if (paused.roundLength === 'front9') {
    return all.filter((h) => h.hole >= 1 && h.hole <= 9);
  }
  if (paused.roundLength === 'back9') {
    return all.filter((h) => h.hole >= 10 && h.hole <= 18);
  }
  return all;
}

function getRecord<T>(rec: Record<string, unknown>, idx: number): T | undefined {
  const a = rec[idx as unknown as string];
  if (a !== undefined && a !== null) return a as T;
  const b = rec[String(idx)];
  return b !== undefined && b !== null ? (b as T) : undefined;
}

function closeOpenPauses(timing: InProgressTimingState, endedAt: number): InProgressTimingState {
  const pauseEvents = timing.pauseEvents.map((p) =>
    p.resumedAt == null ? closePauseEvent(p, endedAt) : p
  );
  return { ...timing, pauseEvents, lastActiveAt: endedAt };
}

function mapLoggedShotsToGpsLogs(
  loggedShotsByHole: Record<string, unknown>,
  visible: HoleDetail[]
): GpsShotLog[] {
  return Object.entries(loggedShotsByHole).flatMap(([holeIndex, shots]) => {
    const idx = Number(holeIndex);
    if (!Number.isFinite(idx)) return [];
    const holeNumber = visible[idx]?.hole ?? idx + 1;
    const arr = Array.isArray(shots) ? shots : [];
    return arr.map((shot: Record<string, unknown>, index: number) => ({
      id: String(shot.id || `${holeIndex}-${index}`),
      holeNumber,
      shotNumber: typeof shot.num === 'number' ? shot.num : index + 1,
      club: String(shot.abbr || 'Shot'),
      lie: (shot.lie as string | null) || null,
      actualYards: typeof shot.actualYards === 'number' ? shot.actualYards : null,
      playingYards: typeof shot.playingYards === 'number' ? shot.playingYards : null,
      from: (shot.from as { lat: number; lng: number } | null) || null,
      to: (shot.to as { lat: number; lng: number } | null) || null,
      weather: shot.weather
        ? {
            windMph: Number.isFinite((shot.weather as { windMph?: number }).windMph ?? NaN)
              ? (shot.weather as { windMph: number }).windMph
              : null,
            windDegrees: Number.isFinite((shot.weather as { windDegrees?: number }).windDegrees ?? NaN)
              ? (shot.weather as { windDegrees: number }).windDegrees
              : null,
            tempF: Number.isFinite((shot.weather as { tempF?: number }).tempF ?? NaN)
              ? (shot.weather as { tempF: number }).tempF
              : null,
            humidity: Number.isFinite((shot.weather as { humidity?: number }).humidity ?? NaN)
              ? (shot.weather as { humidity: number }).humidity
              : null,
          }
        : null,
      loggedAt: typeof shot.loggedAt === 'string' ? shot.loggedAt : undefined,
      playerConfirmedDistance: Boolean(shot.playerConfirmedDistance),
      addedRetrospectively: Boolean(shot.addedRetrospectively),
      offCourseFlag: Boolean(shot.offCourseFlag),
    }));
  });
}

/**
 * Persist a paused GPS round as an incomplete saved round (no score-entry step).
 * Returns null if there is no hole data to save or course details could not be loaded.
 */
export async function savePausedGpsAsPartialRound(paused: GpsInProgressRound): Promise<SavedRound | null> {
  let course: CourseDetails;
  try {
    course = await getCourseDetails(paused.courseId);
  } catch (e) {
    logger.warn('savePausedGpsAsPartialRound: getCourseDetails failed', e);
    return null;
  }

  const teeBox = resolveTeeBox(course, paused);
  if (!teeBox) {
    logger.warn('savePausedGpsAsPartialRound: no tee box');
    return null;
  }

  const visible = buildVisibleHoleDetails(teeBox, paused);
  if (!visible.length) {
    logger.warn('savePausedGpsAsPartialRound: no visible holes');
    return null;
  }

  const logged = paused.loggedShotsByHole || {};
  const summariesRaw = paused.holeSummariesByHole || {};
  const scoresRaw = paused.holeScoresByHole || {};
  const flagsRaw = paused.holeFlagsByHole || {};

  const profile = await getUserProfile().catch(() => null);
  const statPreferences = getStatPreferencesFromProfile(profile);

  const gpsShots = mapLoggedShotsToGpsLogs(logged, visible);

  /** Static Mapbox URLs per hole (same pipeline as full GPS finish / score-entry save). */
  const snapshotEndedAt = Date.now();
  let holeMapUrls: Record<number, string> | undefined;
  try {
    const pendingForMaps: PendingGpsRoundData = {
      courseId: paused.courseId,
      courseName: paused.courseName,
      startedAt: paused.timing.roundStartedAt,
      endedAt: snapshotEndedAt,
      gpsShots,
      holeMapUrls: {},
    };
    holeMapUrls = await resolveHoleMapUrlsForRoundSave(pendingForMaps, course.id);
  } catch (e) {
    logger.warn('savePausedGpsAsPartialRound: hole map URLs skipped', e);
  }

  const roundHoles: RoundHole[] = [];
  for (let idx = 0; idx < visible.length; idx++) {
    const hd = visible[idx];
    const holeNum = hd.hole;
    const shots = (getRecord<unknown[]>(logged, idx) || []) as Record<string, unknown>[];
    const summary = (getRecord<Record<string, unknown>>(summariesRaw, idx) || {}) as {
      firstPuttDistance?: number | null;
      pinLocation?: string | null;
      putts?: number | null;
      score?: number | null;
    };
    const derived = deriveGreenSummary(shots, summary);
    const putts =
      typeof summary.putts === 'number' ? summary.putts : (derived.putts ?? null);
    const manual = getRecord<number>(scoresRaw, idx);
    const hasShots = shots.length > 0;
    const hasExplicitScore = typeof summary.score === 'number' && summary.score > 0;
    const isCompleted = hasShots || hasExplicitScore;
    if (!isCompleted) continue;

    const shotCount = hasShots ? shots.length : putts != null ? 1 : 0;
    const penaltyStrokes = shots.reduce((sum, s) => sum + Number(s.penaltyStrokes || 0), 0);
    const score =
      typeof manual === 'number'
        ? manual
        : (summary.score as number) ??
          shotCount + (putts || 0) + penaltyStrokes;

    const idxFlags = (getRecord<Record<string, unknown>>(flagsRaw, idx) || {}) as {
      shotCountFlagged?: boolean;
      distanceJumpFlagged?: boolean;
      playerConfirmed?: boolean;
    };

    roundHoles.push({
      number: holeNum,
      par: hd.par,
      score,
      ...(statPreferences.putts && putts != null ? { putts } : {}),
      ...(typeof summary.firstPuttDistance === 'number'
        ? { firstPuttDistance: summary.firstPuttDistance }
        : {}),
      dataComplete: true,
      ...(idxFlags.shotCountFlagged || idxFlags.distanceJumpFlagged || idxFlags.playerConfirmed
        ? {
            flags: {
              shotCountFlagged: Boolean(idxFlags.shotCountFlagged),
              distanceJumpFlagged: Boolean(idxFlags.distanceJumpFlagged),
              playerConfirmed: Boolean(idxFlags.playerConfirmed),
            },
          }
        : {}),
    });
  }

  if (!roundHoles.length) {
    return null;
  }

  const gpsHoleSummaries: GpsHoleSummary[] = [];
  for (let idx = 0; idx < visible.length; idx++) {
    const shots = (getRecord<unknown[]>(logged, idx) || []) as Record<string, unknown>[];
    const summary = (getRecord<Record<string, unknown>>(summariesRaw, idx) || {}) as {
      firstPuttDistance?: number | null;
      pinLocation?: string | null;
      putts?: number | null;
    };
    const derived = deriveGreenSummary(shots, summary);
    const holeNumber = visible[idx].hole;
    const entry: GpsHoleSummary = {
      holeNumber,
      firstPuttDistance:
        typeof summary.firstPuttDistance === 'number' ? summary.firstPuttDistance : null,
      pinLocation: (summary.pinLocation as GpsHoleSummary['pinLocation']) || null,
      putts: typeof summary.putts === 'number' ? summary.putts : (derived.putts ?? null),
    };
    if (
      entry.firstPuttDistance != null ||
      entry.putts != null ||
      entry.pinLocation != null
    ) {
      gpsHoleSummaries.push(entry);
    }
  }

  const gpsHoleFlags: GpsHoleDataQuality[] = Object.entries(flagsRaw).flatMap(([key, raw]) => {
    const idx = Number(key);
    if (!Number.isFinite(idx)) return [];
    const f = raw as {
      shotCountFlagged?: boolean;
      distanceJumpFlagged?: boolean;
      playerConfirmed?: boolean;
    };
    if (!f || (!f.shotCountFlagged && !f.distanceJumpFlagged && !f.playerConfirmed)) return [];
    const holeNumber = visible[idx]?.hole ?? idx + 1;
    return [
      {
        holeNumber,
        dataComplete: true,
        flags: {
          shotCountFlagged: Boolean(f.shotCountFlagged),
          distanceJumpFlagged: Boolean(f.distanceJumpFlagged),
          playerConfirmed: Boolean(f.playerConfirmed),
        },
      },
    ];
  });

  const totalScore = roundHoles.reduce((s, h) => s + h.score, 0);
  const totalPutts = statPreferences.putts
    ? roundHoles.reduce((s, h) => s + (h.putts ?? 0), 0)
    : 0;

  const endedAt = Date.now();
  let timing = closeOpenPauses(paused.timing, endedAt);
  const pausedHole =
    paused.pausedOnHole ?? visible[paused.currentHoleIndex]?.hole ?? visible[0]?.hole;
  const mergedHoleTimestamps = { ...timing.holeTimestamps };
  if (pausedHole != null) {
    const prev = mergedHoleTimestamps[pausedHole];
    mergedHoleTimestamps[pausedHole] = {
      holeNumber: pausedHole,
      startedAt: prev?.startedAt ?? endedAt,
      teeShotAt: prev?.teeShotAt ?? null,
      savedAt: endedAt,
      pausedMs: prev?.pausedMs ?? 0,
    };
  }
  timing = { ...timing, holeTimestamps: mergedHoleTimestamps };

  const holesCompleted = Math.max(
    roundHoles.length,
    Object.values(mergedHoleTimestamps).filter((h) => h.savedAt).length
  );
  const roundTiming = calculateFinalTiming(timing, holesCompleted, endedAt);

  const courseSnapshot = buildCourseSnapshot(course, teeBox, undefined);

  const holesPlayed = roundHoles.map((h) => h.number);
  const lastCompletedHole = holesPlayed.length ? Math.max(...holesPlayed) : 0;
  const plannedHoles = visible.length;

  const pendingLike: PendingGpsRoundData = {
    courseId: paused.courseId,
    courseName: paused.courseName,
    startedAt: roundTiming.roundStartedAt,
    endedAt: roundTiming.roundEndedAt,
    gpsShots,
    gpsHoleSummaries,
    gpsHoleFlags,
    roundTiming,
    ...(holeMapUrls && Object.keys(holeMapUrls).length ? { holeMapUrls } : {}),
  };

  const persistenceMeta = buildRoundPersistenceMeta(
    pendingLike,
    roundTiming.roundStartedAt,
    roundTiming.roundEndedAt,
    holeMapUrls,
  );

  const savedRound = await saveRound({
    courseId: course.id,
    courseName: paused.courseName || course.name,
    date: new Date(),
    roundSource: 'manual',
    entryMode: 'basic',
    score: totalScore,
    statPreferencesSnapshot: statPreferences,
    courseSnapshot,
    stats: {
      score: totalScore,
      ...(statPreferences.putts && totalPutts > 0 ? { putts: totalPutts } : {}),
      teeBox: teeBox.name,
    },
    html: '',
    imageUri: '',
    tee: teeBox.name,
    teeName: teeBox.name,
    roundLength: paused.roundLength ?? (visible.length <= 9 ? 'front9' : '18'),
    holes: roundHoles,
    isAcceptableForHandicap: false,
    isIncomplete: true,
    roundComplete: false,
    holeCount: roundHoles.length,
    plannedHoles,
    holesPlayed,
    lastCompletedHole,
    endRoundReason: 'finished-early',
    handicapStatus:
      roundHoles.length < plannedHoles
        ? `Played ${roundHoles.length} of ${plannedHoles} holes.`
        : undefined,
    ...persistenceMeta,
  });

  return savedRound;
}
