import { Alert } from 'react-native';
import { FEEDBACK_COPY } from '../../../constants/feedbackCopy';
import type { ImportScoreValidationError } from './useImportSave.validation';

type CourseBuildErrorType = 'missing_course_name' | 'missing_tee_boxes' | 'invalid_tee_data';

export function showCourseBuildErrorAlert(type: CourseBuildErrorType, message?: string) {
  if (type === 'missing_course_name') {
    Alert.alert(FEEDBACK_COPY.alerts.missingCourseNameTitle, FEEDBACK_COPY.alerts.missingCourseNameBody);
    return;
  }
  if (type === 'missing_tee_boxes') {
    Alert.alert(FEEDBACK_COPY.alerts.missingTeeBoxesTitle, FEEDBACK_COPY.alerts.missingTeeBoxesBody);
    return;
  }
  Alert.alert(FEEDBACK_COPY.alerts.invalidTeeDataTitle, message || FEEDBACK_COPY.alerts.invalidTeeDataBody);
}

export function showScoreValidationAlert(error: ImportScoreValidationError) {
  if (error === 'missing_scores') {
    Alert.alert(FEEDBACK_COPY.alerts.missingScoresTitle, FEEDBACK_COPY.alerts.missingScoresBody);
    return;
  }
  if (error === 'incomplete_18') {
    Alert.alert(FEEDBACK_COPY.alerts.incompleteScoresTitle, FEEDBACK_COPY.alerts.incompleteScores18Body);
    return;
  }
  Alert.alert(FEEDBACK_COPY.alerts.incompleteScoresTitle, FEEDBACK_COPY.alerts.incompleteScores9Body);
}

