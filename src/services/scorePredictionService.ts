import { SavedRound } from '../types';

export interface ScorePrediction {
  low: number;
  high: number;
  median: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  roundsUsed: number;
  conditionsAdjustment: number | null;
  conditionsNote: string | null;
  message: string;
}

export interface PredictionConditions {
  tempF?: number | null;
  windDesc?: string | null;
  conditions?: string | null;
}

function windDescToMph(desc: string | null | undefined): number {
  if (!desc) return 0;
  const lower = desc.toLowerCase();
  if (lower.includes('calm')) return 3;
  if (lower.includes('light')) return 7;
  if (lower.includes('moderate')) return 12;
  if (lower.includes('strong') && !lower.includes('very')) return 17;
  if (lower.includes('very')) return 25;
  return 0;
}

export function estimateConditionsAdjustment(
  cond: PredictionConditions
): { strokes: number; note: string | null } {
  let total = 0;
  const parts: string[] = [];

  const mph = windDescToMph(cond.windDesc);
  if (mph >= 20) {
    total += 5.0;
    parts.push('+5 for very strong wind');
  } else if (mph >= 15) {
    total += 3.0;
    parts.push('+3 for strong wind');
  } else if (mph >= 10) {
    total += 1.5;
    parts.push('+1.5 for moderate wind');
  } else if (mph >= 5) {
    total += 0.5;
    parts.push('+0.5 for light wind');
  }

  const tempF = cond.tempF ?? 70;
  if (tempF < 40) {
    total += 2.0;
    parts.push('+2 for cold');
  } else if (tempF < 55) {
    total += 1.0;
    parts.push('+1 for cool');
  } else if (tempF < 65) {
    total += 0.5;
    parts.push('+0.5 for cool');
  } else if (tempF >= 90) {
    total += -0.3;
  }

  const c = (cond.conditions ?? '').toLowerCase();
  if (c.includes('heavy rain') || c.includes('thunderstorm')) {
    total += 2.0;
    parts.push('+2 for rain');
  } else if (c.includes('rain') || c.includes('shower')) {
    total += 1.0;
    parts.push('+1 for rain');
  } else if (c.includes('drizzle') || c.includes('foggy')) {
    total += 0.5;
    parts.push('+0.5 for drizzle');
  }

  return {
    strokes: Math.round(total * 2) / 2,
    note: parts.length ? parts.join(', ') : null,
  };
}

export function buildScorePrediction(
  courseRounds: SavedRound[],
  conditions?: PredictionConditions
): ScorePrediction | null {
  const withScores = courseRounds
    .filter((r) => r.score > 0 && !r.isSample)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);

  if (withScores.length < 2) return null;

  const scores = withScores.map((r) => r.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);

  const weights = scores.map((_x, i) => 1 / (i + 1));
  const weightTotal = weights.reduce((a, b) => a + b, 0);
  const weightedMean = scores.reduce((s, x, i) => s + x * weights[i], 0) / weightTotal;

  const condAdj = conditions ? estimateConditionsAdjustment(conditions) : null;
  const adjustment = condAdj?.strokes ?? 0;

  const rangeHalf = stdDev < 3 ? 2 : stdDev < 5 ? 3 : 4;
  const median = Math.round(weightedMean + adjustment);
  const low = Math.round(median - rangeHalf);
  const high = Math.round(median + rangeHalf);

  const confidence: ScorePrediction['confidence'] =
    withScores.length >= 6 && stdDev < 3.5
      ? 'HIGH'
      : withScores.length >= 3 && stdDev < 6
        ? 'MEDIUM'
        : 'LOW';

  const rangeText = low === high ? `${low}` : `${low}-${high}`;
  const condNote = condAdj?.note ? ` (${condAdj.note})` : '';
  const basisText = `Over your last ${withScores.length} rounds here`;

  const message = confidence === 'HIGH'
    ? `Expect ${rangeText} today. ${basisText}, your scores stay steady here.${condNote}`
    : confidence === 'MEDIUM'
      ? `Expect ${rangeText} today. ${basisText}.${condNote}`
      : `Somewhere around ${rangeText} based on ${withScores.length} rounds here.${condNote}`;

  return {
    low,
    high,
    median,
    confidence,
    roundsUsed: withScores.length,
    conditionsAdjustment: condAdj?.strokes ?? null,
    conditionsNote: condAdj?.note ?? null,
    message,
  };
}
