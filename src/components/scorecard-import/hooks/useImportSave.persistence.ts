import { saveCommunityCourse } from '../../../services/courseCatalogService';
import { uploadCourseScorecardImage } from '../../../services/storageService';
import type { CourseDetails } from '../../../services/golfCourseApiService';
import { logger } from '../../../utils/logger';

export async function uploadScorecardImageSafe(imageUri: string | null, courseId: string): Promise<string | undefined> {
  if (!imageUri) return undefined;
  try {
    return await uploadCourseScorecardImage(imageUri, courseId);
  } catch (error) {
    logger.error('Scorecard upload failed:', error);
    return undefined;
  }
}

export function syncCommunityCourseSafe(course: CourseDetails, scorecardImageUrl?: string) {
  saveCommunityCourse(course, {
    scorecardImageUrl,
    source: 'USER_OCR',
  }).catch(err => {
    logger.warn('Firebase community save failed (local save still succeeded):', err?.message || err);
  });
}

