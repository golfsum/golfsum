import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { getAuthToken, getCurrentUser } from './firebaseAuthService';
import { convertToFirestoreFields } from './userService';
import { uploadOcrErrorImage } from './storageService';
import { logger } from '../utils/logger';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { FIRESTORE_BASE_URL } from './firebaseConfig';

type OcrFailureReason = 'no_structured_data' | 'request_failed' | 'timeout';

const normalizeError = (error: unknown) => {
  if (!error) {
    return { message: 'Unknown error' };
  }
  if (error instanceof Error) {
    return {
      message: error.message || 'Error',
      name: error.name || undefined,
      stack: error.stack || undefined,
    };
  }
  try {
    const message = typeof error === 'string' ? error : JSON.stringify(error);
    return { message };
  } catch {
    return { message: 'Unknown error' };
  }
};

async function getHeaders(): Promise<HeadersInit> {
  const token = await getAuthToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function reportOcrFailure(params: {
  imageUri?: string | null;
  mode: 'course' | 'completed';
  reason: OcrFailureReason;
  error?: unknown;
  flags?: string[];
}): Promise<void> {
  const user = getCurrentUser();
  if (!user) return;

  const createdAt = new Date().toISOString();
  const errorId = `${user.uid}-${Date.now()}`;
  const errorData = normalizeError(params.error);

  let imageUrl: string | null = null;
  if (params.imageUri) {
    try {
      imageUrl = await uploadOcrErrorImage(params.imageUri, errorId);
    } catch (uploadError) {
      logger.error('OCR error image upload failed:', uploadError);
    }
  }

  const appVersion =
    Constants.expoConfig?.version ||
    (Constants as any).nativeAppVersion ||
    null;
  const buildNumber =
    Constants.expoConfig?.ios?.buildNumber ||
    Constants.expoConfig?.android?.versionCode ||
    null;

  const payload = {
    uid: user.uid,
    email: user.email || null,
    createdAt,
    mode: params.mode,
    reason: params.reason,
    error: errorData,
    flags: params.flags || [],
    imageUrl,
    platform: Platform.OS,
    appVersion,
    buildNumber,
  };

  try {
    const response = await fetchWithTimeout(`${FIRESTORE_BASE_URL}/ocrErrors/${errorId}`, {
      method: 'PATCH',
      headers: await getHeaders(),
      body: JSON.stringify({ fields: convertToFirestoreFields(payload) }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      logger.error('Failed to save OCR error:', text || response.status);
    }
  } catch (err) {
    logger.error('OCR error report failed:', err);
  }
}
