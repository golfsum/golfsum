import { useCallback, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { parseScorecardWithBackend, BackendScorecardResponse } from '../../../services/scorecardOcrService';
import { logger } from '../../../utils/logger';
import { FEEDBACK_COPY } from '../../../constants/feedbackCopy';
import { UI_COPY } from '../../../constants/uiCopy';
import type { ParsedScorecardData, ScanState, ScanStep, RoundSummary } from '../types';
import { buildParsedFromBackend } from '../utils';
import type { CardConfigState } from './useImportScanState';
import {
  getScoreStepState,
  getYardageStepState,
  hasBackendStructuredData,
  hasParsedStructuredData,
  markScanStepsError,
  isOcrTimeoutError,
  reportOcrFailureSafe,
  buildOcrFailureAlertBody,
  advanceScanStepsForProgress,
} from './useOcrProcessing.helpers';

interface UseOcrProcessingParams {
  imageUri: string | null;
  backImageUri: string | null;
  scanSide: 'front' | 'back';
  cardConfig: CardConfigState;
  isOffline: boolean;
  mode: 'course' | 'completed';
  frontResult: BackendScorecardResponse | null;
  lastOcrFlags: string[];
  courseName: string;
  buildPendingScanSteps: (side: 'front' | 'back') => ScanStep[];
  updateScanStep: (id: ScanStep['id'], status: ScanStep['status'], detail?: string) => void;
  mergeBackendResults: (
    front: BackendScorecardResponse,
    back: BackendScorecardResponse
  ) => BackendScorecardResponse;
  applyParsedData: (parsed: ParsedScorecardData) => void;
  buildRoundSummary: (parsed?: ParsedScorecardData) => RoundSummary | null;
  setScanSteps: React.Dispatch<React.SetStateAction<ScanStep[]>>;
  setScanState: React.Dispatch<React.SetStateAction<ScanState>>;
  setScanProgress: React.Dispatch<React.SetStateAction<number>>;
  setIsProcessing: React.Dispatch<React.SetStateAction<boolean>>;
  setRoundHoleCount: React.Dispatch<React.SetStateAction<9 | 18>>;
  setNineHoleConfirmed: React.Dispatch<React.SetStateAction<boolean>>;
  setFrontResult: React.Dispatch<React.SetStateAction<BackendScorecardResponse | null>>;
  setFrontHoleCount: React.Dispatch<React.SetStateAction<number>>;
  setLastOcrFlags: React.Dispatch<React.SetStateAction<string[]>>;
  setRoundSummary: React.Dispatch<React.SetStateAction<RoundSummary | null>>;
  setScanSide: React.Dispatch<React.SetStateAction<'front' | 'back'>>;
}

export function useOcrProcessing(params: UseOcrProcessingParams) {
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopSimulatedProgress = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const startSimulatedProgress = useCallback(() => {
    let simulated = 10;
    progressIntervalRef.current = setInterval(() => {
      simulated += 1.5;
      if (simulated >= 85) {
        simulated = 85;
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
      }
      params.setScanProgress(Math.round(simulated));
      params.setScanSteps(prev => advanceScanStepsForProgress(prev, simulated));
    }, 300);
  }, [params]);

  const handleRunOCR = useCallback(async () => {
    const frontUri = params.imageUri || params.cardConfig.photoFront;
    const backUri = params.backImageUri || params.cardConfig.photoBack;
    const coverage = params.cardConfig.coverage;
    const playedFull = params.cardConfig.playedFull;
    if (!frontUri || !coverage) return;

    const photos = [
      { asset: frontUri, holes: coverage === 'back9' ? 'back' as const : 'front' as const },
      ...(backUri ? [{ asset: backUri, holes: coverage === 'front9' ? 'back' as const : 'front' as const }] : []),
    ];
    const roundHoles: 9 | 18 = (coverage === 'full18' || playedFull === true) ? 18 : 9;
    const requiresBack = coverage !== 'full18' && playedFull === true;
    if (requiresBack && !backUri) return;

    const activeImage = photos[0]?.asset;
    if (!activeImage) return;
    if (params.isOffline) {
      Alert.alert(
        FEEDBACK_COPY.alerts.offlineModeTitle,
        'Photo saved. OCR will run once you are back online.'
      );
      return;
    }

      params.setScanSteps(params.buildPendingScanSteps('front'));
      params.setScanState('scanning');
      params.setScanProgress(10);
      params.updateScanStep('scores', 'active');
      params.setIsProcessing(true);
      startSimulatedProgress();

      try {
      const frontPhoto = photos.find((p) => p.holes === 'front');
      const backPhoto = photos.find((p) => p.holes === 'back');

      const frontRaw = frontPhoto ? await parseScorecardWithBackend(frontPhoto.asset, params.mode) : null;
      const backRaw = backPhoto ? await parseScorecardWithBackend(backPhoto.asset, params.mode) : null;

      const backendResult = frontRaw && backRaw
        ? params.mergeBackendResults(frontRaw, backRaw)
        : (frontRaw || backRaw);
      if (!backendResult) throw new Error('No OCR result');

      if (roundHoles === 18) {
        params.setRoundHoleCount(18);
        params.setNineHoleConfirmed(false);
      } else {
        params.setRoundHoleCount(9);
        params.setNineHoleConfirmed(true);
      }

      const primaryNine = coverage === 'back9' ? 'back' : 'front';
      params.setScanSide(primaryNine);

      if (frontRaw) {
        params.setFrontResult(frontRaw);
        const detectedHoles = (frontRaw.holes || []).filter(h => h.par != null && h.par > 0).length;
        params.setFrontHoleCount(detectedHoles);
      }

      stopSimulatedProgress();

      let parsed: ParsedScorecardData | null = null;
      try {
        parsed = buildParsedFromBackend(backendResult);
      } catch (error) {
        logger.error('OCR parse mapping failed:', error);
      }
      if (parsed) logger.debug('OCR parsed (backend):', parsed);

      params.setLastOcrFlags(backendResult.flags || []);
      if (parsed) {
        try {
          params.applyParsedData(parsed);
        } catch (error) {
          logger.error('OCR apply parsed data failed:', error);
        }
      }

      const scoreStep = getScoreStepState(parsed);
      params.updateScanStep('scores', scoreStep.status, scoreStep.detail);

      params.setScanProgress(45);
      params.updateScanStep('course', 'active');
      if (params.courseName.trim()) {
        params.updateScanStep('course', 'complete', params.courseName.trim());
      } else {
        params.updateScanStep('course', 'warning', UI_COPY.scorecardImport.scanDetailNotDetectedManual);
      }

      params.setScanProgress(70);
      params.updateScanStep('yardages', 'active');
      const yardageStep = getYardageStepState(parsed);
      params.updateScanStep('yardages', yardageStep.status, yardageStep.detail);

      params.setScanProgress(100);
      const backendHasData = hasBackendStructuredData(backendResult);
      const hasParsedData = hasParsedStructuredData(parsed, params.mode);

      if (hasParsedData || backendHasData) {
        params.setRoundSummary(params.buildRoundSummary(parsed || undefined));
        params.setScanState('complete');
      } else {
        markScanStepsError(params.setScanState, params.updateScanStep);
        reportOcrFailureSafe({
          imageUri: activeImage,
          mode: params.mode,
          reason: 'no_structured_data',
          error: new Error('No structured hole data detected'),
          flags: backendResult?.flags || params.lastOcrFlags,
        });
        Alert.alert(FEEDBACK_COPY.alerts.ocrFinishedTitle, FEEDBACK_COPY.alerts.ocrFinishedNoStructuredDataBody);
      }
    } catch (error) {
      stopSimulatedProgress();
      markScanStepsError(params.setScanState, params.updateScanStep);
      if (isOcrTimeoutError(error)) {
        reportOcrFailureSafe({
          imageUri: activeImage,
          mode: params.mode,
          reason: 'timeout',
          error,
          flags: params.lastOcrFlags,
        });
        Alert.alert(FEEDBACK_COPY.alerts.ocrSlowTitle, FEEDBACK_COPY.alerts.ocrSlowBody);
        return;
      }
      reportOcrFailureSafe({
        imageUri: activeImage,
        mode: params.mode,
        reason: 'request_failed',
        error,
        flags: params.lastOcrFlags,
      });
      logger.error('OCR error:', error);
      Alert.alert(FEEDBACK_COPY.alerts.ocrFailedTitle, buildOcrFailureAlertBody(error));
    } finally {
      stopSimulatedProgress();
      params.setIsProcessing(false);
    }
  }, [params, startSimulatedProgress, stopSimulatedProgress]);

  useEffect(() => () => stopSimulatedProgress(), [stopSimulatedProgress]);

  return { handleRunOCR };
}
