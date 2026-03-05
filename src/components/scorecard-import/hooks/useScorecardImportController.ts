import { useFeatureGate } from '../../../hooks/useFeatureGate';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import { mergeBackendResults } from '../utils';
import { buildPendingScanSteps } from '../helpers';
import { INPUT_CONFIG } from '../inputConfig';
import { YARDAGE_CELL_GAP } from '../../ScorecardImportScreen.styles';
import { useImportUiFlow } from './useImportUiFlow';
import { useLockedFields } from './useLockedFields';
import { useImportParsedData } from './useImportParsedData';
import { useImportProfile } from './useImportProfile';
import { useImportDatePicker } from './useImportDatePicker';
import { useImportDerivedState } from './useImportDerivedState';
import { useImportSectionTabs } from './useImportSectionTabs';
import { usePostEligibility } from './usePostEligibility';
import { useImportOcrFlow } from './useImportOcrFlow';
import { useImportCourseFlow } from './useImportCourseFlow';
import { useImportImageFlow } from './useImportImageFlow';
import { useImportEditingFlow } from './useImportEditingFlow';
import { useImportSaveFlow } from './useImportSaveFlow';
import { useImportScanState } from './useImportScanState';
import { useImportCourseState } from './useImportCourseState';
import { useImportPlayerState } from './useImportPlayerState';
import { useScorecardImportLayoutModel } from './useScorecardImportLayoutModel';
import type { ScorecardImportControllerParams } from './useScorecardImportController.types';
import {
  buildLayoutModelArgs,
  buildCourseFlowArgs,
  buildDatePickerArgs,
  buildDerivedStateArgs,
  buildEditingFlowArgs,
  buildImageFlowArgs,
  buildLockedFieldsArgs,
  buildOcrFlowArgs,
  buildParsedDataArgs,
  buildProfileArgs,
  buildSaveFlowArgs,
  buildUiFlowArgs,
} from './useScorecardImportController.args';

export function useScorecardImportController(params: ScorecardImportControllerParams) {
  const mode = params.mode || 'course';
  const { isOffline } = useNetworkStatus();
  const { isPremium, inTrial, trialRoundsUsed, trialLimit } = useFeatureGate();
  const isCompletedMode = mode === 'completed';

  const player = useImportPlayerState();
  const scan = useImportScanState({ buildPendingScanSteps });
  const course = useImportCourseState({ courseSeed: params.courseSeed });

  const { lockArrayIndex, lockScalarField, lockTeeField, lockTeeYardageIndex } = useLockedFields(
    buildLockedFieldsArgs({ course, player })
  );

  const derived = useImportDerivedState(
    buildDerivedStateArgs({
      course,
      player,
      scan,
      isCompletedMode,
      yardageCellGap: YARDAGE_CELL_GAP,
    })
  );

  useImportProfile(buildProfileArgs({ player }));

  const datePicker = useImportDatePicker(buildDatePickerArgs({ player, lockScalarField }));

  const sectionTabs = useImportSectionTabs(isCompletedMode);
  const uiFlow = useImportUiFlow(
    buildUiFlowArgs({
      player,
      scan,
      sectionTabs,
      reviewKind: derived.reviewState.kind,
      isCompletedMode,
    })
  );

  const postEligibility = usePostEligibility({
    scoreConfirmed: derived.scoreSummary.scoreConfirmed,
    courseName: course.courseName,
    activeTee: derived.activeTee,
  });

  const parsedData = useImportParsedData(buildParsedDataArgs({ player, course }));

  const ocrFlow = useImportOcrFlow(
    buildOcrFlowArgs({
      params,
      isOffline,
      mode,
      scan,
      course,
      player,
      parsedData,
      buildPendingScanSteps,
      mergeBackendResults,
    })
  );

  const imageFlow = useImportImageFlow(
    buildImageFlowArgs({
      scan,
      player,
      buildPendingScanSteps,
    })
  );

  const courseFlow = useImportCourseFlow(
    buildCourseFlowArgs({
      params,
      course,
      player,
      lockScalarField,
    })
  );

  const editing = useImportEditingFlow(
    buildEditingFlowArgs({
      inputConfig: INPUT_CONFIG,
      player,
      course,
      derived,
      lockArrayIndex,
      lockTeeYardageIndex,
      lockTeeField,
    })
  );

  const saveFlow = useImportSaveFlow(
    buildSaveFlowArgs({
      params,
      isCompletedMode,
      isPremium,
      inTrial,
      course,
      scan,
      player,
      derived,
      uiFlow,
      postEligibility,
    })
  );

  return useScorecardImportLayoutModel(
    buildLayoutModelArgs({
      params,
      player,
      scan,
      course,
      datePicker,
      uiFlow,
      editing,
      imageFlow,
      courseFlow,
      isCompletedMode,
      isPremium,
      inTrial,
      trialRoundsUsed,
      trialLimit,
      sectionTabs,
      lockScalarField,
      lockTeeField,
      derived,
      ocrFlow,
      saveFlow,
    })
  );
}
