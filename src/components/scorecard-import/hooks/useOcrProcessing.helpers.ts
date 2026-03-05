import type { Dispatch, SetStateAction } from 'react';
import { FEEDBACK_COPY } from '../../../constants/feedbackCopy';
import { UI_COPY } from '../../../constants/uiCopy';
import { reportOcrFailure } from '../../../services/ocrErrorService';
import type { BackendScorecardResponse } from '../../../services/scorecardOcrService';
import type { ParsedScorecardData, ScanState, ScanStep } from '../types';

export function getScoreStepState(parsed: ParsedScorecardData | null): { status: 'complete' | 'warning'; detail: string } {
  const scoreCount = parsed?.playerScores?.length || 0;
  const hasAnyScoreStats = Boolean(
    scoreCount ||
      parsed?.playerPutts?.length ||
      parsed?.playerFairways?.length ||
      parsed?.playerGreens?.length ||
      parsed?.playerUpDowns?.length ||
      parsed?.playerPenalties?.length
  );

  if (scoreCount >= 9) {
    return { status: 'complete', detail: `${scoreCount} holes found` };
  }
  if (hasAnyScoreStats) {
    return { status: 'warning', detail: UI_COPY.scorecardImport.scanDetailPartialReview };
  }
  return { status: 'warning', detail: UI_COPY.scorecardImport.scanDetailNotDetectedManual };
}

export function getYardageStepState(parsed: ParsedScorecardData | null): { status: 'complete' | 'warning'; detail: string } {
  const totalPar = parsed?.par?.length ? parsed.par.reduce((sum, value) => sum + value, 0) : 0;
  const yardageTees = parsed?.yardageByTee ? Object.keys(parsed.yardageByTee).length : 0;

  if (totalPar > 0 && yardageTees > 0) {
    return { status: 'complete', detail: `Par ${totalPar}` };
  }
  if (totalPar > 0 || yardageTees > 0) {
    return { status: 'warning', detail: UI_COPY.scorecardImport.scanDetailPartialReview };
  }
  return { status: 'warning', detail: UI_COPY.scorecardImport.scanDetailNotDetectedManual };
}

export function hasBackendStructuredData(backendResult: BackendScorecardResponse): boolean {
  return Boolean(
    backendResult?.holes?.length ||
      backendResult?.metadata?.tee_boxes?.length ||
      (backendResult?.metadata?.rating_men_by_tee &&
        Object.keys(backendResult.metadata.rating_men_by_tee).length > 0) ||
      (backendResult?.metadata?.slope_men_by_tee &&
        Object.keys(backendResult.metadata.slope_men_by_tee).length > 0) ||
      backendResult?.player?.holes?.length
  );
}

export function hasParsedStructuredData(parsed: ParsedScorecardData | null, mode: 'course' | 'completed'): boolean {
  return Boolean(
    parsed?.par?.length ||
      parsed?.handicapMen?.length ||
      parsed?.handicapWomen?.length ||
      parsed?.teeNames?.length ||
      (parsed?.yardageByTee && Object.keys(parsed.yardageByTee).length > 0) ||
      (mode === 'completed' &&
        (parsed?.playerScores?.length ||
          parsed?.playerPutts?.length ||
          parsed?.playerFairways?.length ||
          parsed?.playerGreens?.length))
  );
}

export function markScanStepsError(
  setScanState: Dispatch<SetStateAction<ScanState>>,
  updateScanStep: (id: ScanStep['id'], status: ScanStep['status'], detail?: string) => void
) {
  setScanState('error');
  updateScanStep('scores', 'error');
  updateScanStep('course', 'error');
  updateScanStep('yardages', 'error');
}

export function isOcrTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return message.toLowerCase().includes('timeout');
}

export function reportOcrFailureSafe(params: {
  imageUri: string;
  mode: 'course' | 'completed';
  reason: 'timeout' | 'request_failed' | 'no_structured_data';
  error: unknown;
  flags: string[];
}) {
  reportOcrFailure({
    imageUri: params.imageUri,
    mode: params.mode,
    reason: params.reason,
    error: params.error,
    flags: params.flags,
  }).catch(() => undefined);
}

export function buildOcrFailureAlertBody(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  const fallback = FEEDBACK_COPY.alerts.ocrFailedFallbackBody;
  return message ? `${fallback}\n\nDetails: ${message}` : fallback;
}

export function advanceScanStepsForProgress(steps: ScanStep[], simulatedProgress: number): ScanStep[] {
  if (simulatedProgress >= 60) {
    return steps.map(step => {
      if (step.id === 'scores' && step.status === 'active') return { ...step, status: 'complete' };
      if (step.id === 'course' && step.status === 'active') return { ...step, status: 'complete' };
      if (step.id === 'yardages' && step.status === 'pending') return { ...step, status: 'active' };
      return step;
    });
  }

  if (simulatedProgress >= 35) {
    return steps.map(step => {
      if (step.id === 'scores' && step.status === 'active') return { ...step, status: 'complete' };
      if (step.id === 'course' && step.status === 'pending') return { ...step, status: 'active' };
      return step;
    });
  }

  return steps;
}
