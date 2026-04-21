import type { PendingGpsRoundData, RoundHole, SavedRound } from '../types';
import type { CourseDetails, HoleDetail, TeeBox } from './golfCourseApiService';
import { getCourseDetails } from './golfCourseApiService';
import { deriveGreenSummary } from './greenSummaryService';
import { buildCourseSnapshot } from '../components/score-entry/scoreEntryUtils';
import { buildRoundPersistenceMeta } from '../components/score-entry/hooks/roundPersistenceMeta';
import { resolveHoleMapUrlsForRoundSave } from '../utils/gpsHoleMapSnapshot';
import { getUserProfile } from './userService';
import { getStatPreferencesFromProfile } from '../utils/statPreferences';
import { saveRound } from './roundsService';
import { logger } from '../utils/logger';
import { buildVisibleHoleDetails } from './savePausedGpsAsPartialRound';

function resolveTeeBox(course: CourseDetails, pending: PendingGpsRoundData): TeeBox | null {
  const boxes = course.teeBoxes || [];
  if (!boxes.length) return null;
  const want = (pending.teeName || '').trim().toLowerCase();
  if (want) {
    const byName = boxes.find((t) => t.name.toLowerCase() === want);
    if (byName) return byName;
    const byColor = boxes.find((t) => (t.color || '').toLowerCase() === want);
    if (byColor) return byColor;
  }
  return boxes[0];
}

function shotsForHole(pending: PendingGpsRoundData, holeNumber: number) {
  return (pending.gpsShots || []).filter((s) => s.holeNumber === holeNumber);
}

/**
 * Persist a completed GPS round to history as a normal `SavedRound` entry.
 * This avoids routing through the score-entry screen for GPS rounds.
 */
export async function saveCompletedGpsRoundToHistory(pending: PendingGpsRoundData): Promise<SavedRound> {
  const course = pending.courseOverride
    ? pending.courseOverride
    : await getCourseDetails(pending.courseId);

  const teeBox = resolveTeeBox(course, pending);
  if (!teeBox) throw new Error('No tee box available for this course');

  const visible: HoleDetail[] = buildVisibleHoleDetails(teeBox, {
    routeHoleNumbers: pending.routeHoleNumbers,
    roundLength: pending.roundLength,
  });
  if (!visible.length) throw new Error('No holes available for this round');

  const profile = await getUserProfile().catch(() => null);
  const statPreferences = getStatPreferencesFromProfile(profile);

  const roundHoles: RoundHole[] = [];
  for (const hd of visible) {
    const holeNum = hd.hole;
    const summary = (pending.gpsHoleSummaries || []).find((s) => s.holeNumber === holeNum) || {};
    const derived = deriveGreenSummary(shotsForHole(pending, holeNum), summary, hd.par);
    const putts =
      typeof summary.putts === 'number' ? summary.putts : (derived.putts ?? null);
    // score is not always explicitly stored; for GPS we assume shots+putts when not present.
    const shotCount = shotsForHole(pending, holeNum).length;
    const score =
      typeof (summary as { score?: number | null }).score === 'number'
        ? (summary as { score: number }).score
        : (shotCount > 0 || putts != null)
          ? (shotCount + (putts || 0))
          : 0;

    if (!score) continue;

    // Persist derived FIR / GIR so scorecard + course-stats insights see them.
    const fairwayHit = (summary as { fairwayHit?: RoundHole['fairwayHit'] }).fairwayHit ?? derived.fairwayHit ?? null;
    const greenHit = derived.girAchieved === true
      ? true
      : derived.girAchieved === false
        ? 'short'
        : null;

    roundHoles.push({
      number: holeNum,
      par: hd.par,
      score,
      ...(statPreferences.putts && putts != null ? { putts } : {}),
      ...(typeof summary.firstPuttDistance === 'number' ? { firstPuttDistance: summary.firstPuttDistance } : {}),
      ...(statPreferences.fairways && fairwayHit != null ? { fairwayHit } : {}),
      ...(statPreferences.greens && greenHit != null ? { greenHit } : {}),
      dataComplete: true,
    });
  }

  const totalScore = roundHoles.reduce((sum, h) => sum + h.score, 0);
  const totalPutts = roundHoles.reduce((sum, h) => sum + (typeof h.putts === 'number' ? h.putts : 0), 0);

  let holeMapUrls = pending.holeMapUrls;
  if (!holeMapUrls || Object.keys(holeMapUrls).length === 0) {
    try {
      holeMapUrls = await resolveHoleMapUrlsForRoundSave(pending, course.id);
    } catch (e) {
      logger.warn('saveCompletedGpsRoundToHistory: hole map URLs skipped', e);
    }
  }

  const courseSnapshot = buildCourseSnapshot(course, teeBox, undefined);
  const persistenceMeta = buildRoundPersistenceMeta(
    pending,
    pending.startedAt,
    pending.endedAt,
    holeMapUrls,
  );

  const holesPlayed = roundHoles.map((h) => h.number);

  try {
    return await saveRound({
      courseId: course.id,
      courseName: pending.courseName || course.name,
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
      roundLength: pending.roundLength || (visible.length <= 9 ? 'front9' : '18'),
      holes: roundHoles,
      holesPlayed,
      gpsShots: pending.gpsShots,
      gpsShotCount: pending.gpsShots?.length ?? 0,
      gpsHoleSummaries: pending.gpsHoleSummaries,
      gpsHoleFlags: pending.gpsHoleFlags,
      holeMapUrls,
      roundTiming: pending.roundTiming,
      roundStartedAt: pending.startedAt,
      roundEndedAt: pending.endedAt,
      roundComplete: true,
      isAcceptableForHandicap: false,
      ...persistenceMeta,
    });
  } catch (e) {
    logger.error('saveCompletedGpsRoundToHistory: saveRound failed', e);
    throw e;
  }
}

