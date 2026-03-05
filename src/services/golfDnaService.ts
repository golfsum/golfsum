import { SavedRound } from '../types';

export type BallStrikingStyle = 'ACCURATE' | 'AGGRESSIVE' | 'GRINDER' | 'INCONSISTENT';
export type ShortGameStyle = 'SCRAMBLER' | 'PUTTER' | 'BOTH' | 'DEVELOPING';
export type VolatilityType = 'EXPLOSIVE' | 'STREAKY' | 'CONSISTENT' | 'GRINDING';
export type CourseManagementStyle = 'CONSERVATIVE' | 'AGGRESSIVE' | 'SITUATIONAL' | 'ERRATIC';

export interface GolfDNA {
  ballStriking: BallStrikingStyle;
  shortGame: ShortGameStyle;
  volatility: VolatilityType;
  courseManagement: CourseManagementStyle;
  ballStrikingLabel: string;
  shortGameLabel: string;
  volatilityLabel: string;
  courseManagementLabel: string;
  ballStrikingDesc: string;
  shortGameDesc: string;
  volatilityDesc: string;
  courseManagementDesc: string;
  bestScore: number | null;
  bestScoreCourse: string | null;
  bestScoreDate: string | null;
  lowestHandicap: number | null;
  mostBirdiesRound: number | null;
  roundsAnalyzed: number;
  hasSufficientData: boolean;
  /** 0-100. How confident we are in the DNA classification. 80+ = reliable. */
  confidence: number;
  /**
   * How many more qualifying rounds until confidence reaches 80.
   * 0 means confidence is already >= 80.
   */
  roundsNeeded: number;
  /**
   * The dimension with the least supporting data.
   * Useful for telling the user where more tracking helps classification quality.
   */
  weakestDimension: 'ballStriking' | 'shortGame' | 'volatility' | 'courseManagement' | null;
}

function computeDnaConfidence(
  roundCount: number,
  firHoles: number,
  girHoles: number,
  scramHoles: number
): {
  confidence: number;
  roundsNeeded: number;
  weakestDimension: GolfDNA['weakestDimension'];
} {
  const ROUNDS_IDEAL = 20;
  const FIR_IDEAL = 56;
  const GIR_IDEAL = 72;
  const SCRAM_IDEAL = 24;

  const roundScore = Math.min(1, roundCount / ROUNDS_IDEAL);
  const firScore = Math.min(1, firHoles / FIR_IDEAL);
  const girScore = Math.min(1, girHoles / GIR_IDEAL);
  const scramScore = Math.min(1, scramHoles / SCRAM_IDEAL);

  const confidence = Math.round(
    (roundScore * 0.4 +
      firScore * 0.2 +
      girScore * 0.25 +
      scramScore * 0.15) * 100
  );

  const CONFIDENCE_THRESHOLD = 80;
  let roundsNeeded = 0;
  if (confidence < CONFIDENCE_THRESHOLD) {
    const minRoundsForThreshold = Math.ceil(
      ROUNDS_IDEAL * ((CONFIDENCE_THRESHOLD / 100 - 0.6) / 0.4)
    );
    roundsNeeded = Math.max(0, minRoundsForThreshold - roundCount);
  }

  const dimensionScores: Array<[GolfDNA['weakestDimension'], number]> = [
    ['ballStriking', (firScore + girScore) / 2],
    ['shortGame', (girScore + scramScore) / 2],
    ['volatility', roundScore],
    ['courseManagement', roundScore],
  ];
  const sorted = [...dimensionScores].sort((a, b) => a[1] - b[1]);
  const weakestDimension = sorted[0][1] < 0.5 ? sorted[0][0] : null;

  return { confidence, roundsNeeded, weakestDimension };
}

export function buildGolfDNA(rounds: SavedRound[], handicap: number | null): GolfDNA {
  const completed = rounds
    .filter((r) => r.score > 0 && !r.isSample && r.holes && r.holes.length >= 9)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 30);

  if (completed.length < 5) {
    return emptyDNA(completed.length);
  }

  const allHoles = completed.flatMap((r) => r.holes ?? []).filter((h) => h.score > 0 && h.par > 0);
  const scores = completed.map((r) => r.score);

  const firHoles = allHoles.filter((h) => h.par >= 4 && h.fairwayHit !== null && h.fairwayHit !== undefined);
  const girHoles = allHoles.filter((h) => h.greenHit !== null && h.greenHit !== undefined);
  const firRate = firHoles.length >= 14 ? firHoles.filter((h) => h.fairwayHit === true).length / firHoles.length : null;
  const girRate = girHoles.length >= 18 ? girHoles.filter((h) => h.greenHit === true).length / girHoles.length : null;

  const hdcpBenchmarkGir = handicap !== null ? Math.max(0.15, 0.67 - (handicap / 36) * 0.52) : 0.35;
  const hdcpBenchmarkFir = handicap !== null ? Math.max(0.25, 0.65 - (handicap / 36) * 0.4) : 0.45;

  let ballStriking: BallStrikingStyle = 'GRINDER';
  if (firRate !== null && girRate !== null) {
    const firAbove = firRate > hdcpBenchmarkFir + 0.05;
    const girAbove = girRate > hdcpBenchmarkGir + 0.05;
    const firBelow = firRate < hdcpBenchmarkFir - 0.05;
    const girBelow = girRate < hdcpBenchmarkGir - 0.05;

    if (firAbove && girAbove) ballStriking = 'ACCURATE';
    else if (firBelow && girAbove) ballStriking = 'AGGRESSIVE';
    else if (firBelow && girBelow) ballStriking = 'INCONSISTENT';
    else ballStriking = 'GRINDER';
  } else if (girRate !== null && girRate > hdcpBenchmarkGir) {
    ballStriking = 'ACCURATE';
  }

  const scramHoles = allHoles.filter((h) => h.greenHit !== true && h.greenHit !== null && h.upDown !== null);
  const scramRate = scramHoles.length >= 8
    ? scramHoles.filter((h) => h.upDown === true).length / scramHoles.length
    : null;

  const girAboveBenchmark = girRate !== null && girRate > hdcpBenchmarkGir;
  const goodScramble = scramRate !== null && scramRate > 0.3;

  const shortGame: ShortGameStyle = girAboveBenchmark && goodScramble
    ? 'BOTH'
    : !girAboveBenchmark && goodScramble
      ? 'SCRAMBLER'
      : girAboveBenchmark && !goodScramble
        ? 'PUTTER'
        : 'DEVELOPING';

  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const stdDev = Math.sqrt(scores.reduce((s, x) => s + Math.pow(x - mean, 2), 0) / scores.length);
  const range = Math.max(...scores) - Math.min(...scores);
  const doubles = allHoles.filter((h) => h.score >= h.par + 2).length;
  const birdies = allHoles.filter((h) => h.score < h.par).length;
  const doubleRate = doubles / allHoles.length;
  const birdieRate = birdies / allHoles.length;

  const volatility: VolatilityType = stdDev >= 6 || range >= 16
    ? 'EXPLOSIVE'
    : stdDev >= 4 || (birdieRate >= 0.1 && doubleRate >= 0.1)
      ? 'STREAKY'
      : stdDev <= 2.5 && doubleRate <= 0.06
        ? 'GRINDING'
        : 'CONSISTENT';

  const courseManagement: CourseManagementStyle = doubleRate <= 0.06 && birdieRate <= 0.06
    ? 'CONSERVATIVE'
    : birdieRate >= 0.1 && doubleRate >= 0.1
      ? 'AGGRESSIVE'
      : doubleRate >= 0.12 && birdieRate < 0.08
        ? 'ERRATIC'
        : 'SITUATIONAL';

  const LABELS: Record<string, { label: string; desc: string }> = {
    ACCURATE: { label: 'Accurate Ball Striker', desc: 'Hits fairways and greens' },
    AGGRESSIVE: { label: 'Aggressive Ball Striker', desc: 'Takes on the course' },
    GRINDER: { label: 'Grinder', desc: 'Compensates with short game' },
    INCONSISTENT: { label: 'Developing Ball Striker', desc: 'Building consistency' },
    SCRAMBLER: { label: 'Short Game Wizard', desc: 'Saves pars from anywhere' },
    PUTTER: { label: 'Green Hunter', desc: 'Relies on GIR and putting' },
    BOTH: { label: 'Complete Short Game', desc: 'Strong all around the green' },
    DEVELOPING: { label: 'Short Game in Progress', desc: 'Building scoring reliability' },
    EXPLOSIVE: { label: 'Explosive', desc: 'Big swings in both directions' },
    STREAKY: { label: 'Streaky Scorer', desc: 'Runs hot and cold' },
    CONSISTENT: { label: 'Consistent', desc: 'Rarely blows up a round' },
    GRINDING: { label: 'Bogey Avoider', desc: 'Limits damage with steady, controlled scoring' },
    CONSERVATIVE: { label: 'Course Manager', desc: 'Avoids big numbers' },
    SITUATIONAL: { label: 'Situational Player', desc: 'Adapts to the moment' },
    ERRATIC: { label: 'Shot Maker', desc: 'High risk, learning outcomes' },
  };

  const bestRound = [...completed].sort((a, b) => a.score - b.score)[0] ?? null;
  const mostBirdiesRound = Math.max(...completed.map((r) => (r.holes ?? []).filter((h) => h.score < h.par && h.score > 0).length));
  const differentials = completed.filter((r) => typeof r.differential === 'number').map((r) => r.differential as number);
  const { confidence, roundsNeeded, weakestDimension } = computeDnaConfidence(
    completed.length,
    firHoles.length,
    girHoles.length,
    scramHoles.length
  );

  return {
    ballStriking,
    shortGame,
    volatility,
    courseManagement,
    ballStrikingLabel: LABELS[ballStriking]?.label ?? '',
    shortGameLabel: LABELS[shortGame]?.label ?? '',
    volatilityLabel: LABELS[volatility]?.label ?? '',
    courseManagementLabel: courseManagement === 'AGGRESSIVE' ? 'Attack Mode' : LABELS[courseManagement]?.label ?? '',
    ballStrikingDesc: LABELS[ballStriking]?.desc ?? '',
    shortGameDesc: LABELS[shortGame]?.desc ?? '',
    volatilityDesc: LABELS[volatility]?.desc ?? '',
    courseManagementDesc: courseManagement === 'AGGRESSIVE' ? 'Goes at flags and pins' : LABELS[courseManagement]?.desc ?? '',
    bestScore: bestRound?.score ?? null,
    bestScoreCourse: bestRound?.courseName ?? null,
    bestScoreDate: bestRound
      ? new Date(bestRound.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : null,
    lowestHandicap: differentials.length >= 3 ? Math.min(...differentials) : null,
    mostBirdiesRound: mostBirdiesRound > 0 ? mostBirdiesRound : null,
    roundsAnalyzed: completed.length,
    hasSufficientData: true,
    confidence,
    roundsNeeded,
    weakestDimension,
  };
}

function emptyDNA(roundCount: number): GolfDNA {
  return {
    ballStriking: 'INCONSISTENT',
    shortGame: 'DEVELOPING',
    volatility: 'CONSISTENT',
    courseManagement: 'CONSERVATIVE',
    ballStrikingLabel: '',
    shortGameLabel: '',
    volatilityLabel: '',
    courseManagementLabel: '',
    ballStrikingDesc: '',
    shortGameDesc: '',
    volatilityDesc: '',
    courseManagementDesc: '',
    bestScore: null,
    bestScoreCourse: null,
    bestScoreDate: null,
    lowestHandicap: null,
    mostBirdiesRound: null,
    roundsAnalyzed: roundCount,
    hasSufficientData: false,
    confidence: Math.round((roundCount / 5) * 20),
    roundsNeeded: Math.max(0, 5 - roundCount),
    weakestDimension: 'ballStriking',
  };
}
