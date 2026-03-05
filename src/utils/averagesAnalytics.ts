/**
 * Advanced analytics for Averages Tab
 * 
 * Provides:
 * - Confidence scoring
 * - Trend detection
 * - Handicap-aware comparisons
 * - Trimmed mean calculations
 */

import { ConfidenceLevel, TrendDirection, StatWithContext } from '../types';

// ============================================================================
// TRIMMED MEAN CALCULATION
// ============================================================================

export function calculateTrimmedMean(values: number[], trimPercent: number = 10): number {
  if (values.length === 0) return 0;
  if (values.length < 5) return values.reduce((a, b) => a + b, 0) / values.length;

  const sorted = [...values].sort((a, b) => a - b);
  const trimCount = Math.floor(sorted.length * (trimPercent / 100));
  const trimmedValues = sorted.slice(trimCount, sorted.length - trimCount);
  
  return trimmedValues.reduce((a, b) => a + b, 0) / trimmedValues.length;
}

// ============================================================================
// CONFIDENCE CALCULATION
// ============================================================================

interface ConfidenceParams {
  events: number; // Number of data points (e.g., tee shots, putts)
  idealEvents: number; // Target sample size for high confidence
  stdDev: number; // Standard deviation of the values
  expectedStdDev: number; // Expected variance for this stat type
  roundsCovered: number; // How many rounds contribute to this stat
  totalRounds: number; // Total rounds in analysis period
}

export function calculateConfidence(params: ConfidenceParams): ConfidenceLevel {
  const { events, idealEvents, stdDev, expectedStdDev, roundsCovered, totalRounds } = params;

  // Suppress if insufficient data (lowered to 3 for faster feedback)
  if (events < 3) return ConfidenceLevel.INSUFFICIENT;

  // Sample size score (0-1)
  const sampleSizeScore = Math.min(events / idealEvents, 1);

  // Variance score (0-1, higher is better)
  const varianceScore = Math.max(0, 1 - (stdDev / expectedStdDev));

  // Round coverage score (0-1)
  const roundCoverageScore = roundsCovered / totalRounds;

  // Weighted confidence score
  const confidenceScore =
    sampleSizeScore * 0.5 +
    varianceScore * 0.3 +
    roundCoverageScore * 0.2;

  // Map to confidence level
  if (confidenceScore >= 0.75) return ConfidenceLevel.RELIABLE;
  if (confidenceScore >= 0.50) return ConfidenceLevel.DEVELOPING;
  return ConfidenceLevel.EARLY;
}

// ============================================================================
// TREND DETECTION
// ============================================================================

interface TrendParams {
  typicalValue: number;
  formValue: number;
  statType: 'percentage' | 'count' | 'distance';
}

export function calculateTrend(params: TrendParams): TrendDirection {
  const { typicalValue, formValue, statType } = params;

  const delta = formValue - typicalValue;

  // Define thresholds based on stat type
  let positiveThreshold: number;
  let negativeThreshold: number;

  switch (statType) {
    case 'percentage':
      // ±5% for percentages (e.g., GIR, Fairways)
      positiveThreshold = 5;
      negativeThreshold = -5;
      break;
    case 'count':
      // ±1 stroke for counts (e.g., putts per round, penalties)
      positiveThreshold = 1;
      negativeThreshold = -1;
      break;
    case 'distance':
      // ±10 yards for distances
      positiveThreshold = 10;
      negativeThreshold = -10;
      break;
    default:
      positiveThreshold = 5;
      negativeThreshold = -5;
  }

  if (delta >= positiveThreshold) return TrendDirection.IMPROVING;
  if (delta <= negativeThreshold) return TrendDirection.DECLINING;
  return TrendDirection.STABLE;
}

// ============================================================================
// HANDICAP-AWARE EXPECTATIONS
// ============================================================================

interface HandicapRange {
  min: number;
  max: number;
  expected: { min: number; max: number };
}

// Fairways Hit %
export function getExpectedFairways(handicap: number): { min: number; max: number } {
  if (handicap <= 5) return { min: 60, max: 65 };
  if (handicap <= 10) return { min: 55, max: 60 };
  if (handicap <= 15) return { min: 50, max: 55 };
  if (handicap <= 20) return { min: 45, max: 50 };
  return { min: 40, max: 45 };
}

// GIR %
export function getExpectedGIR(handicap: number): { min: number; max: number } {
  if (handicap <= 5) return { min: 65, max: 70 };
  if (handicap <= 10) return { min: 55, max: 60 };
  if (handicap <= 15) return { min: 45, max: 50 };
  if (handicap <= 20) return { min: 35, max: 40 };
  return { min: 25, max: 30 };
}

// Putts per Round
export function getExpectedPutts(handicap: number): { min: number; max: number } {
  if (handicap <= 5) return { min: 28, max: 30 };
  if (handicap <= 10) return { min: 30, max: 32 };
  if (handicap <= 15) return { min: 32, max: 34 };
  if (handicap <= 20) return { min: 34, max: 36 };
  return { min: 36, max: 38 };
}

// 3-Putt Rate %
export function getExpected3PuttRate(handicap: number): { min: number; max: number } {
  if (handicap <= 5) return { min: 0, max: 5 };
  if (handicap <= 10) return { min: 5, max: 10 };
  if (handicap <= 15) return { min: 10, max: 15 };
  if (handicap <= 20) return { min: 15, max: 20 };
  return { min: 20, max: 25 };
}

// Penalties per Round
export function getExpectedPenalties(handicap: number): { min: number; max: number } {
  if (handicap <= 5) return { min: 0, max: 0.5 };
  if (handicap <= 10) return { min: 0.5, max: 1 };
  if (handicap <= 15) return { min: 1, max: 1.5 };
  if (handicap <= 20) return { min: 1.5, max: 2 };
  return { min: 2, max: 3 };
}

// Up & Down %
export function getExpectedUpDown(handicap: number): { min: number; max: number } {
  if (handicap <= 5) return { min: 55, max: 65 };
  if (handicap <= 10) return { min: 45, max: 55 };
  if (handicap <= 15) return { min: 35, max: 45 };
  if (handicap <= 20) return { min: 25, max: 35 };
  return { min: 15, max: 25 };
}

// ============================================================================
// STATUS COMPARISON
// ============================================================================

export function compareToExpected(
  value: number,
  expectedRange: { min: number; max: number },
  isLowerBetter: boolean = false
): 'ABOVE' | 'WITHIN' | 'BELOW' {
  const tolerance = (expectedRange.max - expectedRange.min) * 0.1; // 10% buffer

  if (isLowerBetter) {
    // For stats where lower is better (e.g., putts, penalties, 3-putt rate)
    if (value < expectedRange.min - tolerance) return 'ABOVE'; // Better than expected
    if (value > expectedRange.max + tolerance) return 'BELOW'; // Worse than expected
    return 'WITHIN';
  } else {
    // For stats where higher is better (e.g., fairways, GIR, up & down)
    if (value > expectedRange.max + tolerance) return 'ABOVE';
    if (value < expectedRange.min - tolerance) return 'BELOW';
    return 'WITHIN';
  }
}

// ============================================================================
// BUILD STAT WITH CONTEXT
// ============================================================================

export function buildStatWithContext(
  values: number[], // All values for typical calculation
  recentValues: number[], // Last 5 rounds for form
  handicap: number,
  statType: 'percentage' | 'count' | 'distance',
  idealEvents: number,
  expectedStdDev: number,
  getExpectedRangeFn: (hcp: number) => { min: number; max: number },
  isLowerBetter: boolean = false
): StatWithContext | null {
  const sampleSize = values.length;

  // Suppress if insufficient data (lowered to 3 for faster feedback)
  if (sampleSize < 3) {
    return {
      typical: 0,
      confidence: ConfidenceLevel.INSUFFICIENT,
      sampleSize,
    };
  }

  // Calculate typical value (trimmed mean)
  const typical = calculateTrimmedMean(values);

  // Calculate form (recent average)
  const form = recentValues.length >= 3
    ? recentValues.reduce((a, b) => a + b, 0) / recentValues.length
    : undefined;

  // Calculate standard deviation
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  // Calculate confidence
  const confidence = calculateConfidence({
    events: sampleSize,
    idealEvents,
    stdDev,
    expectedStdDev,
    roundsCovered: Math.min(recentValues.length, 20), // Approximate
    totalRounds: Math.min(values.length, 20),
  });

  // Calculate trend (if form exists)
  const trend = form !== undefined
    ? calculateTrend({ typicalValue: typical, formValue: form, statType })
    : undefined;

  // Get expected range for handicap
  const expectedRange = getExpectedRangeFn(handicap);

  // Compare to expected
  const status = compareToExpected(typical, expectedRange, isLowerBetter);

  return {
    typical: Math.round(typical * 10) / 10, // Round to 1 decimal
    form: form !== undefined ? Math.round(form * 10) / 10 : undefined,
    trend,
    confidence,
    expectedRange,
    status,
    sampleSize,
  };
}

// ============================================================================
// UI COPY HELPERS
// ============================================================================

export function getConfidenceLabel(confidence: ConfidenceLevel): string {
  switch (confidence) {
    case ConfidenceLevel.RELIABLE:
      return 'Reliable';
    case ConfidenceLevel.DEVELOPING:
      return 'Developing';
    case ConfidenceLevel.EARLY:
      return 'Early data';
    case ConfidenceLevel.INSUFFICIENT:
      return '';
  }
}

export function getConfidenceTooltip(confidence: ConfidenceLevel): string {
  switch (confidence) {
    case ConfidenceLevel.RELIABLE:
      return 'This reflects your most typical performance, not your best or worst result.';
    case ConfidenceLevel.DEVELOPING:
      return 'This will become more accurate as additional rounds are recorded. Variation like this is normal in golf.';
    case ConfidenceLevel.EARLY:
      return 'Based on a small sample. Expect this to evolve. One round doesn\'t define your overall performance.';
    case ConfidenceLevel.INSUFFICIENT:
      return 'There isn\'t enough consistent data yet to surface this confidently. More data needed.';
  }
}

export function getTrendLabel(trend: TrendDirection): string {
  switch (trend) {
    case TrendDirection.IMPROVING:
      return 'Improving';
    case TrendDirection.STABLE:
      return 'Consistent';
    case TrendDirection.DECLINING:
      return 'Worth checking';
  }
}

export function getTrendTooltip(trend: TrendDirection): string {
  switch (trend) {
    case TrendDirection.IMPROVING:
      return 'Your recent rounds are showing progress. Day-to-day conditions and small differences in contact can cause natural swings.';
    case TrendDirection.STABLE:
      return 'Your recent performance is staying consistent. This is a sign of reliable patterns.';
    case TrendDirection.DECLINING:
      return 'Your recent rounds are slightly below typical. Variation like this is normal in golf, even for skilled players.';
  }
}

export function getStatusLabel(status: 'ABOVE' | 'WITHIN' | 'BELOW'): string {
  switch (status) {
    case 'ABOVE':
      return 'Stronger than typical for your handicap';
    case 'WITHIN':
      return 'Within expected range for your handicap';
    case 'BELOW':
      return 'Slightly below typical for your handicap';
  }
}

export function getStatusTooltip(status: 'ABOVE' | 'WITHIN' | 'BELOW'): string {
  switch (status) {
    case 'ABOVE':
      return 'This is stronger than typical for players at your level. Keep this up.';
    case 'WITHIN':
      return 'This is within the expected range for players at your level. Solid performance.';
    case 'BELOW':
      return 'This is slightly below the typical range for your handicap. Worth keeping an eye on.';
  }
}

export function getStatusColor(status: 'ABOVE' | 'WITHIN' | 'BELOW'): string {
  switch (status) {
    case 'ABOVE':
      return '#10b981'; // Green
    case 'WITHIN':
      return '#6b7280'; // Gray
    case 'BELOW':
      return '#f59e0b'; // Amber
  }
}
