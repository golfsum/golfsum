import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ImportSection, InputType } from '../types';
import type { UpgradeTrigger } from '../../UpgradeSheet';

interface Params {
  lockScalarField: (field: 'playerName') => void;
  setPlayerName: Dispatch<SetStateAction<string>>;
  roundHoleCount: 9 | 18;
  setPlayerNineView: Dispatch<SetStateAction<'front' | 'back'>>;
  setScanSide: Dispatch<SetStateAction<'front' | 'back'>>;
  setShowPlayerNamePicker: Dispatch<SetStateAction<boolean>>;
  setShowAllStatsColumns: Dispatch<SetStateAction<boolean>>;
  goToSection: (section: ImportSection) => void;
  openDatePicker: () => void;
  onNavigateToProfile?: (trigger: UpgradeTrigger) => void;
  inTrial: boolean;
  openNumericEditor: (field: InputType, value: string, index?: number) => void;
}

export function useImportCallbacks(params: Params) {
  const onUpgradeImport = useCallback(() => {
    params.onNavigateToProfile?.('scorecard_import');
  }, [params]);

  const onShowNamePicker = useCallback(() => {
    params.setShowPlayerNamePicker(true);
  }, [params]);

  const onPlayerNameChange = useCallback((value: string) => {
    params.lockScalarField('playerName');
    params.setPlayerName(value);
  }, [params]);

  const onNineViewChange = useCallback((view: 'front' | 'back') => {
    params.setPlayerNineView(view);
    if (params.roundHoleCount === 9) {
      params.setScanSide(view);
    }
  }, [params]);

  const onShowAllStats = useCallback(() => {
    params.setShowAllStatsColumns(true);
  }, [params]);

  const onPressTee = useCallback(() => {
    params.goToSection('course');
  }, [params]);

  const onPressHoles = useCallback(() => {
    params.goToSection('course');
  }, [params]);

  const onPressDate = useCallback(() => {
    params.goToSection('player');
    params.openDatePicker();
  }, [params]);

  const onUpgradeTrial = useCallback(() => {
    params.onNavigateToProfile?.(params.inTrial ? 'trial_banner' : 'trial_ended_card');
  }, [params]);

  const lockPlayerName = useCallback((name: string) => {
    params.lockScalarField('playerName');
    params.setPlayerName(name);
  }, [params]);

  const onOpenNumeric = useCallback((field: InputType, value: string, index?: number) => {
    params.openNumericEditor(field, value, index);
  }, [params]);

  return {
    onUpgradeImport,
    onShowNamePicker,
    onPlayerNameChange,
    onNineViewChange,
    onShowAllStats,
    onPressTee,
    onPressHoles,
    onPressDate,
    onUpgradeTrial,
    lockPlayerName,
    onOpenNumeric,
  };
}
