import { useMemo } from 'react';
import type { SavedRound } from '../../../types';
import { buildRoundSummaryText } from '../../../utils/roundSummary';
import { computeFirStats, computeGirStats, computeScramblingStats } from '../../../utils/roundStats';
import { getRoundStatPreferences } from '../../../utils/statPreferences';
import { isFairwayHit, isGreenHit } from '../../../utils/statChecks';
import type { RoundInsight } from '../RoundInsightsCard';
import { generateRoundInsights, buildInsightInput } from '../../../services/roundInsightsEngine';

type Directional = boolean | 'left' | 'right' | 'short' | 'long' | null;

interface UseRoundDetailDataParams {
  round: SavedRound;
  baselineRounds: SavedRound[];
}

interface NormalizedHole {
  number: number;
  score?: number;
  par?: number;
  yardage?: number;
  handicapIndex?: number;
  fairwayHit?: Directional;
  greenHit?: Directional;
  putts?: number;
  upDown?: boolean | null;
  isSaved?: boolean;
}

export const useRoundDetailData = ({
  round,
  baselineRounds,
}: UseRoundDetailDataParams) => {
  const statPreferences = getRoundStatPreferences(round);
  const roundSummaryText = buildRoundSummaryText(round, baselineRounds);
  const firStats = computeFirStats(round);
  const girStats = computeGirStats(round);
  const firPct = firStats ? firStats.percent : null;
  const girPct = girStats ? girStats.percent : null;

  const isScoreOnlyRound = useMemo(() => {
    const hasFir = !!computeFirStats(round);
    const hasGir = !!computeGirStats(round);
    return !hasFir && !hasGir;
  }, [round]);

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getRoundPar = () => {
    // For incomplete rounds with holesPlayed, only sum par for played holes
    const playedSet = round.holesPlayed?.length ? new Set(round.holesPlayed) : null;

    if (round.courseSnapshot?.holes?.length) {
      const relevantHoles = playedSet
        ? round.courseSnapshot.holes.filter(h => playedSet.has(h.number))
        : round.courseSnapshot.holes;
      return relevantHoles.reduce((sum, hole) => sum + hole.par, 0);
    }
    if (round.holes?.length) {
      const relevantHoles = playedSet
        ? round.holes.filter(h => playedSet.has(h.number))
        : round.holes;
      const parSum = relevantHoles.reduce((sum, hole) => sum + (hole.par || 0), 0);
      return parSum > 0 ? parSum : null;
    }
    return null;
  };

  const getFullCoursePar = () => {
    if (round.courseSnapshot?.holes?.length) {
      return round.courseSnapshot.holes.reduce((sum, hole) => sum + hole.par, 0);
    }
    if (round.holes?.length) {
      const parSum = round.holes.reduce((sum, hole) => sum + (hole.par || 0), 0);
      return parSum > 0 ? parSum : null;
    }
    return null;
  };

  const calculateToPar = () => {
    const par = getRoundPar() ?? 72;
    const diff = round.score - par;
    if (diff === 0) return 'E';
    return diff > 0 ? `+${diff}` : `${diff}`;
  };

  const maxHoleNumber = Math.max(
    0,
    ...(round.holes?.map(h => (h as any).number ?? (h as any).holeNumber ?? (h as any).hole) || []),
    ...(round.courseSnapshot?.holes?.map(h => h.number) || []),
    ...(round.holesPlayed || [])
  );
  const plannedHoles = round.plannedHoles
    || (round.isNineHoleRound ? 9 : 18);
  const totalHoles = Math.max(plannedHoles, maxHoleNumber);
  const holeNumbers = Array.from({ length: totalHoles }, (_, i) => i + 1);

  const normalizedHoles: NormalizedHole[] = (round.holes || [])
    .map((hole) => {
      const number = (hole as any).number ?? (hole as any).holeNumber ?? (hole as any).hole;
      const courseHole = round.courseSnapshot?.holes?.find(h => h.number === number);
      return {
        ...hole,
        number,
        score: typeof (hole as any).score === 'number'
          ? (hole as any).score
          : (hole as any).grossScore ?? (hole as any).strokes,
        par: (hole as any).par ?? courseHole?.par,
        yardage: (hole as any).yardage ?? courseHole?.yardage,
        handicapIndex: (hole as any).handicapIndex ?? courseHole?.handicapIndex,
      } as NormalizedHole;
    })
    .filter(hole => hole.number !== undefined && hole.number !== null);

  const holesByNumber = new Map<number, NormalizedHole>(
    normalizedHoles.map(hole => [hole.number, hole])
  );
  const holesPlayedSet = new Set(round.holesPlayed || []);

  const getHolePlayed = (holeNumber: number, hole?: NormalizedHole) => {
    // isSaved is the definitive signal for whether a hole was played
    if (hole?.isSaved) return true;
    // Check the round-level holesPlayed array (for rounds saved before isSaved existed)
    if (holesPlayedSet.size > 0) {
      return holesPlayedSet.has(holeNumber);
    }
    if (round.isIncomplete && round.startType !== 'shotgun' && round.lastCompletedHole) {
      return holeNumber <= round.lastCompletedHole && !!(hole && hole.score && hole.score > 0);
    }
    if (!hole) return false;
    if (typeof hole.score === 'number' && hole.score > 0) return true;
    if (typeof hole.putts === 'number') return true;
    if (hole.fairwayHit !== undefined && hole.fairwayHit !== null) return true;
    if (hole.greenHit !== undefined && hole.greenHit !== null) return true;
    return false;
  };

  const formatFairway = (value: Directional) => {
    if (value === true) return '✓';
    if (value === false) return '×';
    if (value === 'left') return '←';
    if (value === 'right') return '→';
    return '—';
  };

  const formatGreen = (value: Directional) => {
    if (value === true) return '✓';
    if (value === false) return '×';
    if (value === 'left') return '←';
    if (value === 'right') return '→';
    if (value === 'short') return '↓';
    if (value === 'long') return '↑';
    return '—';
  };

  const formatApproachDistance = (value: unknown) => {
    if (!value) return '-';
    return `${String(value)} yds`;
  };

  const buildSummary = (side: 'front' | 'back') => {
    const holes = holeNumbers
      .filter(num => side === 'front' ? num <= 9 : num >= 10)
      .map(num => holesByNumber.get(num))
      .filter(Boolean) as NormalizedHole[];

    const scored = holes.filter(h => h.isSaved || (h.score && h.score > 0));
    const totalScore = scored.length > 0 ? scored.reduce((sum, h) => sum + (h.score || h.par || 0), 0) : null;

    const puttsTracked = statPreferences.putts
      ? holes.filter(h => typeof h.putts === 'number')
      : [];
    const totalPutts = puttsTracked.length > 0 ? puttsTracked.reduce((sum, h) => sum + (h.putts || 0), 0) : null;

    const firTracked = statPreferences.fir
      ? holes.filter(h => h.par !== 3 && h.fairwayHit !== null && h.fairwayHit !== undefined)
      : [];
    const firHit = firTracked.filter(h => isFairwayHit(h.fairwayHit)).length;

    const girTracked = statPreferences.gir
      ? holes.filter(h => h.greenHit !== null && h.greenHit !== undefined)
      : [];
    const girHit = girTracked.filter(h => isGreenHit(h.greenHit)).length;

    const totalPar = holes.reduce((sum, h) => sum + (h.par || 0), 0);
    return {
      totalScore,
      totalPutts,
      firHit,
      firPossible: firTracked.length,
      girHit,
      girPossible: girTracked.length,
      holesCount: holes.length,
      par: totalPar || null,
    };
  };

  const frontNumbers = holeNumbers.filter(num => num <= 9);
  const backNumbers = holeNumbers.filter(num => num >= 10);
  const frontHasPlayed = frontNumbers.some(num => getHolePlayed(num, holesByNumber.get(num)));
  const backHasPlayed = backNumbers.some(num => getHolePlayed(num, holesByNumber.get(num)));

  const insights = useMemo((): RoundInsight[] => {
    // Build the engine-friendly input from normalised hole data
    const roundPar = getRoundPar() ?? 72;

    if (!round.holes || round.holes.length === 0) {
      // Score-only fallback — minimal insights from scoring distribution only
      const birdies = normalizedHoles.filter(h => h.score && h.par && h.score < h.par).length;
      const doubles = normalizedHoles.filter(h => h.score && h.par && h.score >= h.par + 2).length;
      const results: RoundInsight[] = [];
      if (birdies >= 3) results.push({ type: 'positive', label: `${birdies} birdies`, detail: 'Plenty of scoring ability out there.' });
      if (doubles === 0 && normalizedHoles.length >= 9) results.push({ type: 'positive', label: 'No big numbers', detail: 'Solid course management.' });
      if (doubles >= 3) results.push({ type: 'warning', label: `${doubles} doubles or worse`, detail: 'Eliminating blow-up holes is the fastest path to lower scores.' });
      return results.slice(0, 3);
    }

    const input = buildInsightInput(round.score, roundPar, round.holes);
    return generateRoundInsights(input);
  }, [round, normalizedHoles]);

  const scoring = useMemo(() => {
    const summary = { eagles: 0, birdies: 0, pars: 0, bogeys: 0, doubles: 0 };
    normalizedHoles.forEach(hole => {
      if (!hole.par || !hole.score || hole.score <= 0) return;
      const diff = hole.score - hole.par;
      if (diff <= -2) summary.eagles += 1;
      else if (diff === -1) summary.birdies += 1;
      else if (diff === 0) summary.pars += 1;
      else if (diff === 1) summary.bogeys += 1;
      else summary.doubles += 1;
    });
    return summary;
  }, [normalizedHoles]);

  return {
    statPreferences,
    roundSummaryText,
    firStats,
    girStats,
    firPct,
    girPct,
    isScoreOnlyRound,
    formatDate,
    getRoundPar,
    calculateToPar,
    holeNumbers,
    normalizedHoles,
    holesByNumber,
    getHolePlayed,
    formatFairway,
    formatGreen,
    formatApproachDistance,
    buildSummary,
    frontNumbers,
    backNumbers,
    frontHasPlayed,
    backHasPlayed,
    insights,
    scoring,
  };
};
