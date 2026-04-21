import { SavedRound } from '../types';

export interface TimeOfDayFinding {
  message: string;
  actionable: string;
  nudgeMessage: string;
}

export interface TimeOfDayAnalysis {
  morningRounds: number;
  afternoonRounds: number;
  twilightRounds: number;
  morningAvg: number | null;
  afternoonAvg: number | null;
  twilightAvg: number | null;
  scoreDiff: number | null;
  significantDiff: boolean;
  timeOfDayEffect: 'MORNING_BETTER' | 'AFTERNOON_BETTER' | 'NEGLIGIBLE' | 'INSUFFICIENT_DATA';
  finding: TimeOfDayFinding | null;
}

export interface ConditionsFinding {
  dominantCondition: string;
  deltaStrokes: number;
  direction: 'WORSE_IN' | 'BETTER_IN';
  description: string;
  nudgeMessage: string;
  confidenceNote: string;
}

function parseTemp(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const parsed = parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function getRoundHour(round: SavedRound): number | null {
  const date = round.date instanceof Date ? round.date : new Date(round.date);
  if (Number.isNaN(date.getTime())) return null;
  return date.getHours();
}

function getTimeOfDayCategory(hour: number): 'MORNING' | 'AFTERNOON' | 'TWILIGHT' {
  if (hour >= 16) return 'TWILIGHT';
  if (hour >= 11) return 'AFTERNOON';
  return 'MORNING';
}

function averageScore(rounds: SavedRound[]): number | null {
  if (rounds.length < 2) return null;
  return rounds.reduce((sum, round) => sum + round.score, 0) / rounds.length;
}

function buildTimeOfDayFinding(
  effect: TimeOfDayAnalysis['timeOfDayEffect'],
  scoreDiff: number | null,
  morningAvg: number | null,
  afternoonAvg: number | null
): TimeOfDayFinding | null {
  if (effect === 'NEGLIGIBLE' || effect === 'INSUFFICIENT_DATA' || scoreDiff == null) return null;
  const absDiff = Math.abs(scoreDiff).toFixed(1);
  if (effect === 'MORNING_BETTER') {
    return {
      message: `Morning rounds average ${morningAvg?.toFixed(1)} vs ${afternoonAvg?.toFixed(1)} in the afternoon (${absDiff} strokes).`,
      actionable: 'For afternoon rounds, expect firmer and faster conditions and bias toward conservative targets.',
      nudgeMessage: `You usually score ${absDiff} strokes better in the morning. Start conservative and stay patient if conditions firm up.`,
    };
  }
  return {
    message: `Afternoon rounds average ${afternoonAvg?.toFixed(1)} vs ${morningAvg?.toFixed(1)} in the morning (${absDiff} strokes).`,
    actionable: 'Before morning rounds, extend warm-up and use conservative targets for the first 3 holes.',
    nudgeMessage: `Morning rounds trend ${absDiff} strokes higher for you. Warm up thoroughly before teeing off.`,
  };
}

function hasConditionVariance(rounds: SavedRound[]): boolean {
  const temps = rounds
    .map(round => parseTemp(round.weather?.temp))
    .filter((value): value is number => value != null);
  if (temps.length < 4) return false;
  return Math.max(...temps) - Math.min(...temps) >= 20;
}

function hasWindVariance(rounds: SavedRound[]): boolean {
  const windyCount = rounds.filter(round => {
    const wind = String(round.weather?.wind || '').toLowerCase();
    return wind.includes('strong') || wind.includes('very') || wind.includes('moderate');
  }).length;
  const calmCount = rounds.filter(round => {
    const wind = String(round.weather?.wind || '').toLowerCase();
    return wind.includes('calm') || wind.includes('light');
  }).length;
  return windyCount >= 3 && calmCount >= 3;
}

export function analyzeTimeOfDay(rounds: SavedRound[]): TimeOfDayAnalysis {
  const scoredRounds = rounds.filter(round => round.score > 0 && !round.isSample);
  const grouped: Record<'MORNING' | 'AFTERNOON' | 'TWILIGHT', SavedRound[]> = {
    MORNING: [],
    AFTERNOON: [],
    TWILIGHT: [],
  };

  scoredRounds.forEach(round => {
    const hour = getRoundHour(round);
    if (hour == null) return;
    grouped[getTimeOfDayCategory(hour)].push(round);
  });

  const morning = grouped.MORNING;
  const afternoon = grouped.AFTERNOON;
  const twilight = grouped.TWILIGHT;
  const morningAvg = averageScore(morning);
  const afternoonAvg = averageScore(afternoon);
  const twilightAvg = averageScore(twilight);

  if (morning.length < 3 || afternoon.length < 3 || morningAvg == null || afternoonAvg == null) {
    return {
      morningRounds: morning.length,
      afternoonRounds: afternoon.length,
      twilightRounds: twilight.length,
      morningAvg,
      afternoonAvg,
      twilightAvg,
      scoreDiff: null,
      significantDiff: false,
      timeOfDayEffect: 'INSUFFICIENT_DATA',
      finding: null,
    };
  }

  const scoreDiff = afternoonAvg - morningAvg;
  const significantDiff = Math.abs(scoreDiff) >= 2.5;
  const effect: TimeOfDayAnalysis['timeOfDayEffect'] = !significantDiff
    ? 'NEGLIGIBLE'
    : scoreDiff > 0
      ? 'MORNING_BETTER'
      : 'AFTERNOON_BETTER';

  return {
    morningRounds: morning.length,
    afternoonRounds: afternoon.length,
    twilightRounds: twilight.length,
    morningAvg,
    afternoonAvg,
    twilightAvg,
    scoreDiff,
    significantDiff,
    timeOfDayEffect: effect,
    finding: buildTimeOfDayFinding(effect, scoreDiff, morningAvg, afternoonAvg),
  };
}

export function analyzeConditionsImpact(rounds: SavedRound[]): ConditionsFinding | null {
  const scoredRounds = rounds.filter(round => round.score > 0 && !round.isSample);
  if (scoredRounds.length < 6) return null;
  if (!hasConditionVariance(scoredRounds) && !hasWindVariance(scoredRounds)) return null;

  const avg = (subset: SavedRound[]) =>
    subset.length >= 3 ? subset.reduce((sum, round) => sum + round.score, 0) / subset.length : null;

  const candidates: Array<{
    label: string;
    a: SavedRound[];
    b: SavedRound[];
    aLabel: string;
    bLabel: string;
  }> = [
    {
      label: 'Wind',
      a: scoredRounds.filter(round => ['calm', 'light'].includes(String(round.weather?.wind || '').toLowerCase())),
      b: scoredRounds.filter(round => ['strong', 'very strong', 'moderate'].includes(String(round.weather?.wind || '').toLowerCase())),
      aLabel: 'calm',
      bLabel: 'windy',
    },
    {
      label: 'Rain',
      a: scoredRounds.filter(round => !String(round.weather?.conditions || '').toLowerCase().includes('rain')),
      b: scoredRounds.filter(round => String(round.weather?.conditions || '').toLowerCase().includes('rain')),
      aLabel: 'dry',
      bLabel: 'rainy',
    },
    {
      label: 'Heat',
      a: scoredRounds.filter(round => {
        const temp = parseTemp(round.weather?.temp);
        return temp != null && temp <= 75;
      }),
      b: scoredRounds.filter(round => {
        const temp = parseTemp(round.weather?.temp);
        return temp != null && temp >= 88;
      }),
      aLabel: 'mild',
      bLabel: 'hot',
    },
    {
      label: 'Cold',
      a: scoredRounds.filter(round => {
        const temp = parseTemp(round.weather?.temp);
        return temp != null && temp >= 60;
      }),
      b: scoredRounds.filter(round => {
        const temp = parseTemp(round.weather?.temp);
        return temp != null && temp <= 48;
      }),
      aLabel: 'comfortable',
      bLabel: 'cold',
    },
  ];

  let best: ConditionsFinding | null = null;
  let bestAbs = 0;
  candidates.forEach(candidate => {
    const aAvg = avg(candidate.a);
    const bAvg = avg(candidate.b);
    if (aAvg == null || bAvg == null) return;
    const delta = bAvg - aAvg;
    const abs = Math.abs(delta);
    if (abs < 2.5 || abs <= bestAbs) return;
    bestAbs = abs;
    const toughCondition = delta > 0 ? candidate.bLabel : candidate.aLabel;
    const easyCondition = delta > 0 ? candidate.aLabel : candidate.bLabel;
    const smallSample = candidate.a.length < 5 || candidate.b.length < 5;
    best = {
      dominantCondition: candidate.label,
      deltaStrokes: abs,
      direction: delta > 0 ? 'WORSE_IN' : 'BETTER_IN',
      description: `${candidate.label}: ${toughCondition} rounds average ${abs.toFixed(1)} strokes higher than ${easyCondition} rounds.${smallSample ? ' (limited sample)' : ''}`,
      nudgeMessage: `You average ${abs.toFixed(1)} strokes higher in ${toughCondition} conditions. Adjust targets and club selection accordingly.`,
      confidenceNote: smallSample ? `Limited sample size in one side of the split.` : '',
    };
  });

  return best;
}
