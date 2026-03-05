import { Alert } from 'react-native';
import { saveRound } from '../../../services/roundsService';
import type { SavedRound } from '../../../types';
import { FEEDBACK_COPY } from '../../../constants/feedbackCopy';
import { UI_COPY } from '../../../constants/uiCopy';
import { logger } from '../../../utils/logger';
import { buildSavedRoundPayload } from './useImportSave.helpers';
import { validateImportScoreSummary } from './useImportSave.validation';
import { showScoreValidationAlert } from './useImportSave.alerts';
import { syncCommunityCourseSafe, uploadScorecardImageSafe } from './useImportSave.persistence';
import { promptForMissingCourse } from './useImportSave.prompts';
import type { UseImportSaveParams } from './useImportSave.types';
import { resolveCourseBuild } from './useImportSave.courseResolver';
import { ensureRoundSaveAvailable, isMissingCourseName } from './useImportSave.guards';

export function useImportSave(params: UseImportSaveParams) {
  const handleSaveCourse = async () => {
    const built = resolveCourseBuild(params, false);
    if (!built) return;
    const { course } = built;

    params.setIsProcessing(true);
    try {
      const scorecardImageUrl = await uploadScorecardImageSafe(params.imageUri, course.id);
      syncCommunityCourseSafe(course, scorecardImageUrl);

      params.onCourseReady(course);
    } catch (error) {
      logger.error('Save course failed:', error);
      Alert.alert(FEEDBACK_COPY.alerts.saveFailedTitle, FEEDBACK_COPY.alerts.saveCourseFailedBody);
    } finally {
      params.setIsProcessing(false);
    }
  };

  const handleSaveRoundWithOverride = async (courseNameOverride?: string) => {
    if (!ensureRoundSaveAvailable(params.onRoundSaved)) return;
    const onRoundSaved = params.onRoundSaved;
    if (!onRoundSaved) return;
    const built = resolveCourseBuild(params, true, courseNameOverride);
    if (!built) return;
    const { course, teeBoxDetails, parsedPars } = built;

    const scoreValidationError = validateImportScoreSummary(params.scoreSummary, params.roundHoleCount);
    if (scoreValidationError) {
      showScoreValidationAlert(scoreValidationError);
      return;
    }

    const round: Omit<SavedRound, 'id'> = buildSavedRoundPayload({
      scoreValues: params.scoreValues,
      roundHoleCount: params.roundHoleCount,
      playerNineView: params.playerNineView,
      parsedPars,
      fairways: params.fairways,
      greens: params.greens,
      upDowns: params.upDowns,
      putts: params.putts,
      penalties: params.penalties,
      isPremium: params.isPremium,
      inTrial: params.inTrial,
      activeTeeIndex: params.activeTeeIndex,
      teeBoxDetails,
      postEligibility: params.postEligibility,
      playerDate: params.playerDate,
      playerName: params.playerName,
      imageUri: params.imageUri,
      course,
      scoreSummary: params.scoreSummary,
    });

    params.setIsProcessing(true);
    try {
      syncCommunityCourseSafe(course, params.imageUri || undefined);

      const savedRound = await saveRound(round);
      Alert.alert(FEEDBACK_COPY.alerts.importCompleteTitle, FEEDBACK_COPY.alerts.importCompleteBody);
      onRoundSaved(savedRound);
    } catch (error) {
      logger.error('Save round failed:', error);
      Alert.alert(FEEDBACK_COPY.alerts.saveFailedTitle, FEEDBACK_COPY.alerts.saveRoundFailedBody);
    } finally {
      params.setIsProcessing(false);
    }
  };

  const handleSaveRound = async () => {
    if (!ensureRoundSaveAvailable(params.onRoundSaved)) return;
    if (isMissingCourseName(params.courseName)) {
      promptForMissingCourse({
        onAssignCourse: () => params.goToSection('course'),
        onSaveAnyway: () => {
          void handleSaveRoundWithOverride(UI_COPY.scorecardImport.unknownCourseSaveOverride);
        },
      });
      return;
    }
    await handleSaveRoundWithOverride();
  };

  return { handleSaveCourse, handleSaveRound, handleSaveRoundWithOverride };
}
