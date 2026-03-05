import { RoundHole, SavedRound } from '../types';
import { getHandicapTier, HandicapTier } from '../utils/handicap';
import {
  adjustYardageForTemp,
  getTempCategory,
  tempAdjustmentSummary,
  TempCategory,
} from '../utils/temperatureAdjustment';

export const BAND_MIDPOINTS: Record<string, number> = {
  '<50': 40,
  '50-100': 75,
  '<75': 60,
  '75-100': 88,
  '100-125': 113,
  '100-150': 125,
  '125-150': 138,
  '150-175': 163,
  '150-200': 175,
  '175-200': 188,
  '200-225': 213,
  '225-250': 238,
  '250+': 260,
};

const GIR_BENCHMARK: Record<HandicapTier, number> = {
  SCRATCH: 0.67,
  LOW: 0.45,
  MID: 0.28,
  HIGH: 0.18,
  BEGINNER: 0.10,
};

export type FindingType =
  | 'UNDERCLUBBING'
  | 'OVERCLUBBING'
  | 'CONTACT_INCONSISTENCY'
  | 'BETWEEN_CLUBS_HESITATION';

export interface BandAnalysis {
  band: string;
  midpoint: number;
  shotCount: number;
  girRate: number;
  shortMisses: number;
  longMisses: number;
  leftMisses: number;
  rightMisses: number;
  totalMisses: number;
  shortMissRate: number;
  longMissRate: number;
  contactVariance: number;
  expectedClubs: string[];
  actualClubsUsed: string[];
  clubMismatch: boolean;
  gapBand: boolean;
  windyShortRate: number | null;
  calmShortRate: number | null;
  windExplains: boolean;
  pattern: 'SHORT' | 'LONG' | 'INCONSISTENT' | 'GAP_HESITATION' | 'NORMAL' | null;
}

export interface YardageFinding {
  type: FindingType;
  band: string;
  club: string | null;
  registeredYardage: number | null;
  nearbyClub: string | null;
  nearbyYardage: number | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  actionMessage: string;
  preRoundMessage: string;
}

export interface ClubYardageAnalysis {
  analyzedBands: BandAnalysis[];
  primaryFinding: YardageFinding | null;
  preRoundAdjustment: string | null;
  hasYardageData: boolean;
  hasApproachData: boolean;
  systematicallyShort: boolean;
  systematicallyLong: boolean;
  hasContactIssue: boolean;
  hasBetweenClubsIssue: boolean;
}

export interface AdjustedClubDistance {
  club: string;
  baseYardage: number;
  adjustedYardage: number;
  yardageDiff: number;
}

export interface TempClubAdvisory {
  warrantNudge: boolean;
  category: TempCategory;
  tempF: number;
  preRoundMessage: string;
  fullMessage: string;
  adjustedClubs: AdjustedClubDistance[];
  exampleClub: string | null;
  exampleBase: number | null;
  exampleAdjusted: number | null;
}

type ApproachHoleWithWeather = RoundHole & { isWindy: boolean | null };

const GREEN_MISS_VALUES = new Set(['short', 'long', 'left', 'right']);

function isWindyRound(round: SavedRound): boolean | null {
  const weather = round.weather || round.weatherFront9 || round.weatherBack9;
  if (!weather) return null;
  const windDir = String(weather.windDirection || '').toLowerCase();
  const conditions = String(weather.conditions || '').toLowerCase();
  const speedMatch = String(weather.wind || '').match(/(\d+(\.\d+)?)/);
  const speed = speedMatch ? Number(speedMatch[1]) : null;
  if (windDir && windDir !== 'calm') return true;
  if (conditions.includes('wind')) return true;
  if (speed != null && Number.isFinite(speed)) return speed >= 10;
  if (windDir === 'calm') return false;
  return null;
}

function groupByBand(holes: ApproachHoleWithWeather[]): Record<string, ApproachHoleWithWeather[]> {
  return holes.reduce<Record<string, ApproachHoleWithWeather[]>>((acc, hole) => {
    const band = String(hole.approachDistance || '');
    if (!band) return acc;
    if (!acc[band]) acc[band] = [];
    acc[band].push(hole);
    return acc;
  }, {});
}

interface ClassifyParams {
  girRate: number;
  shortMissRate: number;
  longMissRate: number;
  contactVariance: number;
  depthMisses: number;
  windExplains: boolean;
  gapBand: boolean;
}

function classifyBandPattern(params: ClassifyParams): BandAnalysis['pattern'] {
  if (params.depthMisses < 4) return 'NORMAL';
  if (
    params.gapBand &&
    params.girRate >= 0.45 &&
    params.shortMissRate >= 0.55 &&
    params.shortMissRate < 0.72 &&
    !params.windExplains
  ) {
    return 'GAP_HESITATION';
  }
  if (
    params.contactVariance >= 0.65 &&
    params.shortMissRate >= 0.30 &&
    params.longMissRate >= 0.30 &&
    !params.windExplains
  ) {
    return 'INCONSISTENT';
  }
  if (params.shortMissRate >= 0.60 && !params.windExplains) return 'SHORT';
  if (params.longMissRate >= 0.60) return 'LONG';
  return 'NORMAL';
}

function hasApproachHoleData(hole: RoundHole): boolean {
  return (
    hole.approachDistance != null &&
    hole.greenHit !== null &&
    hole.greenHit !== undefined &&
    (hole.greenHit === true || GREEN_MISS_VALUES.has(String(hole.greenHit)))
  );
}

export function getClubsForBand(midpoint: number, clubDistances: Record<string, number>): string[] {
  return Object.entries(clubDistances)
    .filter(([, yardage]) => Math.abs(yardage - midpoint) <= 15)
    .sort((a, b) => b[1] - a[1])
    .map(([club]) => club);
}

export function isInClubGap(midpoint: number, clubDistances: Record<string, number>): boolean {
  const yardages = Object.values(clubDistances)
    .filter(v => Number.isFinite(v))
    .sort((a, b) => a - b);
  if (yardages.length < 2) return false;
  for (let i = 0; i < yardages.length - 1; i += 1) {
    const lower = yardages[i];
    const upper = yardages[i + 1];
    const gap = upper - lower;
    if (gap >= 10 && midpoint > lower + 3 && midpoint < upper - 3) return true;
  }
  return false;
}

export function getGapClubs(
  midpoint: number,
  clubDistances: Record<string, number>
): { lowerClub: string; lowerYardage: number; upperClub: string; upperYardage: number } | null {
  const entries = Object.entries(clubDistances)
    .filter(([, yardage]) => Number.isFinite(yardage))
    .map(([club, yardage]) => ({ club, yardage }))
    .sort((a, b) => a.yardage - b.yardage);
  for (let i = 0; i < entries.length - 1; i += 1) {
    const lower = entries[i];
    const upper = entries[i + 1];
    if (midpoint > lower.yardage + 3 && midpoint < upper.yardage - 3) {
      return {
        lowerClub: lower.club,
        lowerYardage: lower.yardage,
        upperClub: upper.club,
        upperYardage: upper.yardage,
      };
    }
  }
  return null;
}

export function analyzeBands(rounds: SavedRound[], clubDistances: Record<string, number>): BandAnalysis[] {
  const approachHoles: ApproachHoleWithWeather[] = rounds.flatMap(round => {
    const windyFlag = isWindyRound(round);
    return (round.holes || [])
      .filter(hasApproachHoleData)
      .map(hole => ({ ...hole, isWindy: windyFlag }));
  });
  const hasYardageData = Object.keys(clubDistances).length >= 3;
  const byBand = groupByBand(approachHoles);
  const results: BandAnalysis[] = [];

  Object.entries(byBand).forEach(([band, holes]) => {
    if (holes.length < 5) return;
    const midpoint = BAND_MIDPOINTS[band] ?? 150;
    const hits = holes.filter(h => h.greenHit === true).length;
    const misses = holes.filter(h => h.greenHit !== true);
    const shortMisses = misses.filter(h => h.greenHit === 'short').length;
    const longMisses = misses.filter(h => h.greenHit === 'long').length;
    const leftMisses = misses.filter(h => h.greenHit === 'left').length;
    const rightMisses = misses.filter(h => h.greenHit === 'right').length;
    const depthMisses = shortMisses + longMisses;
    const girRate = hits / holes.length;
    const shortMissRate = depthMisses > 0 ? shortMisses / depthMisses : 0;
    const longMissRate = depthMisses > 0 ? longMisses / depthMisses : 0;
    const contactVariance = depthMisses >= 4 ? 1 - Math.abs(shortMissRate - longMissRate) : 0;

    const windyHoles = holes.filter(h => h.isWindy === true);
    const calmHoles = holes.filter(h => h.isWindy === false);
    const windyMisses = windyHoles.filter(h => h.greenHit !== true);
    const calmMisses = calmHoles.filter(h => h.greenHit !== true);
    const windyShortMisses = windyMisses.filter(h => h.greenHit === 'short').length;
    const calmShortMisses = calmMisses.filter(h => h.greenHit === 'short').length;
    const windyShortRate = windyMisses.length >= 3 ? windyShortMisses / windyMisses.length : null;
    const calmShortRate = calmMisses.length >= 3 ? calmShortMisses / calmMisses.length : null;
    const windExplains = windyShortRate !== null && calmShortRate !== null && windyShortRate - calmShortRate > 0.25;

    const expectedClubs = hasYardageData ? getClubsForBand(midpoint, clubDistances) : [];
    const actualClubsUsed = [...new Set(holes.map(h => h.approachClub).filter((club): club is string => Boolean(club)))];
    const clubMismatch = hasYardageData && actualClubsUsed.length > 0 && !actualClubsUsed.some(club => expectedClubs.includes(club));
    const gapBand = hasYardageData && expectedClubs.length === 0 && isInClubGap(midpoint, clubDistances);
    const pattern = classifyBandPattern({
      girRate,
      shortMissRate,
      longMissRate,
      contactVariance,
      depthMisses,
      windExplains,
      gapBand,
    });

    results.push({
      band,
      midpoint,
      shotCount: holes.length,
      girRate,
      shortMisses,
      longMisses,
      leftMisses,
      rightMisses,
      totalMisses: misses.length,
      shortMissRate,
      longMissRate,
      contactVariance,
      expectedClubs,
      actualClubsUsed,
      clubMismatch,
      gapBand,
      windyShortRate,
      calmShortRate,
      windExplains,
      pattern,
    });
  });

  return results;
}

function bestBandByShotCount(bands: BandAnalysis[]): BandAnalysis {
  return [...bands].sort((a, b) => b.shotCount - a.shotCount)[0];
}

export function buildPrimaryFinding(
  bands: BandAnalysis[],
  clubDistances: Record<string, number>,
  handicap: number | null
): YardageFinding | null {
  const tier = getHandicapTier(handicap);
  const benchmark = GIR_BENCHMARK[tier];

  const gapBands = bands.filter(b => b.pattern === 'GAP_HESITATION');
  if (gapBands.length >= 1 && (tier === 'SCRATCH' || tier === 'LOW')) {
    const primary = bestBandByShotCount(gapBands);
    const gapClubs = getGapClubs(primary.midpoint, clubDistances);
    if (gapClubs) {
      return {
        type: 'BETWEEN_CLUBS_HESITATION',
        band: primary.band,
        club: gapClubs.upperClub,
        registeredYardage: gapClubs.upperYardage,
        nearbyClub: gapClubs.lowerClub,
        nearbyYardage: gapClubs.lowerYardage,
        confidence: primary.shotCount >= 10 ? 'HIGH' : 'MEDIUM',
        message: `From ${primary.band} yards you are between ${gapClubs.upperClub} (${gapClubs.upperYardage} yds) and ${gapClubs.lowerClub} (${gapClubs.lowerYardage} yds). GIR is ${(primary.girRate * 100).toFixed(0)}% but misses lean short.`,
        actionMessage: `From this gap, default to ${gapClubs.upperClub} and make a smooth committed swing. Remove the decision before setup.`,
        preRoundMessage: `From ${primary.band} yards today, play ${gapClubs.upperClub} without deliberating. Contact is solid; decision speed is the lever.`,
      };
    }
  }

  const inconsistentBands = bands.filter(
    b => b.pattern === 'INCONSISTENT' && b.girRate < benchmark - 0.05
  );
  if (inconsistentBands.length >= 2) {
    const primary = bestBandByShotCount(inconsistentBands);
    const worstBand = [...inconsistentBands].sort((a, b) => a.girRate - b.girRate)[0];
    return {
      type: 'CONTACT_INCONSISTENCY',
      band: primary.band,
      club: primary.expectedClubs[0] ?? null,
      registeredYardage: primary.expectedClubs[0] ? clubDistances[primary.expectedClubs[0]] ?? null : null,
      nearbyClub: null,
      nearbyYardage: null,
      confidence: inconsistentBands.length >= 3 ? 'HIGH' : 'MEDIUM',
      message: `From ${worstBand.band} yards misses run both ways (${(primary.shortMissRate * 100).toFixed(0)}% short / ${(primary.longMissRate * 100).toFixed(0)}% long). This is a contact pattern, not a yardage pattern.`,
      actionMessage: 'Do not adjust clubs first. Lock one swing speed and prioritize low-point contact quality.',
      preRoundMessage: 'Approach misses are both short and long. Pick one club and one tempo today; avoid steering or mid-swing manipulation.',
    };
  }

  const singleBadBand = bands.find(
    b =>
      b.pattern === 'INCONSISTENT' &&
      b.contactVariance >= 0.8 &&
      b.girRate < benchmark - 0.1 &&
      b.shotCount >= 8
  );
  if (singleBadBand) {
    return {
      type: 'CONTACT_INCONSISTENCY',
      band: singleBadBand.band,
      club: singleBadBand.expectedClubs[0] ?? null,
      registeredYardage: singleBadBand.expectedClubs[0] ? clubDistances[singleBadBand.expectedClubs[0]] ?? null : null,
      nearbyClub: null,
      nearbyYardage: null,
      confidence: 'MEDIUM',
      message: `From ${singleBadBand.band} yards misses are split short/long (${(singleBadBand.shortMissRate * 100).toFixed(0)}% short, ${(singleBadBand.longMissRate * 100).toFixed(0)}% long).`,
      actionMessage: 'Treat this as a strike-quality issue before touching yardage settings.',
      preRoundMessage: `From ${singleBadBand.band} yards today, commit to one tempo and one target. The fix is contact consistency.`,
    };
  }

  const shortBands = bands.filter(b => b.pattern === 'SHORT');
  if (shortBands.length >= 2) {
    const primary = bestBandByShotCount(shortBands);
    const club = primary.expectedClubs[0] ?? null;
    const clubYardage = club ? clubDistances[club] ?? null : null;
    return {
      type: 'UNDERCLUBBING',
      band: primary.band,
      club,
      registeredYardage: clubYardage,
      nearbyClub: null,
      nearbyYardage: null,
      confidence: shortBands.length >= 3 ? 'HIGH' : 'MEDIUM',
      message: `Approaches are finishing short across ${shortBands.length} zones, most from ${primary.band} yards.`,
      actionMessage: 'Take one extra club from scoring distances and make a smooth committed swing.',
      preRoundMessage: `You are trending short${club ? ` with ${club}` : ''}. From around ${primary.band} yards today, take one extra club and commit.`,
    };
  }

  const mismatchBand = bands.find(b => b.pattern === 'SHORT' && b.clubMismatch && b.shotCount >= 6);
  if (mismatchBand) {
    const club = mismatchBand.expectedClubs[0] ?? null;
    const clubYardage = club ? clubDistances[club] ?? null : null;
    return {
      type: 'UNDERCLUBBING',
      band: mismatchBand.band,
      club,
      registeredYardage: clubYardage,
      nearbyClub: null,
      nearbyYardage: null,
      confidence: mismatchBand.shotCount >= 10 ? 'HIGH' : 'MEDIUM',
      message: `From ${mismatchBand.band} yards, shots are still short despite registered bag yardages.`,
      actionMessage: `Re-verify ${club ?? 'club'} carry on-course and update My Bag if actual carry is lower.`,
      preRoundMessage: `From ${mismatchBand.band} yards today, go up one club and commit.`,
    };
  }

  const longBands = bands.filter(b => b.pattern === 'LONG');
  if (longBands.length >= 2) {
    const primary = bestBandByShotCount(longBands);
    const club = primary.expectedClubs[0] ?? null;
    const clubYardage = club ? clubDistances[club] ?? null : null;
    return {
      type: 'OVERCLUBBING',
      band: primary.band,
      club,
      registeredYardage: clubYardage,
      nearbyClub: null,
      nearbyYardage: null,
      confidence: longBands.length >= 3 ? 'HIGH' : 'MEDIUM',
      message: `Approaches are finishing long across ${longBands.length} zones.`,
      actionMessage: 'Try one less club with a smooth 90% swing, especially from flyer lies.',
      preRoundMessage: 'Approaches have been long. Consider one less club and a smooth tempo today.',
    };
  }

  return null;
}

export function isFindingRelevantForTier(finding: YardageFinding, tier: HandicapTier): boolean {
  switch (finding.type) {
    case 'BETWEEN_CLUBS_HESITATION':
      return tier === 'SCRATCH' || tier === 'LOW';
    case 'CONTACT_INCONSISTENCY':
      return tier === 'MID' || tier === 'HIGH' || (tier === 'LOW' && finding.confidence === 'HIGH');
    case 'UNDERCLUBBING':
      return tier !== 'BEGINNER';
    case 'OVERCLUBBING':
      return tier === 'SCRATCH' || tier === 'LOW' || tier === 'MID';
    default:
      return false;
  }
}

export function analyzeClubYardages(
  rounds: SavedRound[],
  clubDistances: Record<string, number>,
  handicap?: number | null
): ClubYardageAnalysis {
  const hasYardageData = Object.keys(clubDistances || {}).length >= 3;
  const approachHoleCount = rounds
    .flatMap(r => r.holes || [])
    .filter(hasApproachHoleData).length;
  const hasApproachData = approachHoleCount >= 15;

  const empty: ClubYardageAnalysis = {
    analyzedBands: [],
    primaryFinding: null,
    preRoundAdjustment: null,
    hasYardageData,
    hasApproachData: false,
    systematicallyShort: false,
    systematicallyLong: false,
    hasContactIssue: false,
    hasBetweenClubsIssue: false,
  };
  if (!hasApproachData) return empty;

  const analyzedBands = analyzeBands(rounds, clubDistances || {});
  const primaryFinding = buildPrimaryFinding(analyzedBands, clubDistances || {}, handicap ?? null);
  return {
    analyzedBands,
    primaryFinding,
    preRoundAdjustment: primaryFinding?.preRoundMessage ?? null,
    hasYardageData,
    hasApproachData: true,
    systematicallyShort: analyzedBands.filter(b => b.pattern === 'SHORT').length >= 2,
    systematicallyLong: analyzedBands.filter(b => b.pattern === 'LONG').length >= 2,
    hasContactIssue: analyzedBands.some(b => b.pattern === 'INCONSISTENT'),
    hasBetweenClubsIssue: analyzedBands.some(b => b.pattern === 'GAP_HESITATION'),
  };
}

function buildTempMessages(params: {
  category: TempCategory;
  tempF: number;
  summary: ReturnType<typeof tempAdjustmentSummary>;
  exampleClub: string | null;
  exampleBase: number | null;
  exampleAdjusted: number | null;
  hasClubs: boolean;
  adjustedClubs: AdjustedClubDistance[];
}): { preRoundMessage: string; fullMessage: string } {
  const { category, tempF, summary, exampleClub, exampleBase, exampleAdjusted } = params;
  const diff = exampleBase != null && exampleAdjusted != null ? Math.abs(exampleBase - exampleAdjusted) : null;
  const clubRef = exampleClub && exampleBase ? `your ${exampleClub} (${exampleBase} yds)` : 'your clubs';

  if (category === 'FREEZING') {
    const pre = params.hasClubs && diff != null
      ? `It is ${tempF}F out. ${clubRef} is playing around ${exampleAdjusted} yards today. Take 1 to 2 extra clubs from scoring distances and swing smooth.`
      : `It is ${tempF}F out. Expect ${summary.yardsLow}-${summary.yardsHigh} yards less carry on full shots. Take 1 to 2 extra clubs.`;
    const full = params.hasClubs && diff != null
      ? `At ${tempF}F, registered yardages are losing around ${diff} yards per club. ${exampleClub} plays about ${exampleAdjusted} yards today instead of ${exampleBase}.`
      : `At ${tempF}F, expect ${summary.yardsLow}-${summary.yardsHigh} yards less carry across the bag.`;
    return { preRoundMessage: pre, fullMessage: full };
  }

  if (category === 'COLD') {
    const pre = params.hasClubs && diff != null
      ? `${tempF}F this morning. ${exampleClub} is playing around ${exampleAdjusted} yards, not its usual ${exampleBase}. Take one extra club from scoring distances.`
      : `${tempF}F this morning. Expect ${summary.yardsLow}-${summary.yardsHigh} yards less carry. Take one extra club.`;
    const full = params.hasClubs && diff != null
      ? `At ${tempF}F, carry drops by about ${diff} yards per club. ${exampleClub} is approximately a ${exampleAdjusted}-yard club today.`
      : `At ${tempF}F, cold conditions reduce carry by roughly ${summary.yardsLow}-${summary.yardsHigh} yards.`;
    return { preRoundMessage: pre, fullMessage: full };
  }

  if (category === 'COOL') {
    const pre = params.hasClubs && diff != null
      ? `${tempF}F today. ${exampleClub} is a few yards shorter, around ${exampleAdjusted}. When between clubs, take the longer one.`
      : `${tempF}F today. Expect ${summary.yardsLow}-${summary.yardsHigh} yards less carry. When between clubs, go longer.`;
    const full = params.hasClubs && diff != null
      ? `At ${tempF}F, ${exampleClub} plays around ${exampleAdjusted} instead of ${exampleBase}. Small but meaningful on scoring approaches.`
      : `${tempF}F conditions reduce carry slightly. Favor the longer club on tweener numbers.`;
    return { preRoundMessage: pre, fullMessage: full };
  }

  if (category === 'WARM') {
    const pre = params.hasClubs && diff != null
      ? `${tempF}F today. ${exampleClub} may carry a yard or two farther. Watch for flyers from rough.`
      : `${tempF}F today. Slight carry increase from warm air. Watch for flyers.`;
    return {
      preRoundMessage: pre,
      fullMessage: `In ${tempF}F heat, carry extends slightly. Lie quality and flyers matter more than static yardage.`,
    };
  }

  if (category === 'HOT') {
    const pre = params.hasClubs && diff != null
      ? `${tempF}F out. ${exampleClub} may carry ${diff} yards farther than usual. Stay hydrated and check for flyers.`
      : `${tempF}F out. Hot air extends carry slightly. Stay hydrated and watch for flyers.`;
    return {
      preRoundMessage: pre,
      fullMessage: `At ${tempF}F, carry can extend by ${summary.yardsLow}-${summary.yardsHigh} yards. Hydration and fatigue management become scoring factors.`,
    };
  }

  return { preRoundMessage: '', fullMessage: '' };
}

export function buildTempClubAdvisory(
  tempF: number,
  clubDistances: Record<string, number>,
  topApproachClub?: string | null
): TempClubAdvisory {
  const category = getTempCategory(tempF);
  const summary = tempAdjustmentSummary(tempF);
  const hasClubs = Object.keys(clubDistances || {}).length >= 3;
  const warrantNudge = category !== 'MILD';
  const adjustedClubs: AdjustedClubDistance[] = hasClubs
    ? Object.entries(clubDistances)
      .filter(([club, yardage]) => yardage > 0 && club !== 'Driver' && club !== 'Putter')
      .map(([club, baseYardage]) => {
        const adjustedYardage = adjustYardageForTemp(baseYardage, tempF);
        return {
          club,
          baseYardage,
          adjustedYardage,
          yardageDiff: adjustedYardage - baseYardage,
        };
      })
      .sort((a, b) => b.baseYardage - a.baseYardage)
    : [];

  let exampleClub: string | null = null;
  let exampleBase: number | null = null;
  let exampleAdjusted: number | null = null;

  if (hasClubs) {
    const preferred = topApproachClub && clubDistances[topApproachClub] ? topApproachClub : null;
    const closest = Object.entries(clubDistances)
      .filter(([club, yardage]) => yardage > 0 && club !== 'Driver' && club !== 'Putter')
      .sort((a, b) => Math.abs(a[1] - 150) - Math.abs(b[1] - 150))[0];
    exampleClub = preferred ?? closest?.[0] ?? null;
    exampleBase = exampleClub ? clubDistances[exampleClub] : null;
    exampleAdjusted = exampleBase != null ? adjustYardageForTemp(exampleBase, tempF) : null;
  }

  const { preRoundMessage, fullMessage } = buildTempMessages({
    category,
    tempF,
    summary,
    exampleClub,
    exampleBase,
    exampleAdjusted,
    hasClubs,
    adjustedClubs,
  });

  return {
    warrantNudge,
    category,
    tempF,
    preRoundMessage,
    fullMessage,
    adjustedClubs,
    exampleClub,
    exampleBase,
    exampleAdjusted,
  };
}

export function inferLikelyTemp(
  rounds: SavedRound[],
  currentDate?: Date
): { tempF: number; isInferred: true; confidence: 'LOW' | 'MEDIUM' } | null {
  const now = currentDate ?? new Date();
  const currentMonth = now.getMonth();
  const currentHour = now.getHours();
  const isMorning = currentHour < 11;

  const parseTemp = (value: string | undefined): number | null => {
    if (!value) return null;
    const match = value.match(/-?\d+(\.\d+)?/);
    if (!match) return null;
    const parsed = parseFloat(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const sameMonthRounds = rounds.filter(round => {
    const date = round.date instanceof Date ? round.date : new Date(round.date);
    return date.getMonth() === currentMonth && parseTemp(round.weather?.temp) != null;
  });
  if (sameMonthRounds.length < 3) return null;

  const temps = sameMonthRounds
    .map(round => parseTemp(round.weather?.temp))
    .filter((value): value is number => value != null);
  const avgTemp = temps.reduce((a, b) => a + b, 0) / temps.length;
  const inferredTemp = Math.round(avgTemp + (isMorning ? -6 : 0));

  return {
    tempF: inferredTemp,
    isInferred: true,
    confidence: sameMonthRounds.length >= 6 ? 'MEDIUM' : 'LOW',
  };
}
