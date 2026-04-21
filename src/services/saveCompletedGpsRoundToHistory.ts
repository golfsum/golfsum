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
      // Persist hole handicap index so the scorecard HCP column and the
      // net-stroke calculations have something to read. Previously this was
      // left undefined and the HCP column rendered blank.
      handicapIndex: typeof hd.handicap === 'number' ? hd.handicap : undefined,
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

  // Compute FIR / GIR / scrambling percentages from the holes we just built.
  // RoundDetailScreen reads stats.fir and stats.gir as integer percentages,
  // so we must pre-compute them here — otherwise the round detail shows "--".
  const firTracked = roundHoles.filter((h) => h.par > 3 && h.fairwayHit != null);
  const firHits = firTracked.filter((h) => h.fairwayHit === true).length;
  const firPct = firTracked.length > 0 ? Math.round((firHits / firTracked.length) * 100) : null;

  const girTracked = roundHoles.filter((h) => h.greenHit != null);
  const girHits = girTracked.filter((h) => h.greenHit === true).length;
  const girPct = girTracked.length > 0 ? Math.round((girHits / girTracked.length) * 100) : null;

  // Scrambling / up-and-down %: of holes where GIR wasn't made AND putts === 1,
  // the player "got up and down." This is a standard proxy when explicit
  // `upDown` toggles weren't used during GPS entry.
  const scrambleAttempts = roundHoles.filter((h) => h.greenHit === false && typeof h.putts === 'number');
  const scrambleMade = scrambleAttempts.filter((h) => (h.putts ?? 99) <= 1).length;
  const scramblePct = scrambleAttempts.length > 0
    ? Math.round((scrambleMade / scrambleAttempts.length) * 100)
    : null;

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
        // Fairway/Green/Scramble percentages for the Round Detail summary.
        // Only included when we actually tracked enough data to compute them
        // (avoids showing "0%" when nothing was tracked).
        ...(firPct != null ? { fir: firPct, fairways: firHits, fairwaysPossible: firTracked.length } : {}),
        ...(girPct != null ? { gir: girPct, greens: girHits, greensPossible: girTracked.length } : {}),
        ...(scramblePct != null ? { upDown: scramblePct, upDownMade: scrambleMade, upDownAttempts: scrambleAttempts.length } : {}),
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

