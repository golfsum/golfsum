import type { CourseDetails, HoleDetail, TeeBox } from '../../../services/golfCourseApiService';
import type { CourseSeed, EditableTeeBox } from '../types';
import { UI_COPY } from '../../../constants/uiCopy';

interface BuildCourseFromStateInput {
  allowMissingRating: boolean;
  courseName: string;
  courseNameOverride?: string;
  teeBoxes: EditableTeeBox[];
  pars: string[];
  hcpMen: string[];
  hcpWomen: string[];
  roundHoleCount: 9 | 18;
  city: string;
  state: string;
  country: string;
  courseSeed?: CourseSeed;
}

type BuildCourseErrorType = 'missing_course_name' | 'missing_tee_boxes' | 'invalid_tee_data';

type BuildCourseResult =
  | { ok: true; course: CourseDetails; teeBoxDetails: TeeBox[]; parsedPars: number[] }
  | { ok: false; type: BuildCourseErrorType; message?: string };

export function buildCourseFromImportState(input: BuildCourseFromStateInput): BuildCourseResult {
  const resolvedCourseName = (input.courseNameOverride ?? input.courseName).trim();
  if (!resolvedCourseName && !input.allowMissingRating) {
    return { ok: false, type: 'missing_course_name' };
  }
  if (input.teeBoxes.length === 0) {
    return { ok: false, type: 'missing_tee_boxes' };
  }

  const parsedPars = input.pars.map(value => parseInt(value, 10) || 0);
  const parsedHcpMen = input.hcpMen.map(value => parseInt(value, 10) || 0);
  const parsedHcpWomen = input.hcpWomen.map(value => parseInt(value, 10) || 0);
  const holeCount = input.roundHoleCount;

  let teeBoxDetails: TeeBox[];
  try {
    teeBoxDetails = input.teeBoxes.map((tee, teeIndex) => {
      const holes: HoleDetail[] = Array.from({ length: holeCount }, (_, index) => ({
        hole: index + 1,
        par: parsedPars[index] || 4,
        yardage: parseInt(tee.yardages[index], 10) || 0,
        handicap: parsedHcpMen[index] || index + 1,
        handicapWomen: parsedHcpWomen[index] || undefined,
      }));

      const totalYardage = holes.reduce((sum, hole) => sum + hole.yardage, 0);

      return {
        name: tee.name.trim() || `Tee ${teeIndex + 1}`,
        color: 'custom',
        rating: 0,
        slope: 0,
        yardage: totalYardage,
        holes,
      };
    });
  } catch (error) {
    return {
      ok: false,
      type: 'invalid_tee_data',
      message: error instanceof Error ? error.message : undefined,
    };
  }

  const totalPar = parsedPars.slice(0, holeCount).reduce((sum, value) => sum + (value || 0), 0);
  const primaryTee = teeBoxDetails[0];

  const courseId = `ocr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const course: CourseDetails = {
    id: courseId,
    name: resolvedCourseName || UI_COPY.scorecardImport.unknownCourseSaveOverride,
    city: input.city.trim(),
    state: input.state.trim(),
    country: input.country.trim() || 'US',
    holes: holeCount,
    par: totalPar || primaryTee.holes.reduce((sum, hole) => sum + hole.par, 0),
    yardage: primaryTee.yardage,
    latitude: input.courseSeed?.latitude,
    longitude: input.courseSeed?.longitude,
    teeBoxes: teeBoxDetails,
    source: 'USER_OCR',
    version: 1,
    lastVerifiedAt: Date.now(),
  };

  return { ok: true, course, teeBoxDetails, parsedPars };
}
