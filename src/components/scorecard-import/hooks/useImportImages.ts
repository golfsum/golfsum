import { useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { FEEDBACK_COPY } from '../../../constants/feedbackCopy';
import type { BackendScorecardResponse } from '../../../services/scorecardOcrService';
import type { ImportSection, ScanState, ScanStep } from '../types';
import type { CardConfigState } from './useImportScanState';

interface Params {
  cardConfig: CardConfigState;
  buildPendingScanSteps: (side: 'front' | 'back') => ScanStep[];
  setCardConfig: React.Dispatch<React.SetStateAction<CardConfigState>>;
  setScanSide: React.Dispatch<React.SetStateAction<'front' | 'back'>>;
  setImageUri: React.Dispatch<React.SetStateAction<string | null>>;
  setBackImageUri: React.Dispatch<React.SetStateAction<string | null>>;
  setFrontResult: React.Dispatch<React.SetStateAction<BackendScorecardResponse | null>>;
  setFrontHoleCount: React.Dispatch<React.SetStateAction<number>>;
  setNineHoleConfirmed: React.Dispatch<React.SetStateAction<boolean>>;
  setScanState: React.Dispatch<React.SetStateAction<ScanState>>;
  setScanProgress: React.Dispatch<React.SetStateAction<number>>;
  setScanSteps: React.Dispatch<React.SetStateAction<ScanStep[]>>;
  setRoundHoleCount: React.Dispatch<React.SetStateAction<9 | 18>>;
  setPlayerNineView: React.Dispatch<React.SetStateAction<'front' | 'back'>>;
  setActiveSection: React.Dispatch<React.SetStateAction<ImportSection>>;
}

export function useImportImages(params: Params) {
  const imageOnlyMediaType: ImagePicker.MediaType = 'images';

  const ensureCameraPermission = useCallback(async () => {
    if (Platform.OS === 'web') {
      Alert.alert(FEEDBACK_COPY.alerts.cameraNotAvailableTitle, FEEDBACK_COPY.alerts.cameraNotAvailableBody);
      return false;
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(FEEDBACK_COPY.alerts.cameraAccessNeededTitle, FEEDBACK_COPY.alerts.cameraAccessNeededBody);
      return false;
    }
    return true;
  }, []);

  const resetFrontImageState = useCallback((uri: string) => {
    params.setCardConfig((prev) => ({
      ...prev,
      photoFront: uri,
      photoBack: null,
      coverage: null,
      playedFull: null,
    }));
    params.setScanSide('front');
    params.setImageUri(uri);
    params.setBackImageUri(null);
    params.setFrontResult(null);
    params.setFrontHoleCount(0);
    params.setNineHoleConfirmed(false);
    params.setScanState('ready');
    params.setScanProgress(0);
    params.setScanSteps(params.buildPendingScanSteps('front'));
  }, [params]);

  const handleSelectImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: imageOnlyMediaType,
      quality: 0.9,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      resetFrontImageState(result.assets[0].uri);
    }
  }, [imageOnlyMediaType, resetFrontImageState]);

  const handleTakePhoto = useCallback(async () => {
    const ok = await ensureCameraPermission();
    if (!ok) return;
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: imageOnlyMediaType,
      quality: 0.9,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      resetFrontImageState(result.assets[0].uri);
    }
  }, [ensureCameraPermission, imageOnlyMediaType, resetFrontImageState]);

  const handleChangePhoto = useCallback(() => {
    handleSelectImage();
  }, [handleSelectImage]);

  const handleAddBackSide = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: imageOnlyMediaType,
      quality: 0.9,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      const uri = result.assets[0].uri;
      params.setCardConfig((prev) => ({ ...prev, photoBack: uri }));
      params.setScanSide('back');
      params.setBackImageUri(uri);
      params.setNineHoleConfirmed(false);
      params.setScanState('ready');
      params.setScanProgress(0);
      params.setScanSteps(params.buildPendingScanSteps('back'));
    }
  }, [imageOnlyMediaType, params]);

  const handleTakeBackPhoto = useCallback(async () => {
    const ok = await ensureCameraPermission();
    if (!ok) return;

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: imageOnlyMediaType,
      quality: 0.9,
    });

    if (!result.canceled && result.assets?.[0]?.uri) {
      const uri = result.assets[0].uri;
      params.setCardConfig((prev) => ({ ...prev, photoBack: uri }));
      params.setScanSide('back');
      params.setBackImageUri(uri);
      params.setNineHoleConfirmed(false);
      params.setScanState('ready');
      params.setScanProgress(0);
      params.setScanSteps(params.buildPendingScanSteps('back'));
    }
  }, [ensureCameraPermission, imageOnlyMediaType, params]);

  const handleSetCoverage = useCallback((coverage: CardConfigState['coverage']) => {
    params.setCardConfig((prev) => ({
      ...prev,
      coverage,
      playedFull: coverage === 'full18' ? null : prev.playedFull,
      photoBack: coverage === 'full18' ? null : prev.photoBack,
    }));
    if (coverage === 'full18') {
      params.setScanSide('front');
      params.setRoundHoleCount(18);
      params.setBackImageUri(null);
      params.setNineHoleConfirmed(false);
      params.setPlayerNineView('front');
      return;
    }
    const side = coverage === 'back9' ? 'back' : 'front';
    params.setScanSide(side);
    params.setPlayerNineView(side);
  }, [params]);

  const handleSetPlayedFull = useCallback((playedFull: boolean) => {
    params.setCardConfig((prev) => ({
      ...prev,
      playedFull,
      photoBack: playedFull ? prev.photoBack : null,
    }));
    if (playedFull) {
      params.setRoundHoleCount(18);
      params.setNineHoleConfirmed(false);
    } else {
      params.setRoundHoleCount(9);
      params.setBackImageUri(null);
      const side = params.cardConfig.coverage === 'back9' ? 'back' : 'front';
      params.setScanSide(side);
      params.setPlayerNineView(side);
      params.setNineHoleConfirmed(true);
    }
  }, [params]);

  const handleNextToStats = useCallback(() => {
    params.setActiveSection('player');
  }, [params]);

  const handleSetRoundHoleCount = useCallback((value: 9 | 18) => {
    params.setRoundHoleCount(value);
  }, [params]);

  return {
    handleSelectImage,
    handleTakePhoto,
    handleChangePhoto,
    handleAddBackSide,
    handleTakeBackPhoto,
    handleSetCoverage,
    handleSetPlayedFull,
    handleNextToStats,
    handleSetRoundHoleCount,
  };
}
