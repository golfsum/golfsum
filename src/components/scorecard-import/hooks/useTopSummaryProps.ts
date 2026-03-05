import { useMemo } from 'react';
import type { ReviewState, RoundSummary } from '../types';

interface Params {
  courseName: string;
  reviewState: ReviewState;
  activeTeeName?: string;
  roundHoleCount: 9 | 18;
  playerDate: string;
  isCompletedMode: boolean;
  scanState: 'empty' | 'ready' | 'scanning' | 'complete' | 'error';
  isPremium: boolean;
  inTrial: boolean;
  trialRoundsUsed: number;
  trialLimit: number;
  roundSummary: RoundSummary | null;
  onPressTee: () => void;
  onPressHoles: () => void;
  onPressDate: () => void;
  onUpgradeTrial: () => void;
}

export function useTopSummaryProps(params: Params) {
  return useMemo(() => ({
    courseName: params.courseName,
    reviewState: params.reviewState,
    activeTeeName: params.activeTeeName,
    roundHoleCount: params.roundHoleCount,
    playerDate: params.playerDate,
    isCompletedMode: params.isCompletedMode,
    scanState: params.scanState,
    isPremium: params.isPremium,
    inTrial: params.inTrial,
    trialRoundsUsed: params.trialRoundsUsed,
    trialLimit: params.trialLimit,
    roundSummary: params.roundSummary,
    onPressTee: params.onPressTee,
    onPressHoles: params.onPressHoles,
    onPressDate: params.onPressDate,
    onUpgradeTrial: params.onUpgradeTrial,
  }), [params]);
}

