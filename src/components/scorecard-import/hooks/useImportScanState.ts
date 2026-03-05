import { useState } from 'react';
import type { BackendScorecardResponse } from '../../../services/scorecardOcrService';
import type { RoundSummary, ScanState, ScanStep } from '../types';

export interface CardConfigState {
  coverage: 'full18' | 'front9' | 'back9' | null;
  playedFull: boolean | null;
  photoFront: string | null;
  photoBack: string | null;
}

interface Params {
  buildPendingScanSteps: (side: 'front' | 'back') => ScanStep[];
}

export function useImportScanState(params: Params) {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [backImageUri, setBackImageUri] = useState<string | null>(null);
  const [frontResult, setFrontResult] = useState<BackendScorecardResponse | null>(null);
  const [scanSide, setScanSide] = useState<'front' | 'back'>('front');
  const [frontHoleCount, setFrontHoleCount] = useState(0);
  const [scanState, setScanState] = useState<ScanState>('empty');
  const [scanProgress, setScanProgress] = useState(0);
  const [scanSteps, setScanSteps] = useState<ScanStep[]>(params.buildPendingScanSteps('front'));
  const [lastOcrFlags, setLastOcrFlags] = useState<string[]>([]);
  const [roundSummary, setRoundSummary] = useState<RoundSummary | null>(null);
  const [roundHoleCount, setRoundHoleCount] = useState<9 | 18>(18);
  const [nineHoleConfirmed, setNineHoleConfirmed] = useState(false);
  const [cardConfig, setCardConfig] = useState<CardConfigState>({
    coverage: null,
    playedFull: null,
    photoFront: null,
    photoBack: null,
  });

  return {
    imageUri,
    setImageUri,
    backImageUri,
    setBackImageUri,
    frontResult,
    setFrontResult,
    scanSide,
    setScanSide,
    frontHoleCount,
    setFrontHoleCount,
    scanState,
    setScanState,
    scanProgress,
    setScanProgress,
    scanSteps,
    setScanSteps,
    lastOcrFlags,
    setLastOcrFlags,
    roundSummary,
    setRoundSummary,
    roundHoleCount,
    setRoundHoleCount,
    nineHoleConfirmed,
    setNineHoleConfirmed,
    cardConfig,
    setCardConfig,
  };
}
