import { useMemo } from 'react';
import type { EditableTeeBox } from '../types';
import type { PostEligibility } from './useImportSave.types';

interface Params {
  scoreConfirmed: boolean;
  courseName: string;
  activeTee?: EditableTeeBox;
}

export function usePostEligibility(params: Params): PostEligibility {
  return useMemo(() => {
    if (!params.scoreConfirmed) {
      return { eligible: false, reason: 'score_missing' as const };
    }
    if (!params.courseName.trim()) {
      return { eligible: false, reason: 'course_missing' as const };
    }
    if (!params.activeTee) {
      return { eligible: false, reason: 'tee_missing' as const };
    }
    return { eligible: true as const };
  }, [params.activeTee, params.courseName, params.scoreConfirmed]);
}
