import { useCallback, useEffect, useMemo, useState } from 'react';
import { SavedRound, StatWithContext, RoundHole } from '../../../types';
import { getRounds } from '../../../services/roundsService';
import { getHandicapCalculationDetails } from '../../../services/whsCalculations';
import { isRoundStatEnabled } from '../../../utils/statPreferences';
import { isFairwayHit, isGreenHit, isGreenMiss } from '../../../utils/statChecks';
import {
  buildStatWithContext,
  calculateTrend,
  compareToExpected,
  getExpectedFairways,
  getExpectedGIR,
  getExpectedPutts,
  getExpected3PuttRate,
  getExpectedPenalties,
  getExpectedUpDown,
} from '../../../utils/averagesAnalytics';
import { logger } from '../../../utils/logger';

export interface PerformanceStats {
  fairways: StatWithContext | null;
  gir: StatWithContext | null;
  putts: StatWithContext | null;
  penalties: StatWithContext | null;
  threePuttRate: StatWithContext | null;
  upDown: StatWithContext | null;
}

export type MissPattern = {
  left: number;
  right: number;
  long?: number;
  short?: number;
  totalMisses: number;
};

export type ParStats = {
  averageScore: number;
  scoreToPar: number;
  girPercent?: number;
  firPercent?: number;
  upDownPercent?: number;
  averagePutts: number | null;
  holesPlayed: number;
  fairwayMissPattern?: MissPattern;
  greenMissPattern?: MissPattern;
};

export type BallStrikingTotals = {
  fairwaysHit: number;
  fairwaysTotal: number;
  greensHit: number;
  greensTotal: number;
  puttsTotal: number;
  puttsRounds: number;
  upDownMade: number;
  upDownAttempts: number;
  threePutts: number;
};

export type TrendSeries = {
  score: number[];
  fir: number[];
  gir: number[];
  putts: number[];
};

export type SparklineSeries = {
  putts: number[];
  penalties: number[];
  threePuttRate: number[];
  upDown: number[];
  fir: number[];
  gir: number[];
};

export type FrontBackSplit = {
  front: {
    scoreAvg: number;
    firPercent: number | null;
    girPercent: number | null;
    puttsAvg: number | null;
  };
  back: {
    scoreAvg: number;
    firPercent: number | null;
    girPercent: number | null;
    puttsAvg: number | null;
  };
  highlight: 'front' | 'back' | null;
  message: string;
  roundCount: number;
};

interface UseAveragesDataOptions {
  refreshTrigger?: number;
  trendRange: 5 | 10 | 20;
}

interface UseAveragesDataResult {
  rounds: SavedRound[];
  loading: boolean;
  refreshing: boolean;
  handicap: number;
  whsDetails: ReturnType<typeof getHandicapCalculationDetails> | null;
  performanceStats: PerformanceStats | null;
  ballStrikingTotals: BallStrikingTotals;
  trendSeries: TrendSeries;
  sparklineSeries: SparklineSeries;
  frontBackSplit: FrontBackSplit | null;
  parStats: { par3: ParStats; par4: ParStats; par5: ParStats };
  onRefresh: () => Promise<void>;
}

export const useAveragesData = ({
  refreshTrigger,
  trendRange,
}: UseAveragesDataOptions): UseAveragesDataResult => {
  const [rounds, setRounds] = useState<SavedRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [handicap, setHandicap] = useState<number>(15);
  const [whsDetails, setWhsDetails] = useState<ReturnType<typeof getHandicapCalculationDetails> | null>(null);
  const [performanceStats, setPerformanceStats] = useState<PerformanceStats | null>(null);

  useEffect(() => {
    loadStats();
  }, [refreshTrigger]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const allRounds = await getRounds();
      setRounds(allRounds);

      const whs = getHandicapCalculationDetails(allRounds);
      setWhsDetails(whs);
      const currentHandicap = whs.handicapIndex ?? 15;
      setHandicap(currentHandicap);

      const stats = buildPerformanceStats(allRounds, currentHandicap);
      setPerformanceStats(stats);
    } catch (error) {
      logger.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadStats();
    setRefreshing(false);
  }, []);

  const ballStrikingTotals = useMemo(() => buildBallStrikingTotals(rounds), [rounds]);
  const trendSeries = useMemo(() => buildTrendSeries(rounds, trendRange), [rounds, trendRange]);
  const sparklineSeries = useMemo(() => buildSparklineSeries(rounds, 10), [rounds]);
  const frontBackSplit = useMemo(() => buildFrontBackSplit(rounds), [rounds]);
  const parStats = useMemo(() => buildParStats(rounds), [rounds]);

  return {
    rounds,
    loading,
    refreshing,
    handicap,
    whsDetails,
    performanceStats,
    ballStrikingTotals,
    trendSeries,
    sparklineSeries,
    frontBackSplit,
    parStats,
    onRefresh,
  };
};

const applyTotalsOverride = (
  stat: StatWithContext | null,
  totalAttempts: number,
  totalHits: number,
  recentAttempts: number,
  recentHits: number,
  statType: 'percentage' | 'count' | 'distance',
  isLowerBetter: boolean
): StatWithContext | null => {
  if (!stat) return stat;

  const hasTotals = totalAttempts > 0;
  const hasRecentTotals = recentAttempts > 0;
  const aggregated = hasTotals ? (totalHits / totalAttempts) * 100 : null;
  const aggregatedRecent = hasRecentTotals ? (recentHits / recentAttempts) * 100 : undefined;

  if (!hasTotals) {
    return {
      ...stat,
      typical: Number.NaN,
      form: undefined,
      sampleSize: 0,
    };
  }

  const roundedTypical = Math.round((aggregated ?? 0) * 10) / 10;
  const roundedForm = aggregatedRecent !== undefined ? Math.round(aggregatedRecent * 10) / 10 : undefined;

  if (hasTotals) {
    const expected = Math.round(((totalHits / totalAttempts) * 100) * 10) / 10;
    if (roundedTypical !== expected) {
      logger.warn('[AveragesTab] Percent mismatch:', { totalHits, totalAttempts, roundedTypical, expected });
    }
  }

  const trend = roundedForm !== undefined
    ? calculateTrend({ typicalValue: roundedTypical, formValue: roundedForm, statType })
    : stat.trend;
  const status = stat.expectedRange
    ? compareToExpected(roundedTypical, stat.expectedRange, isLowerBetter)
    : stat.status;

  return {
    ...stat,
    typical: roundedTypical,
    form: roundedForm,
    trend,
    status,
  };
};

const buildPerformanceStats = (allRounds: SavedRound[], hcp: number): PerformanceStats => {
  const fairwaysData: number[] = [];
  const recentFairways: number[] = [];
  const recentRounds = allRounds.slice(0, 5);
  const totalsAll = buildBallStrikingTotals(allRounds);
  const totalsRecent = buildBallStrikingTotals(recentRounds);

  allRounds.forEach((round, idx) => {
    if (!isRoundStatEnabled(round, 'fir')) return;
    if (round.holes) {
      const par45Holes = round.holes.filter(h => h.par === 4 || h.par === 5);
      if (par45Holes.length > 0) {
        const fairwaysHit = par45Holes.filter(h => isFairwayHit(h.fairwayHit)).length;
        const fairwayPercent = (fairwaysHit / par45Holes.length) * 100;
        fairwaysData.push(fairwayPercent);
        if (idx < 5) recentFairways.push(fairwayPercent);
        return;
      }
    }

    if (round.stats?.fairways !== undefined && round.stats?.fairwaysPossible) {
      const fairwayPercent = (round.stats.fairways / round.stats.fairwaysPossible) * 100;
      fairwaysData.push(fairwayPercent);
      if (idx < 5) recentFairways.push(fairwayPercent);
    }
  });

  const girData: number[] = [];
  const recentGIR: number[] = [];

  allRounds.forEach((round, idx) => {
    if (!isRoundStatEnabled(round, 'gir')) return;
    if (round.holes) {
      const holesWithGIR = round.holes.filter(h => h.greenHit !== undefined);
      if (holesWithGIR.length > 0) {
        const girsHit = holesWithGIR.filter(h => isGreenHit(h.greenHit)).length;
        const girPercent = (girsHit / holesWithGIR.length) * 100;
        girData.push(girPercent);
        if (idx < 5) recentGIR.push(girPercent);
        return;
      }
    }

    if (round.stats?.greens !== undefined && round.stats?.greensPossible) {
      const girPercent = (round.stats.greens / round.stats.greensPossible) * 100;
      girData.push(girPercent);
      if (idx < 5) recentGIR.push(girPercent);
    }
  });

  const puttsData: number[] = [];
  const recentPutts: number[] = [];

  allRounds.forEach((round, idx) => {
    if (!isRoundStatEnabled(round, 'putts')) return;
    const puttCount = round.stats?.putts;
    if (puttCount && puttCount > 0) {
      puttsData.push(puttCount);
      if (idx < 5) recentPutts.push(puttCount);
    }
  });

  const penaltiesData: number[] = [];
  const recentPenalties: number[] = [];

  allRounds.forEach((round, idx) => {
    if (!isRoundStatEnabled(round, 'penalties')) return;
    if (round.penalties !== undefined) {
      penaltiesData.push(round.penalties);
      if (idx < 5) recentPenalties.push(round.penalties);
    }
  });

  const threePuttRates: number[] = [];
  const recent3Putts: number[] = [];

  allRounds.forEach((round, idx) => {
    if (!isRoundStatEnabled(round, 'putts')) return;
    if (!round.holes) return;
    const holesWithPutts = round.holes.filter(h => h.putts && h.putts > 0);
    if (holesWithPutts.length === 0) return;

    const threePutts = holesWithPutts.filter(h => h.putts! >= 3).length;
    const rate = (threePutts / holesWithPutts.length) * 100;
    threePuttRates.push(rate);

    if (idx < 5) recent3Putts.push(rate);
  });

  const upDownRates: number[] = [];
  const recentUpDown: number[] = [];

  allRounds.forEach((round, idx) => {
    if (!isRoundStatEnabled(round, 'scrambling')) return;

    let rate: number | null = null;

    if (round.stats?.upDownAttempts && round.stats.upDownAttempts > 0 && round.stats.upDownMade !== undefined) {
      rate = (round.stats.upDownMade / round.stats.upDownAttempts) * 100;
    } else if (round.holes) {
      const trackedAttempts = round.holes.filter(
        h => isGreenMiss(h.greenHit) && h.upDown !== null && h.upDown !== undefined
      );
      if (trackedAttempts.length > 0) {
        const made = trackedAttempts.filter(h => h.upDown === true).length;
        rate = (made / trackedAttempts.length) * 100;
      }
    }

    if (rate === null) return;
    upDownRates.push(rate);

    if (idx < 5) recentUpDown.push(rate);
  });

  return {
    fairways: applyTotalsOverride(
      buildStatWithContext(
        fairwaysData,
        recentFairways,
        hcp,
        'percentage',
        20,
        10,
        getExpectedFairways,
        false
      ),
      totalsAll.fairwaysTotal,
      totalsAll.fairwaysHit,
      totalsRecent.fairwaysTotal,
      totalsRecent.fairwaysHit,
      'percentage',
      false
    ),
    gir: applyTotalsOverride(
      buildStatWithContext(
        girData,
        recentGIR,
        hcp,
        'percentage',
        20,
        12,
        getExpectedGIR,
        false
      ),
      totalsAll.greensTotal,
      totalsAll.greensHit,
      totalsRecent.greensTotal,
      totalsRecent.greensHit,
      'percentage',
      false
    ),
    putts: buildStatWithContext(
      puttsData,
      recentPutts,
      hcp,
      'count',
      8,
      3,
      getExpectedPutts,
      true
    ),
    penalties: buildStatWithContext(
      penaltiesData,
      recentPenalties,
      hcp,
      'count',
      8,
      1.5,
      getExpectedPenalties,
      true
    ),
    threePuttRate: buildStatWithContext(
      threePuttRates,
      recent3Putts,
      hcp,
      'percentage',
      20,
      8,
      getExpected3PuttRate,
      true
    ),
    upDown: applyTotalsOverride(
      buildStatWithContext(
        upDownRates,
        recentUpDown,
        hcp,
        'percentage',
        15,
        15,
        getExpectedUpDown,
        false
      ),
      totalsAll.upDownAttempts,
      totalsAll.upDownMade,
      totalsRecent.upDownAttempts,
      totalsRecent.upDownMade,
      'percentage',
      false
    ),
  };
};

const buildTrendSeries = (allRounds: SavedRound[], limit: number): TrendSeries => {
  const sorted = [...allRounds].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const recentRounds = sorted.slice(-limit);
  const score: number[] = [];
  const fir: number[] = [];
  const gir: number[] = [];
  const putts: number[] = [];

  recentRounds.forEach(round => {
    if (typeof round.score === 'number' && round.score > 0) {
      const roundPar = round.holes?.length
        ? round.holes.reduce((sum, hole) => sum + (hole.par || 0), 0)
        : null;
      if (roundPar && roundPar > 0) {
        score.push(round.score - roundPar);
      } else {
        score.push(round.score);
      }
    }

    if (isRoundStatEnabled(round, 'fir')) {
      if (round.holes && round.holes.length > 0) {
        const par45 = round.holes.filter(hole => hole.par === 4 || hole.par === 5);
        if (par45.length > 0) {
          const hit = par45.filter(hole => isFairwayHit(hole.fairwayHit)).length;
          const tracked = par45.filter(hole => hole.fairwayHit !== null && hole.fairwayHit !== undefined).length;
          if (tracked > 0) {
            fir.push(Math.round((hit / tracked) * 100));
          }
        }
      } else if (round.stats?.fairways !== undefined && round.stats?.fairwaysPossible) {
        fir.push(Math.round((round.stats.fairways / round.stats.fairwaysPossible) * 100));
      }
    }

    if (isRoundStatEnabled(round, 'gir')) {
      if (round.holes && round.holes.length > 0) {
        const tracked = round.holes.filter(hole => hole.greenHit !== null && hole.greenHit !== undefined);
        if (tracked.length > 0) {
          const hit = tracked.filter(hole => isGreenHit(hole.greenHit)).length;
          gir.push(Math.round((hit / tracked.length) * 100));
        }
      } else if (round.stats?.greens !== undefined && round.stats?.greensPossible) {
        gir.push(Math.round((round.stats.greens / round.stats.greensPossible) * 100));
      }
    }

    if (isRoundStatEnabled(round, 'putts')) {
      const totalPutts = round.stats?.putts;
      if (typeof totalPutts === 'number' && totalPutts > 0) {
        putts.push(totalPutts);
      }
    }
  });

  return { score, fir, gir, putts };
};

const buildSparklineSeries = (allRounds: SavedRound[], limit: number): SparklineSeries => {
  const sorted = [...allRounds].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const putts: number[] = [];
  const penalties: number[] = [];
  const threePuttRate: number[] = [];
  const upDown: number[] = [];
  const fir: number[] = [];
  const gir: number[] = [];

  sorted.forEach(round => {
    if (isRoundStatEnabled(round, 'putts')) {
      const totalPutts = round.stats?.putts;
      if (typeof totalPutts === 'number' && totalPutts > 0) {
        putts.push(totalPutts);
      }
    }

    if (isRoundStatEnabled(round, 'penalties') && typeof round.penalties === 'number') {
      penalties.push(round.penalties);
    }

    if (isRoundStatEnabled(round, 'putts') && round.holes && round.holes.length > 0) {
      const holesWithPutts = round.holes.filter(hole => hole.putts && hole.putts > 0);
      if (holesWithPutts.length > 0) {
        const threePutts = holesWithPutts.filter(hole => hole.putts! >= 3).length;
        threePuttRate.push((threePutts / holesWithPutts.length) * 100);
      }
    }

    if (isRoundStatEnabled(round, 'scrambling')) {
      if (round.stats?.upDownAttempts && round.stats.upDownAttempts > 0) {
        upDown.push((round.stats.upDownMade || 0) / round.stats.upDownAttempts * 100);
      } else if (round.holes) {
        const attempts = round.holes.filter(hole => isGreenMiss(hole.greenHit) && hole.upDown !== null && hole.upDown !== undefined);
        if (attempts.length > 0) {
          const made = attempts.filter(hole => hole.upDown === true).length;
          upDown.push((made / attempts.length) * 100);
        }
      }
    }

    if (isRoundStatEnabled(round, 'fir')) {
      if (round.holes && round.holes.length > 0) {
        const par45 = round.holes.filter(hole => hole.par === 4 || hole.par === 5);
        const tracked = par45.filter(hole => hole.fairwayHit !== null && hole.fairwayHit !== undefined);
        if (tracked.length > 0) {
          const hit = tracked.filter(hole => isFairwayHit(hole.fairwayHit)).length;
          fir.push((hit / tracked.length) * 100);
        }
      } else if (round.stats?.fairwaysPossible) {
        fir.push((round.stats.fairways || 0) / round.stats.fairwaysPossible * 100);
      }
    }

    if (isRoundStatEnabled(round, 'gir')) {
      if (round.holes && round.holes.length > 0) {
        const tracked = round.holes.filter(hole => hole.greenHit !== null && hole.greenHit !== undefined);
        if (tracked.length > 0) {
          const hit = tracked.filter(hole => isGreenHit(hole.greenHit)).length;
          gir.push((hit / tracked.length) * 100);
        }
      } else if (round.stats?.greensPossible) {
        gir.push((round.stats.greens || 0) / round.stats.greensPossible * 100);
      }
    }
  });

  return {
    putts: putts.slice(-limit),
    penalties: penalties.slice(-limit),
    threePuttRate: threePuttRate.slice(-limit),
    upDown: upDown.slice(-limit),
    fir: fir.slice(-limit),
    gir: gir.slice(-limit),
  };
};

const buildFrontBackSplit = (allRounds: SavedRound[]): FrontBackSplit | null => {
  const roundsWithHoles = allRounds.filter(round => round.holes && round.holes.length >= 18);
  if (roundsWithHoles.length < 3) return null;

  let frontScoreTotal = 0;
  let backScoreTotal = 0;
  let frontScoreRounds = 0;
  let backScoreRounds = 0;
  let frontFirHits = 0;
  let frontFirAttempts = 0;
  let backFirHits = 0;
  let backFirAttempts = 0;
  let frontGirHits = 0;
  let frontGirAttempts = 0;
  let backGirHits = 0;
  let backGirAttempts = 0;
  let frontPuttsTotal = 0;
  let backPuttsTotal = 0;
  let frontPuttsRounds = 0;
  let backPuttsRounds = 0;

  roundsWithHoles.forEach(round => {
    const front = round.holes?.filter(hole => hole.number >= 1 && hole.number <= 9 && hole.score) || [];
    const back = round.holes?.filter(hole => hole.number >= 10 && hole.number <= 18 && hole.score) || [];

    if (front.length >= 7) {
      const score = front.reduce((sum, hole) => sum + (hole.score || 0), 0);
      frontScoreTotal += score;
      frontScoreRounds += 1;
      const frontFir = front.filter(hole => (hole.par === 4 || hole.par === 5) && hole.fairwayHit !== null && hole.fairwayHit !== undefined);
      if (frontFir.length > 0) {
        frontFirAttempts += frontFir.length;
        frontFirHits += frontFir.filter(hole => isFairwayHit(hole.fairwayHit)).length;
      }
      const frontGir = front.filter(hole => hole.greenHit !== null && hole.greenHit !== undefined);
      if (frontGir.length > 0) {
        frontGirAttempts += frontGir.length;
        frontGirHits += frontGir.filter(hole => isGreenHit(hole.greenHit)).length;
      }
      const frontPutts = front.filter(hole => hole.putts && hole.putts > 0);
      if (frontPutts.length > 0) {
        frontPuttsTotal += frontPutts.reduce((sum, hole) => sum + (hole.putts || 0), 0);
        frontPuttsRounds += 1;
      }
    }

    if (back.length >= 7) {
      const score = back.reduce((sum, hole) => sum + (hole.score || 0), 0);
      backScoreTotal += score;
      backScoreRounds += 1;
      const backFir = back.filter(hole => (hole.par === 4 || hole.par === 5) && hole.fairwayHit !== null && hole.fairwayHit !== undefined);
      if (backFir.length > 0) {
        backFirAttempts += backFir.length;
        backFirHits += backFir.filter(hole => isFairwayHit(hole.fairwayHit)).length;
      }
      const backGir = back.filter(hole => hole.greenHit !== null && hole.greenHit !== undefined);
      if (backGir.length > 0) {
        backGirAttempts += backGir.length;
        backGirHits += backGir.filter(hole => isGreenHit(hole.greenHit)).length;
      }
      const backPutts = back.filter(hole => hole.putts && hole.putts > 0);
      if (backPutts.length > 0) {
        backPuttsTotal += backPutts.reduce((sum, hole) => sum + (hole.putts || 0), 0);
        backPuttsRounds += 1;
      }
    }
  });

  if (frontScoreRounds < 3 || backScoreRounds < 3) return null;

  const frontScoreAvg = frontScoreTotal / frontScoreRounds;
  const backScoreAvg = backScoreTotal / backScoreRounds;
  const frontFirPercent = frontFirAttempts > 0 ? (frontFirHits / frontFirAttempts) * 100 : null;
  const backFirPercent = backFirAttempts > 0 ? (backFirHits / backFirAttempts) * 100 : null;
  const frontGirPercent = frontGirAttempts > 0 ? (frontGirHits / frontGirAttempts) * 100 : null;
  const backGirPercent = backGirAttempts > 0 ? (backGirHits / backGirAttempts) * 100 : null;
  const frontPuttsAvg = frontPuttsRounds > 0 ? frontPuttsTotal / frontPuttsRounds : null;
  const backPuttsAvg = backPuttsRounds > 0 ? backPuttsTotal / backPuttsRounds : null;

  const diff = backScoreAvg - frontScoreAvg;
  const highlight = diff >= 1 ? 'back' : diff <= -1 ? 'front' : null;
  const message = highlight === 'back'
    ? `You average ${diff.toFixed(1)} strokes higher on the back 9.`
    : highlight === 'front'
      ? `You average ${Math.abs(diff).toFixed(1)} strokes higher on the front 9.`
      : 'Front and back 9 scoring are consistent.';

  return {
    front: {
      scoreAvg: frontScoreAvg,
      firPercent: frontFirPercent,
      girPercent: frontGirPercent,
      puttsAvg: frontPuttsAvg,
    },
    back: {
      scoreAvg: backScoreAvg,
      firPercent: backFirPercent,
      girPercent: backGirPercent,
      puttsAvg: backPuttsAvg,
    },
    highlight,
    message,
    roundCount: Math.min(frontScoreRounds, backScoreRounds),
  };
};

const buildBallStrikingTotals = (allRounds: SavedRound[]): BallStrikingTotals => {
  let fairwaysHit = 0;
  let fairwaysTotal = 0;
  let greensHit = 0;
  let greensTotal = 0;
  let puttsTotal = 0;
  let puttsRounds = 0;
  let upDownMade = 0;
  let upDownAttempts = 0;
  let threePutts = 0;

  allRounds.forEach(round => {
    const allowFir = isRoundStatEnabled(round, 'fir');
    const allowGir = isRoundStatEnabled(round, 'gir');
    const allowPutts = isRoundStatEnabled(round, 'putts');
    const allowScrambling = isRoundStatEnabled(round, 'scrambling');

    if (round.holes && round.holes.length > 0) {
      let roundPutts = 0;
      let hasPutts = false;
      round.holes.forEach(hole => {
        if ((hole.par === 4 || hole.par === 5) && allowFir) {
          if (hole.fairwayHit !== null && hole.fairwayHit !== undefined) {
            fairwaysTotal += 1;
            if (isFairwayHit(hole.fairwayHit)) fairwaysHit += 1;
          }
        }
        if (allowGir && hole.greenHit !== null && hole.greenHit !== undefined) {
          greensTotal += 1;
          if (isGreenHit(hole.greenHit)) greensHit += 1;
        }
        if (allowPutts && hole.putts !== undefined && hole.putts !== null && hole.putts > 0) {
          roundPutts += hole.putts;
          hasPutts = true;
          if (hole.putts >= 3) threePutts += 1;
        }
        if (allowScrambling && isGreenMiss(hole.greenHit) && hole.upDown !== null && hole.upDown !== undefined) {
          upDownAttempts += 1;
          if (hole.upDown === true) upDownMade += 1;
        }
      });
      if (allowPutts && hasPutts) {
        puttsTotal += roundPutts;
        puttsRounds += 1;
      }
      return;
    }

    if (allowFir && round.stats?.fairwaysPossible) {
      fairwaysTotal += round.stats.fairwaysPossible;
      fairwaysHit += round.stats.fairways || 0;
    }
    if (allowGir && round.stats?.greensPossible) {
      greensTotal += round.stats.greensPossible;
      greensHit += round.stats.greens || 0;
    }
    if (allowScrambling && round.stats?.upDownAttempts) {
      upDownAttempts += round.stats.upDownAttempts;
      upDownMade += round.stats.upDownMade || 0;
    }
    if (allowPutts) {
      const statsPutts = (round as { putts?: number }).putts ?? round.stats?.putts;
      if (statsPutts && statsPutts > 0) {
        puttsTotal += statsPutts;
        puttsRounds += 1;
      }
    }
  });

  return {
    fairwaysHit,
    fairwaysTotal,
    greensHit,
    greensTotal,
    puttsTotal,
    puttsRounds,
    upDownMade,
    upDownAttempts,
    threePutts,
  };
};

const buildParStats = (allRounds: SavedRound[]) => {
  const par3: RoundHole[] = [];
  const par4: RoundHole[] = [];
  const par5: RoundHole[] = [];

  allRounds.forEach(round => {
    round.holes?.forEach(hole => {
      if (!hole || hole.score === undefined || hole.par === undefined) return;
      if (hole.par === 3) par3.push(hole);
      if (hole.par === 4) par4.push(hole);
      if (hole.par === 5) par5.push(hole);
    });
  });

  const computeMissPattern = (holes: RoundHole[], type: 'fairway' | 'green'): MissPattern | undefined => {
    const misses = { left: 0, right: 0, long: 0, short: 0, total: 0 };

    holes.forEach(hole => {
      if (type === 'fairway') {
        const dir = hole.fairwayHit;
        if (typeof dir !== 'string') return;
        if (dir === 'left' || dir === 'double-left' || dir === 'right' || dir === 'double-right') {
          misses.total += 1;
          if (dir === 'left' || dir === 'double-left') misses.left += 1;
          if (dir === 'right' || dir === 'double-right') misses.right += 1;
        }
      } else {
        const dir = hole.greenHit;
        if (typeof dir !== 'string') return;
        if (dir === 'left' || dir === 'right' || dir === 'short' || dir === 'long') {
          misses.total += 1;
          if (dir === 'left') misses.left += 1;
          if (dir === 'right') misses.right += 1;
          if (dir === 'short') misses.short += 1;
          if (dir === 'long') misses.long += 1;
        }
      }
    });

    if (misses.total < 3) return undefined;

    const pattern: MissPattern = {
      left: Math.round((misses.left / misses.total) * 100),
      right: Math.round((misses.right / misses.total) * 100),
      totalMisses: misses.total,
    };

    if (type === 'green') {
      pattern.long = Math.round((misses.long / misses.total) * 100);
      pattern.short = Math.round((misses.short / misses.total) * 100);
    }

    return pattern;
  };

  const compute = (holes: RoundHole[], par: number): ParStats => {
    if (holes.length === 0) {
      return {
        averageScore: 0,
        scoreToPar: 0,
        girPercent: undefined,
        firPercent: undefined,
        upDownPercent: undefined,
        averagePutts: null,
        holesPlayed: 0,
      };
    }

    const totalScore = holes.reduce((sum, h) => sum + (h.score || 0), 0);
    const averageScore = totalScore / holes.length;
    const scoreToPar = averageScore - par;

    const holesWithGIR = holes.filter(h => h.greenHit !== undefined && h.greenHit !== null);
    const girPercent = holesWithGIR.length > 0
      ? Math.round((holesWithGIR.filter(h => isGreenHit(h.greenHit)).length / holesWithGIR.length) * 100)
      : undefined;

    let firPercent: number | undefined = undefined;
    if (par !== 3) {
      const holesWithFIR = holes.filter(h => h.fairwayHit !== undefined && h.fairwayHit !== null);
      firPercent = holesWithFIR.length > 0
        ? Math.round((holesWithFIR.filter(h => isFairwayHit(h.fairwayHit)).length / holesWithFIR.length) * 100)
        : undefined;
    }

    const missedGreens = holes.filter(h => isGreenMiss(h.greenHit) && h.upDown !== null && h.upDown !== undefined);
    const upDownPercent = missedGreens.length > 0
      ? Math.round((missedGreens.filter(h => h.upDown === true).length / missedGreens.length) * 100)
      : undefined;

    const puttValues = holes.map(h => h.putts || 0).filter(v => v > 0);
    const averagePutts = puttValues.length > 0
      ? puttValues.reduce((sum, v) => sum + v, 0) / puttValues.length
      : null;

    const fairwayMissPattern = par !== 3 ? computeMissPattern(holes, 'fairway') : undefined;
    const greenMissPattern = computeMissPattern(holes, 'green');

    return {
      averageScore,
      scoreToPar,
      girPercent,
      firPercent,
      upDownPercent,
      averagePutts,
      holesPlayed: holes.length,
      fairwayMissPattern,
      greenMissPattern,
    };
  };

  return {
    par3: compute(par3, 3),
    par4: compute(par4, 4),
    par5: compute(par5, 5),
  };
};
