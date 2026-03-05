import { Alert } from 'react-native';
import { FEEDBACK_COPY } from '../../../constants/feedbackCopy';

interface PromptForMissingCourseInput {
  onAssignCourse: () => void;
  onSaveAnyway: () => void;
}

export function promptForMissingCourse(input: PromptForMissingCourseInput) {
  Alert.alert(
    FEEDBACK_COPY.alerts.assignCourseTitle,
    FEEDBACK_COPY.alerts.assignCourseBody,
    [
      { text: FEEDBACK_COPY.actions.assignCourse, onPress: input.onAssignCourse },
      { text: FEEDBACK_COPY.actions.saveAnyway, onPress: input.onSaveAnyway },
      { text: FEEDBACK_COPY.actions.cancel, style: 'cancel' },
    ]
  );
}

