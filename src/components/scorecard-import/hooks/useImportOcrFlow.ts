import { useCallback, useMemo } from 'react';
import { useOcrProcessing } from './useOcrProcessing';
import type { BackendScorecardResponse } from '../../../services/scorecardOcrService';
import type { ParsedScorecardData, RoundSummary, ScanState, ScanStep } from '../types';
import type { CardConfigState } from './useImportScanState';

interface Params {
  imageUri: string | null;
  backImageUri: string | null;
  scanSide: 'front' | 'back';
  cardConfig: CardConfigState;
  isOffline: boolean;
  mode: 'course' | 'completed';
  frontResult: BackendScorecardResponse | null;
  lastOcrFlags: string[];
  courseName: string;
  scanSteps: ScanStep[];
  buildPendingScanSteps: (side: 'front' | 'back') => ScanStep[];
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

export function useImportOcrFlow(params: Params) {
  const hasScanWarnings = useMemo(
    () => params.scanSteps.some(step => step.status === 'warning'),
    [params.scanSteps]
  );

  const updateScanStep = useCallback(
    (id: ScanStep['id'], status: ScanStep['status'], detail?: string) => {
      params.setScanSteps(prev =>
        prev.map(step => (step.id === id ? { ...step, status, detail } : step))
      );
    },
    [params]
  );

  const { handleRunOCR } = useOcrProcessing({
    imageUri: params.imageUri,
    backImageUri: params.backImageUri,
    scanSide: params.scanSide,
    cardConfig: params.cardConfig,
    isOffline: params.isOffline,
    mode: params.mode,
    frontResult: params.frontResult,
    lastOcrFlags: params.lastOcrFlags,
    courseName: params.courseName,
    buildPendingScanSteps: params.buildPendingScanSteps,
    updateScanStep,
    mergeBackendResults: params.mergeBackendResults,
    applyParsedData: params.applyParsedData,
    buildRoundSummary: params.buildRoundSummary,
    setScanSteps: params.setScanSteps,
    setScanState: params.setScanState,
    setScanProgress: params.setScanProgress,
    setIsProcessing: params.setIsProcessing,
    setRoundHoleCount: params.setRoundHoleCount,
    setNineHoleConfirmed: params.setNineHoleConfirmed,
    setFrontResult: params.setFrontResult,
    setFrontHoleCount: params.setFrontHoleCount,
    setLastOcrFlags: params.setLastOcrFlags,
    setRoundSummary: params.setRoundSummary,
    setScanSide: params.setScanSide,
  });

  return { hasScanWarnings, handleRunOCR };
}
