import type { SavedRound, RoundHole } from '../../../types';
import type { CourseDetails, TeeBox } from '../../../services/golfCourseApiService';
import { isFairwayHit, isGreenHit, isGreenMiss } from '../../../utils/statChecks';
import { UI_COPY } from '../../../constants/uiCopy';
import type { ImportScoreSummary, PostEligibility } from './useImportSave.types';

type DirectionalValue = boolean | 'left' | 'right' | 'short' | 'long' | null;

interface BuildSavedRoundPayloadInput {
  scoreValues: Array<number | null>;
  roundHoleCount: 9 | 18;
  playerNineView: 'front' | 'back';
  parsedPars: number[];
  fairways: DirectionalValue[];
  greens: DirectionalValue[];
  upDowns: Array<boolean | null>;
  putts: string[];
  penalties: string[];
  isPremium: boolean;
  inTrial: boolean;
  activeTeeIndex: number;
  teeBoxDetails: TeeBox[];
  postEligibility: PostEligibility;
  playerDate: string;
  playerName: string;
  imageUri: string | null;
  course: CourseDetails;
  scoreSummary: Pick<ImportScoreSummary, 'isNineHoleRound' | 'filledScores'>;
}

function parseNumericArray(values: string[]) {
  return values.map(value => {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
  });
}

function buildRoundHoles(input: {
  scoreValues: Array<number | null>;
  holeStartIndex: number;
  holeEndIndex: number;
  parsedPars: number[];
  fairways: DirectionalValue[];
  greens: DirectionalValue[];
  upDowns: Array<boolean | null>;
  hasStatAccess: boolean;
  puttValues: Array<number | null>;
}): RoundHole[] {
  return input.scoreValues.slice(input.holeStartIndex, input.holeEndIndex).reduce<RoundHole[]>((acc, score, index) => {
    if (score === null) return acc;
    const sourceIndex = input.holeStartIndex + index;
    const par = input.parsedPars[sourceIndex] || 0;
    const fairway = input.hasStatAccess && par >= 4 ? input.fairways[sourceIndex] : null;
    const green = input.hasStatAccess ? input.greens[sourceIndex] : null;
    const upDown = input.hasStatAccess ? input.upDowns[sourceIndex] : null;
    acc.push({
      number: sourceIndex + 1,
      par,
      score,
      putts: input.puttValues[sourceIndex] ?? undefined,
      fairwayHit: fairway === null ? undefined : fairway,
      greenHit: green === null ? undefined : green,
      upDown: upDown === null ? undefined : upDown,
      handicapIndex: undefined,
    });
    return acc;
  }, []);
}

export function buildSavedRoundPayload(input: BuildSavedRoundPayloadInput): Omit<SavedRound, 'id'> {
  const puttValues = parseNumericArray(input.putts);
  const penaltyValues = parseNumericArray(input.penalties);
  const holeStartIndex = input.roundHoleCount === 9 && input.playerNineView === 'back' ? 9 : 0;
  const holeEndIndex = holeStartIndex + input.roundHoleCount;
  // Preserve all extracted stats on imported rounds so History cards remain data-complete.
  const hasStatAccess = true;

  const holes = buildRoundHoles({
    scoreValues: input.scoreValues,
    holeStartIndex,
    holeEndIndex,
    parsedPars: input.parsedPars,
    fairways: input.fairways,
    greens: input.greens,
    upDowns: input.upDowns,
    hasStatAccess,
    puttValues,
  });

  const totalScore = holes.reduce((sum, hole) => sum + hole.score, 0);
  const totalPutts = holes.reduce((sum, hole) => sum + (hole.putts ?? 0), 0);
  const fairwaysPossible = hasStatAccess ? holes.filter(hole => hole.par >= 4 && hole.fairwayHit !== undefined).length : 0;
  const fairwaysHit = hasStatAccess ? holes.filter(hole => hole.par >= 4 && isFairwayHit(hole.fairwayHit)).length : 0;
  const greensPossible = hasStatAccess ? holes.filter(hole => hole.greenHit !== undefined).length : 0;
  const greensHit = hasStatAccess ? holes.filter(hole => isGreenHit(hole.greenHit)).length : 0;
  const upDownAttempts = hasStatAccess ? holes.filter(hole => isGreenMiss(hole.greenHit) && hole.upDown !== undefined).length : 0;
  const upDownMade = hasStatAccess ? holes.filter(hole => isGreenMiss(hole.greenHit) && hole.upDown === true).length : 0;
  const totalPenalties = hasStatAccess
    ? penaltyValues.slice(holeStartIndex, holeEndIndex).reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : 0;

  const activeTee = input.teeBoxDetails[input.activeTeeIndex] || input.teeBoxDetails[0];

  const handicapStatus = input.postEligibility.eligible
    ? undefined
    : input.postEligibility.reason === 'score_missing'
      ? UI_COPY.scorecardImport.handicapIncompleteScores
      : input.postEligibility.reason === 'course_missing'
        ? UI_COPY.scorecardImport.handicapNotEligibleCourse
        : UI_COPY.scorecardImport.handicapNotEligibleTee;

  return {
    date: input.playerDate ? new Date(input.playerDate) : new Date(),
    roundSource: 'import',
    entryMode: 'basic',
    courseName: input.course.name,
    score: totalScore,
    holes,
    stats: {
      score: totalScore,
      putts: totalPutts > 0 ? totalPutts : undefined,
      fairways: fairwaysPossible > 0 ? fairwaysHit : undefined,
      fairwaysPossible: fairwaysPossible > 0 ? fairwaysPossible : undefined,
      greens: greensPossible > 0 ? greensHit : undefined,
      greensPossible: greensPossible > 0 ? greensPossible : undefined,
      upDownMade: upDownAttempts > 0 ? upDownMade : undefined,
      upDownAttempts: upDownAttempts > 0 ? upDownAttempts : undefined,
      courseName: input.course.name,
      teeBox: activeTee?.name,
    },
    html: '',
    imageUri: input.imageUri || '',
    statPreferencesSnapshot: undefined,
    courseSnapshot: {
      courseId: input.course.id,
      name: input.course.name,
      location: {
        city: input.course.city,
        state: input.course.state,
        country: input.course.country,
        latitude: input.course.latitude,
        longitude: input.course.longitude,
      },
      holesCount: 18,
      tee: {
        name: activeTee?.name || UI_COPY.scorecardImport.unknownTeeName,
        yardageTotal: activeTee?.yardage,
      },
      holes:
        activeTee?.holes.map(hole => ({
          number: hole.hole,
          par: hole.par,
          yardage: hole.yardage,
          handicapIndex: hole.handicap,
        })) || [],
      source: 'USER_OCR',
      version: 1,
      lastVerifiedAt: Date.now(),
    },
    holeCount: input.scoreSummary.isNineHoleRound ? 9 : 18,
    isNineHoleRound: input.scoreSummary.isNineHoleRound,
    isIncomplete: !input.scoreSummary.isNineHoleRound && input.scoreSummary.filledScores < 18,
    penalties: totalPenalties > 0 ? totalPenalties : undefined,
    notes: input.playerName
      ? UI_COPY.scorecardImport.importedNotesWithPlayer.replace('{playerName}', input.playerName)
      : UI_COPY.scorecardImport.importedNotesDefault,
    teeName: activeTee?.name,
    handicapStatus,
  };
}
