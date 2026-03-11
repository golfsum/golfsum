import { useCallback, type MutableRefObject } from 'react';
import { Alert, Platform, Share } from 'react-native';
import { saveRound } from '../../../services/roundsService';
import { processIncompleteRound, process9HoleRound } from '../../../services/whsCalculations';
import { fetchLocalWeather, getCurrentWeather, type WeatherData as LocalWeatherData } from '../../../services/weatherService';
import type { SavedRound, RoundHole, UserProfile } from '../../../types';
import type { CourseDetails, TeeBox } from '../../../services/golfCourseApiService';
import { buildCourseSnapshot } from '../scoreEntryUtils';
import { clearInProgressRound } from '../../../services/inProgressRoundService';
import { logger } from '../../../utils/logger';
import { formatYardage, getYardageUnitLabel, type DistanceUnit } from '../../../utils/distance';
import { FEEDBACK_COPY } from '../../../constants/feedbackCopy';
import type { HoleScore } from '../types';
import { getStatPreferencesFromProfile } from '../../../utils/statPreferences';

interface UseRoundSaveParams {
  course: CourseDetails | null;
  selectedTeeBox: TeeBox | null;
  courseOverride?: CourseDetails;
  courseElevationFt: number | null;
  holes: HoleScore[];
  currentHole: number;
  startType: 'standard' | 'shotgun';
  startingHole: number;
  eventTag: string;
  statPreferences: ReturnType<typeof getStatPreferencesFromProfile>;
  hasStatAccess: boolean;
  entryMode: 'detailed' | 'quick';
  userProfile: UserProfile | null;
  distanceUnit: DistanceUnit;
  currentWeather: LocalWeatherData | null;
  setCurrentWeather: (w: LocalWeatherData | null) => void;
  weatherFront9: LocalWeatherData | null;
  weatherBack9: LocalWeatherData | null;
  windDirection: 'into' | 'helping' | 'cross-l' | 'cross-r' | 'swirling' | 'calm';
  onRoundSaved: (round: SavedRound) => void;
  setIsSaving: (v: boolean) => void;
  firstSaveTimestampRef: MutableRefObject<number | null>;
  lastSaveTimestampRef: MutableRefObject<number | null>;
}

export function useRoundSave({
  course,
  selectedTeeBox,
  courseOverride,
  courseElevationFt,
  holes,
  currentHole,
  startType,
  startingHole,
  eventTag,
  statPreferences,
  hasStatAccess,
  entryMode,
  userProfile,
  distanceUnit,
  currentWeather,
  setCurrentWeather,
  weatherFront9,
  weatherBack9,
  windDirection,
  onRoundSaved,
  setIsSaving,
  firstSaveTimestampRef,
  lastSaveTimestampRef,
}: UseRoundSaveParams) {
  const resolveRoundWeather = useCallback(async (): Promise<LocalWeatherData | null> => {
    if (currentWeather) return currentWeather;

    const courseLat = course?.latitude ?? courseOverride?.latitude;
    const courseLon = course?.longitude ?? courseOverride?.longitude;
    const weather = courseLat !== undefined && courseLon !== undefined
      ? await getCurrentWeather(courseLat, courseLon)
      : await fetchLocalWeather();

    if (weather) setCurrentWeather(weather);
    return weather;
  }, [currentWeather, course, courseOverride, setCurrentWeather]);

  const calculateStats = useCallback((holesOverride = holes) => {
    const completedHoles = holesOverride.filter(h => h.isSaved || (h.score !== null && h.score > 0));
    const totalScore = completedHoles.reduce((sum, h) => sum + (h.score ?? h.par), 0);
    const totalPar = completedHoles.reduce((sum, h) => sum + h.par, 0);

    const firEligibleHoles = completedHoles.filter(h => h.par !== 3);
    const firHit = firEligibleHoles.filter(h => h.fir === 'hit').length;
    const firPercent = firEligibleHoles.length > 0 ? Math.round((firHit / firEligibleHoles.length) * 100) : 0;

    const girHit = completedHoles.filter(h => h.gir === 'hit').length;
    const girPercent = completedHoles.length > 0 ? Math.round((girHit / completedHoles.length) * 100) : 0;

    const puttValues = statPreferences.putts
      ? completedHoles.map(h => h.putts).filter((v): v is number => v !== null && v !== undefined)
      : [];
    const puttsTrackedHoles = puttValues.length;
    const puttsFullyTracked = statPreferences.putts && completedHoles.length > 0 && puttsTrackedHoles > 0;
    const totalPutts = puttsFullyTracked ? puttValues.reduce((sum, v) => sum + v, 0) : 0;
    const avgPutts = puttsFullyTracked ? (totalPutts / puttsTrackedHoles).toFixed(1) : '—';

    const upDownAttempts = statPreferences.scrambling
      ? completedHoles.filter(h => h.gir !== null && h.gir !== 'hit' && h.upDown !== null).length
      : 0;
    const upDownMade = statPreferences.scrambling
      ? completedHoles.filter(h => h.gir !== null && h.gir !== 'hit' && h.upDown === true).length
      : 0;

    return {
      completedHoles: completedHoles.length,
      totalScore,
      totalPar,
      scoreToPar: totalScore - totalPar,
      firHit,
      firTotal: firEligibleHoles.length,
      firPossible: firEligibleHoles.length,
      firPercent,
      girHit,
      girTotal: completedHoles.length,
      girPercent,
      totalPutts,
      avgPutts,
      puttsTracked: puttsFullyTracked,
      puttsTrackedHoles,
      upDownAttempts,
      upDownMade,
    };
  }, [holes, statPreferences]);

  const toRoundHoles = useCallback((holesOverride: HoleScore[]): RoundHole[] => {
    return holesOverride.map(h => ({
      number: h.hole,
      par: h.par,
      score: (h.isSaved || (h.score !== null && h.score > 0)) ? (h.score ?? h.par) : 0,
      putts: statPreferences.putts && h.putts !== null ? h.putts : undefined,
      firstPuttDistance: userProfile?.scoringPreferences?.trackPuttDistance ? (h.firstPuttDistance ?? null) : undefined,
      fairwayHit: h.par === 3 ? null : (h.fir === 'hit' ? true : h.fir === 'miss' ? false : (h.fir === null ? null : h.fir)),
      greenHit: h.gir === 'hit' ? true : h.gir === 'miss' ? false : (h.gir === null ? null : h.gir),
      approachDistance: h.approachDistance,
      handicapIndex: h.handicap,
      teeClub: userProfile?.scoringPreferences?.trackClubs === false ? undefined : h.teeClub || undefined,
      approachClub: userProfile?.scoringPreferences?.trackClubs === false ? undefined : h.approachClub || undefined,
      upDown: statPreferences.scrambling ? h.upDown ?? null : undefined,
      fairwayBunker: statPreferences.bunkers ? h.fairwayBunker : undefined,
      greenSideBunker: statPreferences.bunkers ? h.greenSideBunker : undefined,
      isSaved: h.isSaved || undefined,
    }));
  }, [statPreferences, userProfile]);

  const saveIncompleteRound = useCallback(async (
    reason: 'finished-early' | 'nine-holes' | 'weather' | 'practice' | 'other'
  ) => {
    if (!course || !selectedTeeBox) return;

    setIsSaving(true);
    try {
      const stats = calculateStats();

      const holesPlayedNumbers = holes
        .filter(h => h.isSaved || (h.score !== null && h.score > 0))
        .map(h => h.hole);
      const holesCompletedCount = holesPlayedNumbers.length;

      if (holesCompletedCount === 0) {
        Alert.alert(FEEDBACK_COPY.alerts.noHolesSavedTitle, FEEDBACK_COPY.alerts.noHolesSavedBody, [{ text: 'OK' }]);
        setIsSaving(false);
        return;
      }

      const usesWrappedOrder = startType === 'standard' && startingHole > 1;
      const lastCompletedHole = startType === 'shotgun'
        ? holesCompletedCount
        : usesWrappedOrder
          ? holesCompletedCount
          : currentHole + 1;
      const plannedHoles = 18;

      const courseHandicap = 0;

      let roundHoles = toRoundHoles(holes);

      let isNineHoleRound = false;
      let needsPairing = false;
      let isIncomplete = startType === 'standard';
      let handicapStatus = '';
      let adjustmentMethod: 'Net Par for missing holes' | null = null;

      const playedHoles = roundHoles.filter(h => h.isSaved || h.score > 0);

      if (reason === 'nine-holes' && playedHoles.length >= 7) {
        const nineHoleResult = process9HoleRound(playedHoles.slice(0, 9), true);
        isNineHoleRound = nineHoleResult.isNineHoleRound;
        needsPairing = nineHoleResult.needsPairing;
        handicapStatus = nineHoleResult.handicapStatus;
        roundHoles = roundHoles.slice(0, 9);
        isIncomplete = false;
      } else {
        const incompleteResult = processIncompleteRound(roundHoles, lastCompletedHole, plannedHoles, courseHandicap);
        if (incompleteResult.isEligible) {
          roundHoles = incompleteResult.holes;
          handicapStatus = incompleteResult.handicapStatus;
          adjustmentMethod = 'Net Par for missing holes';
        } else {
          handicapStatus = incompleteResult.handicapStatus;
        }
      }

      const totalScore = roundHoles.reduce((sum, h) => sum + (h.score || 0), 0);
      const courseSnapshot = buildCourseSnapshot(course, selectedTeeBox, courseElevationFt);
      const roundWeather = await resolveRoundWeather();
      const frontWeather = weatherFront9 || roundWeather;
      const backWeather = weatherBack9;
      const roundStartedAt = firstSaveTimestampRef.current ?? Date.now();
      const roundEndedAt = lastSaveTimestampRef.current ?? Date.now();
      const roundDurationMinutes = Math.max(1, Math.round((roundEndedAt - roundStartedAt) / 60000));

      const savedRound = await saveRound({
        courseId: course.id,
        courseName: course.name,
        date: new Date(),
        roundSource: 'manual',
        entryMode: hasStatAccess && entryMode === 'detailed' ? 'advanced' : 'basic',
        score: totalScore,
        statPreferencesSnapshot: statPreferences,
        courseSnapshot,
        weather: roundWeather ? { temp: `${roundWeather.temp}F`, conditions: roundWeather.conditions, wind: roundWeather.wind, windDirection, humidity: roundWeather.humidity } : undefined,
        weatherFront9: frontWeather ? { temp: `${frontWeather.temp}F`, conditions: frontWeather.conditions, wind: frontWeather.wind, windDirection, humidity: frontWeather.humidity } : undefined,
        weatherBack9: backWeather ? { temp: `${backWeather.temp}F`, conditions: backWeather.conditions, wind: backWeather.wind, windDirection, humidity: backWeather.humidity } : undefined,
        stats: {
          ...stats,
          score: totalScore,
          ...((statPreferences.putts && stats.puttsTracked) ? {} : { putts: undefined }),
          teeBox: selectedTeeBox.name,
        },
        html: '',
        imageUri: '',
        tee: selectedTeeBox.name,
        teeName: selectedTeeBox.name,
        holes: roundHoles,
        isIncomplete,
        isNineHoleRound,
        holeCount: roundHoles.length,
        plannedHoles,
        lastCompletedHole,
        endRoundReason: reason,
        adjustmentMethod,
        needsPairing,
        handicapStatus,
        isAcceptableForHandicap: adjustmentMethod !== null || isNineHoleRound,
        startType,
        holesPlayed: holesPlayedNumbers,
        eventTag: eventTag || undefined,
        roundStartedAt,
        roundEndedAt,
        roundDurationMinutes,
      });

      logger.debug('Incomplete round saved', { startType, reason, holesCompleted: holesCompletedCount });
      await clearInProgressRound();
      onRoundSaved(savedRound);
    } catch (error) {
      logger.error('Error saving incomplete round:', error);
      Alert.alert('Error', 'Failed to save round. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [
    course, selectedTeeBox, holes, currentHole, startType, startingHole, eventTag,
    statPreferences, hasStatAccess, entryMode, courseElevationFt,
    weatherFront9, weatherBack9, windDirection, onRoundSaved,
    setIsSaving, calculateStats, resolveRoundWeather, toRoundHoles,
  ]);

  const generateScorecardHTML = useCallback((holesOverride = holes): string => {
    const front9 = holesOverride.slice(0, 9);
    const back9 = holesOverride.slice(9, 18);
    const yardageUnitLabel = getYardageUnitLabel(distanceUnit);

    const front9Score = front9.reduce((sum, h) => sum + (h.score || 0), 0);
    const back9Score = back9.reduce((sum, h) => sum + (h.score || 0), 0);
    const front9Putts = front9.reduce((sum, h) => sum + (h.putts || 0), 0);
    const back9Putts = back9.reduce((sum, h) => sum + (h.putts || 0), 0);

    const renderRow = (label: string, cells: Array<string | number>, isHeader = false) => {
      const tag = isHeader ? 'th' : 'td';
      return `<tr><${tag} class="row-label">${label}</${tag}>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`;
    };

    const getScoreClass = (score: number | string | null, par: number) => {
      const value = typeof score === 'number' ? score : parseInt(String(score), 10);
      if (!Number.isFinite(value)) return '';
      const diff = value - par;
      if (diff <= -2) return 'score-eagle';
      if (diff === -1) return 'score-birdie';
      if (diff === 0) return 'score-par';
      if (diff === 1) return 'score-bogey';
      if (diff === 2) return 'score-double';
      return 'score-triple';
    };

    const renderScoreRow = (label: string, scores: Array<number | string>, pars: number[], totals: Array<string | number>) => {
      const cells = scores.map((score, idx) => {
        const cls = getScoreClass(score, pars[idx]);
        return `<td class="${cls}">${score}</td>`;
      });
      return `<tr><td class="row-label">${label}</td>${cells.join('')}${totals.map(t => `<td>${t}</td>`).join('')}</tr>`;
    };

    const firLabel = (h: HoleScore) => {
      if (h.par === 3) return '—';
      const map: Record<string, string> = { hit: 'H', miss: 'M', 'double-left': 'DL', left: 'L', right: 'R', short: 'Sh', long: 'Lo', 'double-right': 'DR' };
      return h.fir ? (map[h.fir] ?? '-') : '-';
    };

    const girLabel = (h: HoleScore) => {
      const map: Record<string, string> = { hit: 'H', miss: 'M', left: 'L', right: 'R', short: 'Sh', long: 'Lo' };
      return h.gir ? (map[h.gir] ?? '-') : '-';
    };

    const frontLabels = Array.from({ length: 9 }, (_, i) => i + 1);
    const backLabels = Array.from({ length: 9 }, (_, i) => i + 10);

    return `<!DOCTYPE html>
<html><head><style>
body{font-family:system-ui,sans-serif;padding:20px;background:#1F2937;color:#E5E7EB}
table{border-collapse:collapse;width:100%;font-size:14px;background:#1a2028;border-radius:8px;overflow:hidden}
th,td{border:1px solid#4B5563;padding:8px;text-align:center}
.row-label{text-align:left;font-weight:600;background:#2a3038}
.score-par{color:#E5E7EB;font-weight:700}
.score-birdie{color:#EF4444;border:2px solid #EF4444;border-radius:999px;font-weight:700}
.score-eagle{color:#EF4444;border:2px solid #EF4444;border-radius:999px;font-weight:700;box-shadow:0 0 0 2px #EF4444 inset}
.score-bogey{color:#1D4ED8;border:2px solid #1D4ED8;border-radius:4px;font-weight:700}
.score-double{color:#6B7280;border:2px solid #6B7280;border-radius:4px;font-weight:700;box-shadow:0 0 0 2px #6B7280 inset}
.score-triple{color:#6B7280;border:2px solid #6B7280;border-radius:4px;font-weight:700;box-shadow:0 0 0 2px #6B7280 inset}
</style></head><body>
<h2>${course?.name || 'Golf Round'}</h2>
<p>${selectedTeeBox?.name} Tees</p>
<table><thead>${renderRow('Hole', [...frontLabels, 'OUT'], true)}</thead><tbody>
${renderRow('Par', [...front9.map(h => h.par), front9.reduce((s, h) => s + h.par, 0)])}
${renderRow(`Yardage (${yardageUnitLabel})`, [...front9.map(h => formatYardage(h.yardage, distanceUnit)), formatYardage(front9.reduce((s, h) => s + h.yardage, 0), distanceUnit)])}
${renderScoreRow('Score', front9.map(h => h.score || '-'), front9.map(h => h.par), [front9Score || '-'])}
${renderRow('Putts', [...front9.map(h => h.putts || '-'), front9Putts || '-'])}
${renderRow('FIR', [...front9.map(firLabel), '-'])}
${renderRow('GIR', [...front9.map(girLabel), '-'])}
</tbody></table><br/>
<table><thead>${renderRow('Hole', [...backLabels, 'IN', 'TOT'], true)}</thead><tbody>
${renderRow('Par', [...back9.map(h => h.par), back9.reduce((s, h) => s + h.par, 0), holesOverride.reduce((s, h) => s + h.par, 0)])}
${renderRow(`Yardage (${yardageUnitLabel})`, [...back9.map(h => formatYardage(h.yardage, distanceUnit)), formatYardage(back9.reduce((s, h) => s + h.yardage, 0), distanceUnit), formatYardage(holesOverride.reduce((s, h) => s + h.yardage, 0), distanceUnit)])}
${renderScoreRow('Score', back9.map(h => h.score || '-'), back9.map(h => h.par), [back9Score || '-', front9Score + back9Score || '-'])}
${renderRow('Putts', [...back9.map(h => h.putts || '-'), back9Putts || '-', front9Putts + back9Putts || '-'])}
${renderRow('FIR', [...back9.map(firLabel), '-', `${holesOverride.filter(h => h.fir === 'hit').length}/${holesOverride.filter(h => h.par !== 3).length}`])}
${renderRow('GIR', [...back9.map(girLabel), '-', `${holesOverride.filter(h => h.gir === 'hit').length}/${holesOverride.length}`])}
</tbody></table></body></html>`;
  }, [holes, course, selectedTeeBox, distanceUnit]);

  const saveRoundData = useCallback(async (holesOverride?: HoleScore[]) => {
    if (!course || !selectedTeeBox) return;

    setIsSaving(true);
    try {
      const holesToUse = holesOverride ?? holes;
      const stats = calculateStats(holesToUse);
      const html = generateScorecardHTML(holesToUse);

      const roundHoles = toRoundHoles(holesToUse);
      const savedHoles = holesToUse.filter(h => h.isSaved || (h.score !== null && h.score > 0));
      const savedHoleNumbers = savedHoles.map(h => h.hole);
      const isIncomplete = savedHoles.length < holesToUse.length;

      const courseSnapshot = buildCourseSnapshot(course, selectedTeeBox, courseElevationFt);
      const roundWeather = await resolveRoundWeather();
      const frontWeather = weatherFront9 || roundWeather;
      const backWeather = weatherBack9;
      const roundStartedAt = firstSaveTimestampRef.current ?? Date.now();
      const roundEndedAt = lastSaveTimestampRef.current ?? Date.now();
      const roundDurationMinutes = Math.max(1, Math.round((roundEndedAt - roundStartedAt) / 60000));

      const savedRound = await saveRound({
        courseId: course.id,
        courseName: course.name,
        date: new Date(),
        roundSource: 'manual',
        entryMode: hasStatAccess && entryMode === 'detailed' ? 'advanced' : 'basic',
        score: stats.totalScore,
        statPreferencesSnapshot: statPreferences,
        courseSnapshot,
        weather: roundWeather ? { temp: `${roundWeather.temp}F`, conditions: roundWeather.conditions, wind: roundWeather.wind, windDirection, humidity: roundWeather.humidity } : undefined,
        weatherFront9: frontWeather ? { temp: `${frontWeather.temp}F`, conditions: frontWeather.conditions, wind: frontWeather.wind, windDirection, humidity: frontWeather.humidity } : undefined,
        weatherBack9: backWeather ? { temp: `${backWeather.temp}F`, conditions: backWeather.conditions, wind: backWeather.wind, windDirection, humidity: backWeather.humidity } : undefined,
        stats: {
          score: stats.totalScore,
          ...((statPreferences.putts && stats.puttsTracked) ? { putts: stats.totalPutts } : {}),
          fairways: stats.firHit,
          fairwaysPossible: stats.firTotal,
          greens: stats.girHit,
          greensPossible: stats.girTotal,
          ...(statPreferences.scrambling && stats.upDownAttempts > 0 && {
            upDownMade: stats.upDownMade,
            upDownAttempts: stats.upDownAttempts,
          }),
          teeBox: selectedTeeBox.name,
        },
        html,
        imageUri: '',
        tee: selectedTeeBox.name,
        teeName: selectedTeeBox.name,
        holes: roundHoles,
        isAcceptableForHandicap: false,
        ...(isIncomplete && {
          isIncomplete: true,
          holeCount: savedHoles.length,
          plannedHoles: holesToUse.length,
          holesPlayed: savedHoleNumbers,
          lastCompletedHole: savedHoleNumbers.length > 0 ? Math.max(...savedHoleNumbers) : 0,
          endRoundReason: 'finished-early' as const,
          handicapStatus: savedHoles.length < (holesToUse.length <= 9 ? 9 : 18)
            ? `Played ${savedHoles.length} of ${holesToUse.length} holes. Minimum ${holesToUse.length <= 9 ? 9 : 18} required for rating.`
            : undefined,
        }),
        roundStartedAt,
        roundEndedAt,
        roundDurationMinutes,
      });

      await clearInProgressRound();
      onRoundSaved(savedRound);
    } catch (error) {
      logger.error('Error saving round:', error);
      Alert.alert('Error', 'Failed to save round. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [
    course, selectedTeeBox, holes, statPreferences, hasStatAccess, entryMode,
    courseElevationFt, weatherFront9, weatherBack9, windDirection, onRoundSaved,
    setIsSaving, calculateStats, resolveRoundWeather, toRoundHoles, generateScorecardHTML,
  ]);

  const handleSaveRound = useCallback(async (holesOverride?: HoleScore[]) => {
    const holesToUse = holesOverride ?? holes;
    const stats = calculateStats(holesToUse);

    if (stats.completedHoles === 0) {
      Alert.alert(FEEDBACK_COPY.alerts.noHolesSavedTitle, FEEDBACK_COPY.alerts.noHolesSavedBody);
      return;
    }

    const savedHoles = holesToUse.filter(h => h.isSaved || (h.score !== null && h.score > 0));
    const firstSave = firstSaveTimestampRef.current;
    const lastSave = lastSaveTimestampRef.current;
    const roundDurationMs = (firstSave && lastSave) ? (lastSave - firstSave) : Infinity;
    const fiveMinutes = 5 * 60 * 1000;

    if (savedHoles.length > 1 && roundDurationMs < fiveMinutes) {
      const scores = savedHoles.map(h => h.score ?? h.par);
      const putts = savedHoles.map(h => h.putts ?? 2);
      const allSameScore = scores.every(s => s === scores[0]);
      const allSamePutts = putts.every(p => p === putts[0]);
      const noFirGir = savedHoles.every(h => h.fir === null && h.gir === null);

      if (allSameScore && allSamePutts && noFirGir) {
        Alert.alert(
          'All holes have the same score.',
          'Save this round to your history?',
          [
            { text: 'Discard', style: 'cancel' },
            { text: 'Save Round', onPress: () => saveRoundData() },
          ]
        );
        return;
      }
    }

    if (stats.completedHoles < holesToUse.length) {
      Alert.alert(
        'Partial Round',
        `You've saved ${stats.completedHoles} of ${holesToUse.length} holes. Save anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save', onPress: () => saveRoundData(holesToUse) },
        ]
      );
    } else {
      await saveRoundData(holesToUse);
    }
  }, [holes, calculateStats, saveRoundData, firstSaveTimestampRef, lastSaveTimestampRef]);

  const copyScorecardHTML = useCallback(async () => {
    const html = generateScorecardHTML();
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(html);
        Alert.alert(FEEDBACK_COPY.alerts.copiedTitle, FEEDBACK_COPY.alerts.copiedBody);
        return;
      }
      await Share.share({ message: html });
    } catch (error) {
      logger.warn('Copy scorecard HTML failed:', error);
    }
  }, [generateScorecardHTML]);

  return {
    resolveRoundWeather,
    calculateStats,
    saveIncompleteRound,
    handleSaveRound,
    saveRoundData,
    generateScorecardHTML,
    copyScorecardHTML,
  };
}
