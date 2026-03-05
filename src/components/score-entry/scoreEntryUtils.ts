import type { CourseSnapshot } from '../../types';
import type { CourseDetails, TeeBox } from '../../services/golfCourseApiService';
import type { InProgressHole } from '../../services/inProgressRoundService';
import type { HoleScore } from './types';

export const buildCourseSnapshot = (
  courseData: CourseDetails,
  teeBox: TeeBox,
  elevationFt?: number | null
): CourseSnapshot => {
  return {
    courseId: courseData.id,
    name: courseData.name,
    location: {
      city: courseData.city,
      state: courseData.state,
      country: courseData.country,
      latitude: courseData.latitude,
      longitude: courseData.longitude,
      elevationFt: elevationFt || undefined,
    },
    holesCount: courseData.holes,
    tee: {
      name: teeBox.name,
      rating: teeBox.rating,
      slope: teeBox.slope,
      yardageTotal: teeBox.yardage,
    },
    holes: teeBox.holes.map(hole => ({
      number: hole.hole,
      par: hole.par,
      yardage: hole.yardage,
      handicapIndex: hole.handicap,
    })),
    source: courseData.source,
    version: courseData.version,
    lastVerifiedAt: courseData.lastVerifiedAt,
  };
};

export const createInitialHoles = (teeBox: TeeBox): HoleScore[] => {
  return teeBox.holes.map(hole => ({
    hole: hole.hole,
    par: hole.par,
    yardage: hole.yardage,
    handicap: hole.handicap,
    manualStrokes: null,
    penaltyStrokes: 0,
    score: null,
    putts: null,
    fir: null,
    gir: null,
    approachDistance: null,
    teeClub: null,
    approachClub: null,
    upDown: null,
    firstPuttDistance: null,
    misHit: false,
    missedGreen: false,
    fairwayBunker: false,
    greenSideBunker: false,
    hazardOrDrop: false,
    dropShot: false,
    outOfBounds: false,
    drinks: 0,
    isSaved: false,
  }));
};

export const mergeDraftHoles = (
  initialHoles: HoleScore[],
  draftHoles: InProgressHole[]
): HoleScore[] => {
  return initialHoles.map(hole => {
    const saved = draftHoles.find(savedHole => savedHole.hole === hole.hole);
    return saved ? { ...hole, ...saved } : hole;
  });
};
