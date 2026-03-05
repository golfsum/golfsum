import { useEffect } from 'react';
import { useImportImages } from './useImportImages';
import type { BackendScorecardResponse } from '../../../services/scorecardOcrService';
import type { ImportSection, ScanState, ScanStep } from '../types';
import type { CardConfigState } from './useImportScanState';

interface Params {
  imageUri: string | null;
  cardConfig: CardConfigState;
  scanState: ScanState;
  buildPendingScanSteps: (side: 'front' | 'back') => ScanStep[];
  setCardConfig: React.Dispatch<React.SetStateAction<CardConfigState>>;
  setScanState: React.Dispatch<React.SetStateAction<ScanState>>;
  setScanSide: React.Dispatch<React.SetStateAction<'front' | 'back'>>;
  setImageUri: React.Dispatch<React.SetStateAction<string | null>>;
  setBackImageUri: React.Dispatch<React.SetStateAction<string | null>>;
  setFrontResult: React.Dispatch<React.SetStateAction<BackendScorecardResponse | null>>;
  setFrontHoleCount: React.Dispatch<React.SetStateAction<number>>;
  setNineHoleConfirmed: React.Dispatch<React.SetStateAction<boolean>>;
  setScanProgress: React.Dispatch<React.SetStateAction<number>>;
  setScanSteps: React.Dispatch<React.SetStateAction<ScanStep[]>>;
  setRoundHoleCount: React.Dispatch<React.SetStateAction<9 | 18>>;
  setPlayerNineView: React.Dispatch<React.SetStateAction<'front' | 'back'>>;
  setActiveSection: React.Dispatch<React.SetStateAction<ImportSection>>;
}

export function useImportImageFlow(params: Params) {
  useEffect(() => {
    if (!params.imageUri) {
      params.setScanState('empty');
      return;
    }
    if (params.scanState === 'empty') {
      params.setScanState('ready');
    }
  }, [params.imageUri, params.scanState, params.setScanState]);

  return useImportImages({
    cardConfig: params.cardConfig,
    buildPendingScanSteps: params.buildPendingScanSteps,
    setCardConfig: params.setCardConfig,
    setScanSide: params.setScanSide,
    setImageUri: params.setImageUri,
    setBackImageUri: params.setBackImageUri,
    setFrontResult: params.setFrontResult,
    setFrontHoleCount: params.setFrontHoleCount,
    setNineHoleConfirmed: params.setNineHoleConfirmed,
    setScanState: params.setScanState,
    setScanProgress: params.setScanProgress,
    setScanSteps: params.setScanSteps,
    setRoundHoleCount: params.setRoundHoleCount,
    setPlayerNineView: params.setPlayerNineView,
    setActiveSection: params.setActiveSection,
  });
}
