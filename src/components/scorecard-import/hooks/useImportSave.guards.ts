import { Alert } from 'react-native';
import { FEEDBACK_COPY } from '../../../constants/feedbackCopy';

export function ensureRoundSaveAvailable(onRoundSaved?: unknown): boolean {
  if (onRoundSaved) return true;
  Alert.alert(FEEDBACK_COPY.alerts.importUnavailableTitle, FEEDBACK_COPY.alerts.importUnavailableBody);
  return false;
}

export function isMissingCourseName(courseName: string): boolean {
  const trimmedCourseName = courseName.trim();
  return trimmedCourseName.length === 0 || trimmedCourseName.toLowerCase() === 'test';
}

