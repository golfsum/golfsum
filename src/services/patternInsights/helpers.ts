import { PatternInsightType, StrengthLevel } from './typesEnums';
import { IMPACT_SCORES, STROKE_IMPACT_PER_EVENT } from './constants';
import { SavedRound } from '../../types';
import { InsightProgress } from './types';

export const getPerEventImpact = (type: PatternInsightType): number => {
  return STROKE_IMPACT_PER_EVENT[type] || 0.1;
};

export const getBenchmark = (handicap: number | undefined, benchmarks: Record<number, number>): number => {
  if (handicap === undefined) return benchmarks[11];
  if (handicap <= 5) return benchmarks[0];
  if (handicap <= 10) return benchmarks[6];
  if (handicap <= 15) return benchmarks[11];
  if (handicap <= 20) return benchmarks[16];
  return benchmarks[21];
};

const DIFFICULTY_BY_TYPE: Record<PatternInsightType, 1 | 2 | 3> = {
  [PatternInsightType.PENALTIES_HURTING_SCORES]: 1,
  [PatternInsightType.HIGH_THREE_PUTT]: 2,
  [PatternInsightType.LOW_SHORT_PUTT_MAKE_RATE]: 2,
  [PatternInsightType.FAIRWAYS_MISSED_LEFT]: 2,
  [PatternInsightType.FAIRWAYS_MISSED_RIGHT]: 2,
  [PatternInsightType.WIND_FAIRWAY_ACCURACY_DROP]: 1,
  [PatternInsightType.APPROACHES_MISSED_SHORT]: 2,
  [PatternInsightType.APPROACHES_MISSED_LONG]: 2,
  [PatternInsightType.GREENS_MISSED_LEFT]: 2,
  [PatternInsightType.GREENS_MISSED_RIGHT]: 2,
  [PatternInsightType.LOW_UP_DOWN_RATE]: 2,
  [PatternInsightType.POOR_BUNKER_SAVES]: 2,
  [PatternInsightType.WEAK_PAR3_SCORING]: 2,
  [PatternInsightType.POOR_PAR5_SCORING]: 2,
  [PatternInsightType.APPROACH_DISTANCE_WEAKNESS]: 2,
  [PatternInsightType.BACK_NINE_SCORING_DROP]: 2,
  [PatternInsightType.PAR4_SCORING_STRUGGLE]: 2,
  [PatternInsightType.HIGH_BOGEY_CONVERSION]: 1,
  [PatternInsightType.FRONT_NINE_BLOWUP]: 1,
  [PatternInsightType.WEATHER_SCORING_DROP]: 1,
  [PatternInsightType.APPROACH_CONTACT_INCONSISTENCY]: 2,
  [PatternInsightType.BETWEEN_CLUBS_HESITATION]: 2,
};

export const getDifficulty = (type: PatternInsightType): 1 | 2 | 3 => {
  return DIFFICULTY_BY_TYPE[type] ?? 2;
};

export const estimateStrokesPerRound = (
  eventCount: number,
  roundsCount: number,
  perEventCost: number
): number => {
  if (roundsCount === 0) return 0;
  return Math.round((eventCount / roundsCount) * perEventCost * 10) / 10;
};

export const getImpactScore = (type: PatternInsightType): number => {
  return IMPACT_SCORES[type] || 0.5;
};

export const calculateStars = (confidence: number): number => {
  if (confidence >= 90) return 5;
  if (confidence >= 75) return 4;
  if (confidence >= 60) return 3;
  if (confidence >= 45) return 2;
  return 1;
};

export const getConfidenceLabel = (stars: number): string => {
  if (stars >= 5) return 'Strong Trend';
  if (stars >= 4) return 'Reliable Trend';
  if (stars >= 3) return 'Emerging Trend';
  if (stars >= 2) return 'Early Signal';
  return 'Limited Data';
};

export const clamp = (value: number, min: number = 0, max: number = 1): number => {
  return Math.max(min, Math.min(max, value));
};

export const calculateConsistency = <TRound>(
  rounds: TRound[],
  condition: (round: TRound) => boolean
): number => {
  if (rounds.length === 0) return 0;
  const matchingRounds = rounds.filter(condition).length;
  return matchingRounds / rounds.length;
};

export const calculateConfidenceScore = (
  sampleSize: number,
  minSample: number,
  dominantRate: number,
  minDominantRate: number,
  consistency: number
): { confidence: number; sampleScore: number; patternScore: number; consistencyScore: number } => {
  const sampleScore = clamp((sampleSize - minSample) / (minSample * 2));
  const patternScore = clamp((dominantRate - minDominantRate) / (1 - minDominantRate));
  const consistencyScore = clamp(consistency);

  const confidence = Math.round(
    (sampleScore * 0.4 + patternScore * 0.4 + consistencyScore * 0.2) * 100
  );

  return { confidence, sampleScore, patternScore, consistencyScore };
};

export const getStrengthLevel = (
  dominantRate: number,
  thresholds: { MODERATE: number; STRONG: number; VERY_STRONG: number }
): StrengthLevel => {
  if (dominantRate >= thresholds.VERY_STRONG) return StrengthLevel.VERY_STRONG;
  if (dominantRate >= thresholds.STRONG) return StrengthLevel.STRONG;
  return StrengthLevel.MODERATE;
};

export const calculateFrequencyScore = (observedEvents: number, totalOpportunities: number): number => {
  if (totalOpportunities === 0) return 0;
  return observedEvents / totalOpportunities;
};

export const inferStartLine = (
  missDirection: 'left' | 'right',
  totalMisses: number,
  dominantRate: number
): string => {
  if (totalMisses < 5) return 'Insufficient data for start line inference';

  if (missDirection === 'right') {
    return dominantRate > 0.7
      ? 'Ball likely starting right and curving further right'
      : 'Ball likely starting near target then curving right';
  }

  return dominantRate > 0.7
    ? 'Ball likely starting left and curving further left'
    : 'Ball likely starting near target then curving left';
};

export const calculatePriorityScore = (
  impactScore: number,
  confidenceScore: number,
  frequencyScore: number
): number => {
  const priority =
    (impactScore * 0.45) +
    (confidenceScore * 0.35) +
    (frequencyScore * 0.20);

  return Math.round(priority * 100);
};

const average = (values: number[]): number => {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const sum = (values: number[]): number => values.reduce((acc, value) => acc + value, 0);

const roundTime = (round: SavedRound): number => {
  const ts = new Date(round.date as unknown as string).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

const getDirectionRate = (
  round: SavedRound,
  group: 'fairway' | 'green',
  direction: 'left' | 'right' | 'short' | 'long'
): number | null => {
  const holes = round.holes ?? [];
  if (!holes.length) return null;
  if (group === 'fairway') {
    const misses = holes.filter(h => h.par >= 4 && (h.fairwayHit === 'left' || h.fairwayHit === 'right'));
    if (!misses.length) return null;
    return misses.filter(h => h.fairwayHit === direction).length / misses.length;
  }
  const misses = holes.filter(h => h.greenHit !== undefined && h.greenHit !== null && h.greenHit !== true);
  if (!misses.length) return null;
  const directional = misses.filter(h => ['left', 'right', 'short', 'long'].includes(String(h.greenHit)));
  if (!directional.length) return null;
  return directional.filter(h => h.greenHit === direction).length / directional.length;
};

const getParScoringToPar = (round: SavedRound, par: number): number | null => {
  const holes = (round.holes ?? []).filter(h => h.par === par);
  if (!holes.length) return null;
  return average(holes.map(h => h.score - h.par));
};

const getBogeyChainRate = (round: SavedRound): number | null => {
  const holes = [...(round.holes ?? [])].sort((a, b) => a.number - b.number);
  if (holes.length < 2) return null;
  let bogeys = 0;
  let chains = 0;
  for (let i = 0; i < holes.length; i += 1) {
    if (holes[i].score >= holes[i].par + 1) {
      bogeys += 1;
      const next = holes[i + 1];
      if (next && next.score >= next.par + 1) chains += 1;
    }
  }
  if (!bogeys) return null;
  return chains / bogeys;
};

const getFrontBackDiff = (round: SavedRound, mode: 'back_minus_front' | 'front_minus_back'): number | null => {
  const holes = round.holes ?? [];
  if (holes.length < 18) return null;
  const front = holes.filter(h => h.number <= 9);
  const back = holes.filter(h => h.number > 9);
  if (front.length < 8 || back.length < 8) return null;
  const frontToPar = sum(front.map(h => h.score - h.par));
  const backToPar = sum(back.map(h => h.score - h.par));
  return mode === 'back_minus_front' ? backToPar - frontToPar : frontToPar - backToPar;
};

const parseWindMph = (text?: string): number | null => {
  if (!text) return null;
  const m = String(text).match(/(\d+(\.\d+)?)/);
  if (!m) return null;
  const value = Number(m[1]);
  return Number.isFinite(value) ? value : null;
};

const isWindy = (round: SavedRound): boolean | null => {
  const weather = round.weather || round.weatherFront9 || round.weatherBack9;
  if (!weather) return null;
  const dir = String(weather.windDirection || '').toLowerCase();
  if (dir && dir !== 'calm') return true;
  const speed = parseWindMph(weather.wind);
  if (speed != null) return speed >= 10;
  if (dir === 'calm') return false;
  return null;
};

const formatPercent = (value: number): string => `${Math.round(value * 100)}%`;

const buildProgress = (params: {
  lastValue: number | null;
  baselineValue: number;
  lowerIsBetter: boolean;
  deltaUnitLabel: (deltaAbs: number) => string;
  baselineLabel: string;
  lastRoundLabel: string;
  improvedMessage: (deltaAbs: number) => string;
  regressedMessage: () => string;
  unchangedMessage: () => string;
}): InsightProgress => {
  if (params.lastValue == null || !Number.isFinite(params.lastValue)) {
    return {
      status: 'INSUFFICIENT_DATA',
      delta: 0,
      deltaLabel: '',
      message: 'Not enough tracked stats in the last round to measure progress.',
      emoji: '→',
      baselineLabel: '',
      lastRoundLabel: '',
    };
  }

  const delta = params.lastValue - params.baselineValue;
  const baselineMagnitude = Math.max(Math.abs(params.baselineValue), 0.0001);
  const unchangedWindow = baselineMagnitude * 0.05;
  const deltaAbs = Math.abs(delta);

  let status: InsightProgress['status'] = 'UNCHANGED';
  if (deltaAbs <= unchangedWindow) status = 'UNCHANGED';
  else if (params.lowerIsBetter ? delta < 0 : delta > 0) status = 'IMPROVED';
  else status = 'REGRESSED';

  const message =
    status === 'IMPROVED'
      ? params.improvedMessage(deltaAbs)
      : status === 'REGRESSED'
      ? params.regressedMessage()
      : params.unchangedMessage();

  return {
    status,
    delta,
    deltaLabel: params.deltaUnitLabel(deltaAbs),
    message,
    emoji: status === 'IMPROVED' ? '✓' : status === 'REGRESSED' ? '↑' : '→',
    baselineLabel: params.baselineLabel,
    lastRoundLabel: params.lastRoundLabel,
  };
};

const getMetricForRound = (type: PatternInsightType, round: SavedRound): number | null => {
  switch (type) {
    case PatternInsightType.HIGH_THREE_PUTT:
      return (round.holes ?? []).filter(h => (h.putts ?? 0) >= 3).length;
    case PatternInsightType.PENALTIES_HURTING_SCORES:
      return typeof round.penalties === 'number' ? round.penalties : null;
    case PatternInsightType.WEAK_PAR3_SCORING:
      return getParScoringToPar(round, 3);
    case PatternInsightType.PAR4_SCORING_STRUGGLE:
      return getParScoringToPar(round, 4);
    case PatternInsightType.POOR_PAR5_SCORING:
      return getParScoringToPar(round, 5);
    case PatternInsightType.LOW_UP_DOWN_RATE: {
      const attempts = round.stats?.upDownAttempts ?? 0;
      const made = round.stats?.upDownMade ?? 0;
      if (attempts <= 0) return null;
      return 1 - made / attempts; // lower is better
    }
    default:
      return null;
  }
};

const getImprovementStreak = (type: PatternInsightType, rounds: SavedRound[]): number => {
  const supported = new Set<PatternInsightType>([
    PatternInsightType.HIGH_THREE_PUTT,
    PatternInsightType.PENALTIES_HURTING_SCORES,
    PatternInsightType.WEAK_PAR3_SCORING,
    PatternInsightType.PAR4_SCORING_STRUGGLE,
    PatternInsightType.POOR_PAR5_SCORING,
    PatternInsightType.LOW_UP_DOWN_RATE,
  ]);
  if (!supported.has(type)) return 0;
  const sorted = [...rounds].sort((a, b) => roundTime(b) - roundTime(a));
  let streak = 0;
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const curr = getMetricForRound(type, sorted[i]);
    const prev = getMetricForRound(type, sorted[i + 1]);
    if (curr == null || prev == null) break;
    if (curr < prev) streak += 1;
    else break;
  }
  return streak;
};

const getProgressForType = (
  type: PatternInsightType,
  lastRound: SavedRound,
  priorRounds: SavedRound[],
  allRounds: SavedRound[]
): InsightProgress | undefined => {
  switch (type) {
    case PatternInsightType.HIGH_THREE_PUTT: {
      const last = (lastRound.holes ?? []).filter(h => (h.putts ?? 0) >= 3).length;
      const baselineSamples = priorRounds
        .map(r => (r.holes ?? []).some(h => h.putts != null) ? (r.holes ?? []).filter(h => (h.putts ?? 0) >= 3).length : null)
        .filter((v): v is number => v != null);
      if (!baselineSamples.length) return undefined;
      const baseline = average(baselineSamples);
      const progress = buildProgress({
        lastValue: last,
        baselineValue: baseline,
        lowerIsBetter: true,
        deltaUnitLabel: d => `${d.toFixed(1)} fewer three-putts`,
        baselineLabel: `${baseline.toFixed(1)} avg over last ${baselineSamples.length} rounds`,
        lastRoundLabel: `${last} three-putts last round`,
        improvedMessage: d => `Three-putt count dropped to ${last} last round - down ${d.toFixed(1)} from baseline.`,
        regressedMessage: () => `Three-putts increased last round (${last} vs ${baseline.toFixed(1)} baseline). Focus lag speed.`,
        unchangedMessage: () => 'Three-putt rate holding steady. Keep working on lag distance.',
      });
      const streak = getImprovementStreak(type, allRounds);
      if (progress.status === 'IMPROVED' && streak >= 3) {
        progress.message = `${streak} rounds of improvement on this - keep going.`;
        progress.emoji = '🔥';
      }
      return progress;
    }
    case PatternInsightType.PENALTIES_HURTING_SCORES: {
      const last = typeof lastRound.penalties === 'number' ? lastRound.penalties : null;
      const samples = priorRounds.map(r => r.penalties ?? null).filter((v): v is number => v != null);
      if (!samples.length) return undefined;
      const baseline = average(samples);
      const progress = buildProgress({
        lastValue: last,
        baselineValue: baseline,
        lowerIsBetter: true,
        deltaUnitLabel: d => `${d.toFixed(1)} fewer penalties`,
        baselineLabel: `${baseline.toFixed(1)} penalties avg`,
        lastRoundLabel: `${last ?? 0} penalties last round`,
        improvedMessage: d => `Penalty count dropped last round - ${d.toFixed(1)} fewer than baseline.`,
        regressedMessage: () => 'Penalties were up last round. Stay conservative off the tee.',
        unchangedMessage: () => 'Penalty count steady. Conservative targets can lower this.',
      });
      const streak = getImprovementStreak(type, allRounds);
      if (progress.status === 'IMPROVED' && streak >= 3) {
        progress.message = `${streak} rounds of improvement on this - keep going.`;
        progress.emoji = '🔥';
      }
      return progress;
    }
    case PatternInsightType.FAIRWAYS_MISSED_RIGHT:
    case PatternInsightType.FAIRWAYS_MISSED_LEFT: {
      const direction = type === PatternInsightType.FAIRWAYS_MISSED_RIGHT ? 'right' : 'left';
      const last = getDirectionRate(lastRound, 'fairway', direction);
      const samples = priorRounds.map(r => getDirectionRate(r, 'fairway', direction)).filter((v): v is number => v != null);
      if (!samples.length) return undefined;
      const baseline = average(samples);
      return buildProgress({
        lastValue: last,
        baselineValue: baseline,
        lowerIsBetter: true,
        deltaUnitLabel: d => `${formatPercent(d)} fewer ${direction} misses`,
        baselineLabel: `${formatPercent(baseline)} ${direction} miss share baseline`,
        lastRoundLabel: `${last != null ? formatPercent(last) : '—'} ${direction} miss share`,
        improvedMessage: () => `Miss direction stabilized - fewer ${direction} misses last round.`,
        regressedMessage: () => `${direction[0].toUpperCase()}${direction.slice(1)} misses increased last round. Focus start line.`,
        unchangedMessage: () => 'Miss trend is holding. Plan around it.',
      });
    }
    case PatternInsightType.APPROACHES_MISSED_SHORT:
    case PatternInsightType.APPROACHES_MISSED_LONG: {
      const direction = type === PatternInsightType.APPROACHES_MISSED_SHORT ? 'short' : 'long';
      const last = getDirectionRate(lastRound, 'green', direction);
      const samples = priorRounds.map(r => getDirectionRate(r, 'green', direction)).filter((v): v is number => v != null);
      if (!samples.length) return undefined;
      const baseline = average(samples);
      return buildProgress({
        lastValue: last,
        baselineValue: baseline,
        lowerIsBetter: true,
        deltaUnitLabel: d => `${formatPercent(d)} fewer ${direction} misses`,
        baselineLabel: `${formatPercent(baseline)} ${direction} miss share baseline`,
        lastRoundLabel: `${last != null ? formatPercent(last) : '—'} ${direction} miss share`,
        improvedMessage: () => direction === 'short'
          ? 'Club selection looked better last round - fewer short approach misses.'
          : 'Long approach misses dropped last round.',
        regressedMessage: () => direction === 'short'
          ? 'Short misses were up last round. Take one more club and commit.'
          : 'Long misses increased last round. Favor center-green and controlled tempo.',
        unchangedMessage: () => direction === 'short'
          ? 'Short miss is holding. Keep checking carry yardages.'
          : 'Long miss is holding. Keep tempo and target discipline.',
      });
    }
    case PatternInsightType.GREENS_MISSED_LEFT:
    case PatternInsightType.GREENS_MISSED_RIGHT: {
      const direction = type === PatternInsightType.GREENS_MISSED_RIGHT ? 'right' : 'left';
      const last = getDirectionRate(lastRound, 'green', direction);
      const samples = priorRounds.map(r => getDirectionRate(r, 'green', direction)).filter((v): v is number => v != null);
      if (!samples.length) return undefined;
      const baseline = average(samples);
      return buildProgress({
        lastValue: last,
        baselineValue: baseline,
        lowerIsBetter: true,
        deltaUnitLabel: d => `${formatPercent(d)} fewer ${direction} misses`,
        baselineLabel: `${formatPercent(baseline)} ${direction} miss share baseline`,
        lastRoundLabel: `${last != null ? formatPercent(last) : '—'} ${direction} miss share`,
        improvedMessage: () => `Approach direction improved - fewer ${direction} misses last round.`,
        regressedMessage: () => `Missed more ${direction} last round. Aim center-green.`,
        unchangedMessage: () => 'Direction is holding steady. Plan around it.',
      });
    }
    case PatternInsightType.LOW_SHORT_PUTT_MAKE_RATE: {
      const toPuttsPerGir = (round: SavedRound): number | null => {
        const holes = (round.holes ?? []).filter(h => h.greenHit === true && h.putts != null);
        if (!holes.length) return null;
        return average(holes.map(h => h.putts as number));
      };
      const last = toPuttsPerGir(lastRound);
      const samples = priorRounds.map(toPuttsPerGir).filter((v): v is number => v != null);
      if (!samples.length) return undefined;
      const baseline = average(samples);
      return buildProgress({
        lastValue: last,
        baselineValue: baseline,
        lowerIsBetter: true,
        deltaUnitLabel: d => `${d.toFixed(2)} fewer putts per GIR`,
        baselineLabel: `${baseline.toFixed(2)} putts/GIR baseline`,
        lastRoundLabel: `${last != null ? last.toFixed(2) : '—'} putts/GIR last round`,
        improvedMessage: () => `Putting on greens improved - ${last?.toFixed(2)} putts per GIR vs ${baseline.toFixed(2)} baseline.`,
        regressedMessage: () => 'More putts on greens hit last round. Check short-putt routine.',
        unchangedMessage: () => 'Short-putt conversion holding. Keep stroke routine consistent.',
      });
    }
    case PatternInsightType.LOW_UP_DOWN_RATE: {
      const metric = (round: SavedRound): number | null => {
        const attempts = round.stats?.upDownAttempts ?? 0;
        const made = round.stats?.upDownMade ?? 0;
        if (attempts <= 0) return null;
        return made / attempts;
      };
      const lastRate = metric(lastRound);
      const samples = priorRounds.map(metric).filter((v): v is number => v != null);
      if (!samples.length) return undefined;
      const baseline = average(samples);
      const progress = buildProgress({
        lastValue: lastRate,
        baselineValue: baseline,
        lowerIsBetter: false,
        deltaUnitLabel: d => `${formatPercent(d)} change in up/down rate`,
        baselineLabel: `${formatPercent(baseline)} baseline up/down rate`,
        lastRoundLabel: `${lastRate != null ? formatPercent(lastRate) : '—'} last round`,
        improvedMessage: () => `Up-and-down rate improved to ${lastRate != null ? formatPercent(lastRate) : '—'} vs ${formatPercent(baseline)} baseline.`,
        regressedMessage: () => 'Scrambling dropped last round. Focus on getting chips closer.',
        unchangedMessage: () => 'Up/down rate steady. Keep short-game routine simple.',
      });
      const streak = getImprovementStreak(type, allRounds);
      if (progress.status === 'IMPROVED' && streak >= 3) {
        progress.message = `${streak} rounds of improvement on this - keep going.`;
        progress.emoji = '🔥';
      }
      return progress;
    }
    case PatternInsightType.POOR_BUNKER_SAVES: {
      const metric = (round: SavedRound): number | null => {
        const bunker = (round.holes ?? []).filter(h => h.fairwayBunker || h.greenSideBunker);
        const nonBunker = (round.holes ?? []).filter(h => !h.fairwayBunker && !h.greenSideBunker);
        if (!bunker.length || !nonBunker.length) return null;
        const bunkerAvg = average(bunker.map(h => h.score - h.par));
        const nonBunkerAvg = average(nonBunker.map(h => h.score - h.par));
        return bunkerAvg - nonBunkerAvg;
      };
      const last = metric(lastRound);
      const samples = priorRounds.map(metric).filter((v): v is number => v != null);
      if (!samples.length) return undefined;
      const baseline = average(samples);
      return buildProgress({
        lastValue: last,
        baselineValue: baseline,
        lowerIsBetter: true,
        deltaUnitLabel: d => `${d.toFixed(2)} strokes per bunker-hole delta`,
        baselineLabel: `${baseline.toFixed(2)} baseline bunker-hole penalty`,
        lastRoundLabel: `${last != null ? last.toFixed(2) : '—'} bunker-hole penalty`,
        improvedMessage: () => 'Bunker holes were closer to normal scoring last round.',
        regressedMessage: () => 'Bunker holes cost more strokes last round. Focus on clean exits.',
        unchangedMessage: () => 'Bunker performance holding steady.',
      });
    }
    case PatternInsightType.WEAK_PAR3_SCORING:
    case PatternInsightType.PAR4_SCORING_STRUGGLE:
    case PatternInsightType.POOR_PAR5_SCORING: {
      const par = type === PatternInsightType.WEAK_PAR3_SCORING ? 3 : type === PatternInsightType.PAR4_SCORING_STRUGGLE ? 4 : 5;
      const label = `par ${par}`;
      const last = getParScoringToPar(lastRound, par);
      const samples = priorRounds.map(r => getParScoringToPar(r, par)).filter((v): v is number => v != null);
      if (!samples.length) return undefined;
      const baseline = average(samples);
      const progress = buildProgress({
        lastValue: last,
        baselineValue: baseline,
        lowerIsBetter: true,
        deltaUnitLabel: d => `${d.toFixed(2)} strokes vs ${label} baseline`,
        baselineLabel: `${baseline.toFixed(2)} vs par baseline on ${label}s`,
        lastRoundLabel: `${last != null ? last.toFixed(2) : '—'} vs par last round`,
        improvedMessage: () =>
          type === PatternInsightType.WEAK_PAR3_SCORING
            ? 'Par 3 scoring improved last round - better club commitment showed.'
            : type === PatternInsightType.PAR4_SCORING_STRUGGLE
            ? 'Par 4 scoring improved last round - decisions and approaches were cleaner.'
            : 'Par 5 scoring improved last round - better conversion on scoring holes.',
        regressedMessage: () =>
          type === PatternInsightType.WEAK_PAR3_SCORING
            ? 'Par 3s cost more last round. Commit to club selection.'
            : type === PatternInsightType.PAR4_SCORING_STRUGGLE
            ? 'Par 4s were expensive last round. Target center-green.'
            : 'Par 5s slipped last round. Play smarter off the tee.',
        unchangedMessage: () =>
          type === PatternInsightType.WEAK_PAR3_SCORING
            ? 'Par 3 scoring holding steady. Opportunity remains.'
            : type === PatternInsightType.PAR4_SCORING_STRUGGLE
            ? 'Par 4 scoring steady. Keep committing to targets.'
            : 'Par 5 scoring steady. Keep layup windows consistent.',
      });
      const streak = getImprovementStreak(type, allRounds);
      if (progress.status === 'IMPROVED' && streak >= 3) {
        progress.message = `${streak} rounds of improvement on this - keep going.`;
        progress.emoji = '🔥';
      }
      return progress;
    }
    case PatternInsightType.HIGH_BOGEY_CONVERSION: {
      const last = getBogeyChainRate(lastRound);
      const samples = priorRounds.map(getBogeyChainRate).filter((v): v is number => v != null);
      if (!samples.length) return undefined;
      const baseline = average(samples);
      return buildProgress({
        lastValue: last,
        baselineValue: baseline,
        lowerIsBetter: true,
        deltaUnitLabel: d => `${formatPercent(d)} bogey-chain change`,
        baselineLabel: `${formatPercent(baseline)} bogey-chain baseline`,
        lastRoundLabel: `${last != null ? formatPercent(last) : '—'} bogey-chain last round`,
        improvedMessage: () => 'Reset after bogeys improved last round - fewer chains.',
        regressedMessage: () => 'Bogey chains increased. Use a stronger reset routine after each hole.',
        unchangedMessage: () => 'Bogey conversion rate steady. Reset reps will help over time.',
      });
    }
    case PatternInsightType.BACK_NINE_SCORING_DROP: {
      const last = getFrontBackDiff(lastRound, 'back_minus_front');
      const samples = priorRounds.map(r => getFrontBackDiff(r, 'back_minus_front')).filter((v): v is number => v != null);
      if (!samples.length) return undefined;
      const baseline = average(samples);
      return buildProgress({
        lastValue: last,
        baselineValue: baseline,
        lowerIsBetter: true,
        deltaUnitLabel: d => `${d.toFixed(2)} strokes front/back gap change`,
        baselineLabel: `${baseline.toFixed(2)} back-minus-front baseline`,
        lastRoundLabel: `${last != null ? last.toFixed(2) : '—'} back-minus-front last round`,
        improvedMessage: () => 'Back-nine drop improved last round - front/back gap is closing.',
        regressedMessage: () => 'Back nine fell off again. Keep routine discipline after the turn.',
        unchangedMessage: () => 'Front/back gap holding steady. Consistent pacing should help.',
      });
    }
    case PatternInsightType.FRONT_NINE_BLOWUP: {
      const last = getFrontBackDiff(lastRound, 'front_minus_back');
      const samples = priorRounds.map(r => getFrontBackDiff(r, 'front_minus_back')).filter((v): v is number => v != null);
      if (!samples.length) return undefined;
      const baseline = average(samples);
      return buildProgress({
        lastValue: last,
        baselineValue: baseline,
        lowerIsBetter: true,
        deltaUnitLabel: d => `${d.toFixed(2)} strokes front-nine gap change`,
        baselineLabel: `${baseline.toFixed(2)} front-minus-back baseline`,
        lastRoundLabel: `${last != null ? last.toFixed(2) : '—'} front-minus-back last round`,
        improvedMessage: () => 'Start improved last round - front-nine gap is shrinking.',
        regressedMessage: () => 'Front nine struggled again. Build a pre-round warm-up routine.',
        unchangedMessage: () => 'Slow start is holding. Warm up before hole 1.',
      });
    }
    case PatternInsightType.APPROACH_DISTANCE_WEAKNESS: {
      const priorHoles = priorRounds.flatMap(r => r.holes ?? []).filter(h => h.approachDistance && h.greenHit != null);
      if (!priorHoles.length) return undefined;
      const byBand = priorHoles.reduce<Record<string, { total: number; gir: number }>>((acc, h) => {
        const key = String(h.approachDistance);
        if (!acc[key]) acc[key] = { total: 0, gir: 0 };
        acc[key].total += 1;
        if (h.greenHit === true) acc[key].gir += 1;
        return acc;
      }, {});
      const weakest = Object.entries(byBand)
        .filter(([, value]) => value.total >= 3)
        .map(([band, value]) => ({ band, rate: value.gir / value.total }))
        .sort((a, b) => a.rate - b.rate)[0];
      if (!weakest) return undefined;
      const metricForRound = (round: SavedRound): number | null => {
        const holes = (round.holes ?? []).filter(h => String(h.approachDistance || '') === weakest.band && h.greenHit != null);
        if (!holes.length) return null;
        return holes.filter(h => h.greenHit === true).length / holes.length;
      };
      const last = metricForRound(lastRound);
      const samples = priorRounds.map(metricForRound).filter((v): v is number => v != null);
      if (!samples.length) return undefined;
      const baseline = average(samples);
      return buildProgress({
        lastValue: last,
        baselineValue: baseline,
        lowerIsBetter: false,
        deltaUnitLabel: d => `${formatPercent(d)} GIR change in ${weakest.band}`,
        baselineLabel: `${formatPercent(baseline)} GIR baseline in ${weakest.band}`,
        lastRoundLabel: `${last != null ? formatPercent(last) : '—'} GIR in ${weakest.band}`,
        improvedMessage: () => `Better from ${weakest.band} last round. Club commitment is helping.`,
        regressedMessage: () => `Still struggling from ${weakest.band}. Extra club can help.`,
        unchangedMessage: () => `Distance zone holding steady at ${weakest.band}. Keep center-green targets.`,
      });
    }
    case PatternInsightType.WEATHER_SCORING_DROP: {
      const weatherLast = isWindy(lastRound);
      if (weatherLast == null) {
        return {
          status: 'INSUFFICIENT_DATA',
          delta: 0,
          deltaLabel: '',
          message: 'No weather tag on the last round, so progress cannot be measured.',
          emoji: '→',
          baselineLabel: '',
          lastRoundLabel: '',
        };
      }
      const baselinePool = priorRounds.filter(r => isWindy(r) === weatherLast);
      const samples = baselinePool.map(r => r.score).filter(v => Number.isFinite(v));
      if (!samples.length) return undefined;
      const baseline = average(samples);
      return buildProgress({
        lastValue: lastRound.score,
        baselineValue: baseline,
        lowerIsBetter: true,
        deltaUnitLabel: d => `${d.toFixed(1)} strokes vs condition baseline`,
        baselineLabel: `${baseline.toFixed(1)} avg in ${weatherLast ? 'windy' : 'calm'} rounds`,
        lastRoundLabel: `${lastRound.score} in last ${weatherLast ? 'windy' : 'calm'} round`,
        improvedMessage: () => 'Score held up better in those conditions last round. Wind management is improving.',
        regressedMessage: () => 'Conditions hurt scoring again. Take more club and swing easier.',
        unchangedMessage: () => 'Weather impact holding steady. Keep knockdown and center-line strategy.',
      });
    }
    default:
      return undefined;
  }
};

export const calculateInsightProgress = (
  type: PatternInsightType,
  rounds: SavedRound[],
  userHandicap?: number
): InsightProgress | undefined => {
  void userHandicap;
  if (rounds.length < 2) return undefined;
  const sorted = [...rounds].sort((a, b) => roundTime(b) - roundTime(a));
  const lastRound = sorted[0];
  const priorRounds = sorted.slice(1);
  if (priorRounds.length < 3) {
    return {
      status: 'INSUFFICIENT_DATA',
      delta: 0,
      deltaLabel: '',
      message: 'Not enough rounds yet to track progress.',
      emoji: '→',
      baselineLabel: '',
      lastRoundLabel: '',
    };
  }
  return getProgressForType(type, lastRound, priorRounds, sorted);
};
