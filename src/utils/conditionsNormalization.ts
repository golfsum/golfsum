import { SavedRound } from '../types';
import { estimateConditionsAdjustment, PredictionConditions } from '../services/scorePredictionService';

export interface NormalizedScore {
  rawScore: number;
  normalizedScore: number;
  adjustment: number;
  note: string | null;
  significant: boolean;
}

export function parseTempF(tempStr: string | null | undefined): number | null {
  if (!tempStr) return null;
  const match = tempStr.match(/([-\d.]+)\s*([CF]?)/i);
  if (!match) return null;
  const val = parseFloat(match[1]);
  if (!Number.isFinite(val)) return null;
  const unit = (match[2] || '').toUpperCase();
  if (unit === 'C') return Math.round((val * 9) / 5 + 32);
  return Math.round(val);
}

export function buildNormalizedScore(round: SavedRound): NormalizedScore | null {
  const w = round.weather;
  if (!w) return null;

  const tempF = parseTempF(w.temp != null ? String(w.temp) : null);
  const windDesc = typeof w.wind === 'string' ? w.wind : null;
  const condDesc = typeof w.conditions === 'string' ? w.conditions : null;

  if (!windDesc && tempF == null) return null;

  const conditions: PredictionConditions = {
    tempF,
    windDesc,
    conditions: condDesc,
  };

  const adj = estimateConditionsAdjustment(conditions);
  if (adj.strokes === 0) return null;

  const normalizedScore = Math.round(round.score - adj.strokes);
  const significant = Math.abs(adj.strokes) >= 2;

  return {
    rawScore: round.score,
    normalizedScore,
    adjustment: -adj.strokes,
    note: adj.note,
    significant,
  };
}
