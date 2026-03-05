import { buildCourseFromImportState } from './useImportSave.courseBuilder';
import { showCourseBuildErrorAlert } from './useImportSave.alerts';
import type { UseImportSaveParams } from './useImportSave.types';

type CourseBuildInput = Pick<
  UseImportSaveParams,
  | 'courseName'
  | 'teeBoxes'
  | 'pars'
  | 'hcpMen'
  | 'hcpWomen'
  | 'roundHoleCount'
  | 'city'
  | 'state'
  | 'country'
  | 'courseSeed'
>;

export function resolveCourseBuild(
  input: CourseBuildInput,
  allowMissingRating: boolean,
  courseNameOverride?: string
) {
  const result = buildCourseFromImportState({
    allowMissingRating,
    courseName: input.courseName,
    courseNameOverride,
    teeBoxes: input.teeBoxes,
    pars: input.pars,
    hcpMen: input.hcpMen,
    hcpWomen: input.hcpWomen,
    roundHoleCount: input.roundHoleCount,
    city: input.city,
    state: input.state,
    country: input.country,
    courseSeed: input.courseSeed,
  });

  if (result.ok) return result;
  showCourseBuildErrorAlert(result.type, result.message);
  return null;
}

