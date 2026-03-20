import Storage from './storage';
import { SavedRound, WeatherData } from '../types';
import { isFairwayHit } from '../utils/statChecks';
import {
  analyzeClubYardages,
  buildTempClubAdvisory,
  AdjustedClubDistance,
  FindingType,
  inferLikelyTemp,
  isFindingRelevantForTier,
} from './clubYardageIntelligence';
import { getHandicapTier } from '../utils/handicap';
import { getTempCategory } from '../utils/temperatureAdjustment';
import { analyzeMomentumTransitions } from './momentumMatrix';
import { analyzeConditionsImpact, analyzeTimeOfDay } from './conditionsIntelligence';
import { analyzeTeeStrategy } from './teeStrategyIntelligence';
import { analyzeBunkers } from './bunkerIntelligence';
import { analyzeFatigue } from './fatigueIntelligence';
import { buildCaddieBrief, CaddieBrief } from './courseHoleInsightsService';

export type NudgeBadge = 'Tip' | 'Pre-Round' | 'Example' | 'Your Game' | 'Pro';
export type NudgeCategory =
  | 'putting'
  | 'approach'
  | 'tee'
  | 'strategy'
  | 'course'
  | 'mental';

export interface CoachingNudgeCard {
  id: string;
  category: NudgeCategory;
  title: string;
  body: string;
  badge: NudgeBadge;
  ctaText?: string;
  ctaAction?: 'start_round' | 'import_scorecard' | 'none';
  adjustedClubs?: AdjustedClubDistance[];
  tempF?: number;
  _brief?: CaddieBrief;
}

interface DynamicCardTemplate {
  id: string;
  category: NudgeCategory;
  title: string;
  body: string;
  requiredFields: string[];
  ctaText?: string;
  ctaAction?: 'start_round' | 'import_scorecard' | 'none';
  priority?: 'course' | 'weakness' | 'general' | 'plan';
  condition?: (stats: DerivedStats) => boolean;
}

const LAST_IDS_KEY = '@GolfSum:nudges:lastSessionIds';
const SHOWN_COUNT_KEY = '@GolfSum:nudges:shownCounts';
const LAST_VERIFICATION_NUDGE = '@GolfSum:clubYardage:lastVerificationNudge';
const VERIFICATION_ACKNOWLEDGED = '@GolfSum:clubYardage:verificationAcknowledged';

const GENERIC_CARDS: CoachingNudgeCard[] = [
  { id: 'g1', category: 'putting', title: 'The 3-Putt Problem', body: "A 15 handicap usually has about 4 three-putts a round. Cut even one and the score changes fast.", badge: 'Tip', ctaText: 'Log putts in your next round', ctaAction: 'start_round' },
  { id: 'g2', category: 'putting', title: 'Putt to the Fat Side', body: "On breaking putts, most misses are low. Start it on the high side and let the slope feed it down.", badge: 'Tip', ctaText: 'Log putts in your next round', ctaAction: 'start_round' },
  { id: 'g3', category: 'putting', title: 'Lag Putting Wins', body: "Pros don't try to make every 25-footer. They putt to a 3-foot circle and take two putts. Lag putting is the fastest way to cut strokes.", badge: 'Tip', ctaText: 'Import a scorecard to start tracking', ctaAction: 'import_scorecard' },
  { id: 'g4', category: 'putting', title: 'Speed Over Line', body: 'Most missed putts are speed misses, not line misses. If you leave everything short or race it by, that is your fix.', badge: 'Tip', ctaText: 'Start a round to track your putts', ctaAction: 'start_round' },

  { id: 'g5', category: 'approach', title: "You're Probably Short", body: "Most amateur GIR misses are short. Many golfers underclub by 10 to 20 yards and don't realize it.", badge: 'Tip', ctaText: 'Log GIR miss direction in your next round', ctaAction: 'start_round' },
  { id: 'g6', category: 'approach', title: 'Your Real Distance', body: 'Range distance is not course distance. Wind, lie, elevation, and adrenaline all change carry.', badge: 'Tip', ctaText: 'Log greens in regulation', ctaAction: 'start_round' },
  { id: 'g7', category: 'approach', title: 'Aim for the Middle', body: 'Aim for the middle instead of every flag. More greens, safer misses, fewer big numbers.', badge: 'Tip', ctaText: 'Import 3 scorecards here', ctaAction: 'import_scorecard' },
  { id: 'g8', category: 'approach', title: 'Stop Pin Hunting', body: 'Tucked pins are sucker pins. Play to the middle and take your par.', badge: 'Tip', ctaText: 'Track approach misses to find where strokes leak', ctaAction: 'start_round' },

  { id: 'g9', category: 'tee', title: 'Fairways Win Rounds', body: "A couple more fairways can drop multiple strokes. Miss direction tells you what's happening in your swing.", badge: 'Tip', ctaText: 'Log fairway direction in your next round', ctaAction: 'start_round' },
  { id: 'g10', category: 'tee', title: 'Use the Whole Tee Box', body: 'Set up to your shot shape. If your miss is right, tee on the right side and aim left to widen the hole.', badge: 'Tip', ctaText: 'Log fairways in your next round', ctaAction: 'start_round' },
  { id: 'g11', category: 'tee', title: 'Leave Driver Sometimes', body: 'On shorter par 4s, a fairway wood or hybrid can improve fairway percentage and still leave a scoring approach.', badge: 'Tip', ctaText: 'Track FW% by club to find your best play', ctaAction: 'start_round' },
  { id: 'g12', category: 'tee', title: 'Play for One Miss', body: 'If your miss is one side, build your line around it instead of fighting it all day.', badge: 'Tip', ctaText: 'Import 3 scorecards here', ctaAction: 'import_scorecard' },

  { id: 'g13', category: 'strategy', title: 'Par 5 Opportunity', body: "Par 5s are where scores move. You do not need to reach in two to make birdie or easy par.", badge: 'Tip', ctaText: 'Import 3 rounds here', ctaAction: 'import_scorecard' },
  { id: 'g14', category: 'strategy', title: "You Don't Need Birdies", body: 'The fastest path to lower scores is removing doubles, not chasing birdies.', badge: 'Tip', ctaText: 'Import scorecards to find your trouble holes', ctaAction: 'import_scorecard' },
  { id: 'g15', category: 'strategy', title: 'Warm Up, Even a Little', body: 'Even 5 minutes of putting and chipping before you tee off can save strokes.', badge: 'Tip', ctaText: 'Log hole by hole stats', ctaAction: 'start_round' },
  { id: 'g16', category: 'strategy', title: 'Read Handicap Numbers', body: 'The hardest holes are supposed to be hard. Bogey can be a quality score there.', badge: 'Tip', ctaText: 'Log scores and compare to hole difficulty', ctaAction: 'start_round' },

  { id: 'g17', category: 'course', title: 'Your Toughest Holes', body: 'After a few rounds, you will see which hole types cost you the most shots. That is where the round turns.', badge: 'Tip', ctaText: 'Import 3 rounds here', ctaAction: 'import_scorecard' },
  { id: 'g18', category: 'course', title: 'Penalty Strokes Add Up', body: 'Penalty shots are often hidden score killers. Find where they cluster and choose safer targets there.', badge: 'Tip', ctaText: 'Track rounds to see penalty clusters', ctaAction: 'start_round' },
  { id: 'g19', category: 'course', title: 'Think Backwards', body: 'Plan from the green back to the tee. Pick the approach angle first, then choose the tee club.', badge: 'Tip', ctaText: 'Start a round and track approach results', ctaAction: 'start_round' },
  { id: 'g20', category: 'course', title: 'Pick Your Bail-Out', body: 'Before every approach, define your safe miss. It saves strokes when confidence is low.', badge: 'Tip', ctaText: 'Track GIR misses to learn tendencies', ctaAction: 'start_round' },

  { id: 'g21', category: 'mental', title: 'The Blow-Up Hole', body: 'A bad swing and a hero recovery usually make the number bigger. Take your medicine and move on.', badge: 'Tip', ctaText: 'Log your next round', ctaAction: 'start_round' },
  { id: 'g22', category: 'mental', title: 'Let the Last Hole Go', body: 'Scores often worsen right after a double. Slow down, breathe, and play only the next shot.', badge: 'Tip', ctaText: 'Track your bounce-back rate', ctaAction: 'start_round' },
  { id: 'g23', category: 'mental', title: 'Commit to the Shot', body: 'The worst thing you can do is stand over the ball unsure. Pick a club, pick a target, and go.', badge: 'Tip', ctaText: 'Start a round and play with conviction', ctaAction: 'start_round' },
  { id: 'g24', category: 'mental', title: "You're Closer Than You Think", body: 'Look at your last round. Turn your 3 worst holes into bogeys instead of doubles and the score drops fast.', badge: 'Tip', ctaText: 'Import scorecards to find hidden strokes', ctaAction: 'import_scorecard' },
];

interface DerivedStats {
  roundCount: number;
  numRounds: number;
  avgScore: string;
  bestScore: string;
  bestCourse: string;
  frontAvg: string;
  backAvg: string;
  betterHalf: string;
  weakerHalf: string;
  diff: string;
  par3Avg: string;
  par3Diff: string;
  par3Insight: string;
  par3Target: string;
  par5Avg: string;
  par5Strokes: string;
  avgPutts: string;
  avg3Putts: string;
  puttTrend: string;
  puttStart: string;
  puttRecent: string;
  puttAdvice: string;
  girPutts: string;
  missGirPutts: string;
  upDownInsight: string;
  fwPct: string;
  fwMissDir: string;
  fwMissPct: string;
  fwAimSide: string;
  driverFwPct: string;
  streakFw: string;
  streakTotal: string;
  streakInsight: string;
  girPct: string;
  girMissDir: string;
  girMissPct: string;
  shortMissPct: number;
  par3Gir: string;
  par3GirContext: string;
  scoringGir: string;
  courseName: string;
  previousRoundsAtCourse: number;
  numPlays: string;
  courseAvg: string;
  courseBest: string;
  hardHoles: string;
  nemesisHoles: string;
  nemesisStrokes: string;
  bestHoles: string;
  bestHoleScore: string;
  topApproachClub: string;
  threePuttGoal: string;
  fwGoal: string;
  girGoal: string;
  scoreGoal: string;
  weakestCategory: NudgeCategory;
  yardagePreRound: string | null;
  yardageFindingMsg: string | null;
  yardageFindingAction: string | null;
  yardageFindingType: FindingType | null;
  yardageBand: string | null;
  yardageClub: string | null;
  yardageClubYardage: number | null;
  yardageNearbyClub: string | null;
  yardageNearbyYardage: number | null;
  hasContactIssue: boolean;
  hasBetweenClubsIssue: boolean;
  systematicallyShort: boolean;
  hasClubYardageData: boolean;
  momentumNudge: string | null;
  conditionsNudge: string | null;
  timeOfDayNudge: string | null;
  teeShotStrategyNudge: string | null;
  bunkerNudge: string | null;
  fatigueNudge: string | null;
  tempAdvisoryMessage: string | null;
  tempF: number | null;
  tempCategory: string | null;
  tempAdjustedClubRef: string | null;
  hasTempAdvisory: boolean;
  tempAdjustedClubs: AdjustedClubDistance[];
}

const DYNAMIC_TEMPLATES: DynamicCardTemplate[] = [
  { id: 'd1', category: 'strategy', title: 'Scoring Trend', body: 'Over {numRounds} rounds, you average {avgScore}. Best is {bestScore} at {bestCourse}. Cut doubles first today.', requiredFields: ['avgScore', 'bestScore'], priority: 'general' },
  { id: 'd2', category: 'strategy', title: 'Front 9 vs Back 9', body: 'You average {frontAvg} on the front and {backAvg} on the back. Your {betterHalf} is better by {diff}. Stay patient on the {weakerHalf}.', requiredFields: ['frontAvg', 'backAvg', 'diff'], priority: 'general' },
  { id: 'd3', category: 'strategy', title: 'Par 3 Focus', body: "You're averaging {par3Avg} on par 3s ({par3Diff} to par). {par3Insight} Goal today: par at least {par3Target} par 3s.", requiredFields: ['par3Avg', 'par3Diff'], priority: 'general' },
  { id: 'd4', category: 'strategy', title: 'Par 5 Opportunity', body: 'Your par 5 average is {par5Avg}. You are giving away {par5Strokes} strokes there each round. Lay up to your best wedge distance.', requiredFields: ['par5Avg'], priority: 'weakness' },
  { id: 'd5', category: 'putting', title: 'Putt Count', body: "You average {avgPutts} putts with {avg3Putts} three-putts. Spend 10 minutes on lag putting before you tee off.", requiredFields: ['avgPutts'], priority: 'weakness' },
  { id: 'd6', category: 'putting', title: 'Putting Trend', body: 'Your putting has {puttTrend} over {numRounds} rounds, moving from {puttStart} to {puttRecent}. {puttAdvice}', requiredFields: ['puttTrend', 'puttStart', 'puttRecent'], priority: 'general' },
  { id: 'd7', category: 'putting', title: 'GIR + Putts Connection', body: 'When you hit greens you average {girPutts} putts. When you miss, {missGirPutts}. Your short game {upDownInsight}.', requiredFields: ['girPutts', 'missGirPutts'], priority: 'general' },
  { id: 'd8', category: 'tee', title: 'Fairway Miss', body: 'You hit {fwPct}% of fairways. Main miss is {fwMissDir} at {fwMissPct}%. Favor the {fwAimSide} side today.', requiredFields: ['fwPct'], priority: 'weakness' },
  { id: 'd9', category: 'tee', title: 'Driver Decision', body: 'Your driver fairway rate is {driverFwPct}%. On short par 4s, consider 3-wood or hybrid and play from grass.', requiredFields: ['driverFwPct'], priority: 'general' },
  { id: 'd10', category: 'tee', title: 'Tee Shot Confidence', body: 'You hit {streakFw} of your last {streakTotal} fairways. {streakInsight} Pick a precise target on every tee.', requiredFields: ['streakFw', 'streakTotal'], priority: 'general' },
  { id: 'd11', category: 'approach', title: 'Green Miss', body: 'You hit {girPct}% of greens. Top miss is {girMissDir} at {girMissPct}%. One more club and middle of the green today.', requiredFields: ['girPct'], priority: 'weakness' },
  { id: 'd12', category: 'approach', title: 'You Keep Coming Up Short', body: '{shortMissPct}% of your GIR misses are short. When between clubs today, take the longer one.', requiredFields: ['shortMissPct'], priority: 'weakness', condition: (stats) => stats.shortMissPct > 40 },
  {
    id: 'dy1',
    category: 'approach',
    title: 'Between Clubs at {yardageBand} Yards',
    body: '{yardagePreRound}',
    requiredFields: ['yardagePreRound', 'yardageBand'],
    priority: 'weakness',
    condition: (stats) =>
      stats.yardageFindingType === 'BETWEEN_CLUBS_HESITATION' &&
      !!stats.yardagePreRound,
  },
  {
    id: 'dy2',
    category: 'approach',
    title: 'Focus on Contact Today, Not Club Selection',
    body: '{yardagePreRound}',
    requiredFields: ['yardagePreRound'],
    priority: 'weakness',
    condition: (stats) =>
      stats.yardageFindingType === 'CONTACT_INCONSISTENCY' &&
      !!stats.yardagePreRound,
  },
  {
    id: 'dy3',
    category: 'approach',
    title: 'Take More Club From {yardageBand} Yards',
    body: '{yardagePreRound}',
    requiredFields: ['yardagePreRound', 'yardageBand'],
    priority: 'weakness',
    condition: (stats) =>
      stats.yardageFindingType === 'UNDERCLUBBING' &&
      !!stats.yardagePreRound,
  },
  {
    id: 'dy4',
    category: 'approach',
    title: 'Your Approaches Are Running Long',
    body: '{yardagePreRound}',
    requiredFields: ['yardagePreRound'],
    priority: 'weakness',
    condition: (stats) =>
      stats.yardageFindingType === 'OVERCLUBBING' &&
      !!stats.yardagePreRound,
  },
  {
    id: 'dy5',
    category: 'approach',
    title: 'You Keep Missing Short',
    body: '{shortMissPct}% of your approach misses are short. One more club is the fastest fix. Add your club distances in My Bag for tighter numbers.',
    requiredFields: ['shortMissPct'],
    priority: 'weakness',
    condition: (stats) =>
      !stats.hasClubYardageData && stats.systematicallyShort,
  },
  {
    id: 'dy6',
    category: 'approach',
    title: 'Check Your Distances',
    body: 'You have been coming up short consistently. Club distances change with equipment wear, swing changes, and season. A quick test on a flat hole with known markers will sharpen club selection.',
    requiredFields: [],
    ctaText: 'I will check today',
    ctaAction: 'none',
    priority: 'weakness',
    condition: (stats) => stats.systematicallyShort && stats.hasClubYardageData,
  },
  {
    id: 'dt1',
    category: 'approach',
    title: 'Club Distances in These Conditions',
    body: '{tempAdvisoryMessage}',
    requiredFields: ['tempAdvisoryMessage'],
    priority: 'weakness',
    condition: (stats) => stats.hasTempAdvisory && !!stats.tempAdvisoryMessage,
  },
  {
    id: 'dm1',
    category: 'mental',
    title: 'Next Hole',
    body: '{momentumNudge}',
    requiredFields: ['momentumNudge'],
    priority: 'weakness',
    condition: (stats) => !!stats.momentumNudge,
  },
  {
    id: 'dc1',
    category: 'strategy',
    title: 'Conditions Impact',
    body: '{conditionsNudge}',
    requiredFields: ['conditionsNudge'],
    priority: 'general',
    condition: (stats) => !!stats.conditionsNudge,
  },
  {
    id: 'dc2',
    category: 'mental',
    title: 'Tee Time',
    body: '{timeOfDayNudge}',
    requiredFields: ['timeOfDayNudge'],
    priority: 'general',
    condition: (stats) => !!stats.timeOfDayNudge,
  },
  {
    id: 'ds1',
    category: 'strategy',
    title: 'Best Tee Club',
    body: '{teeShotStrategyNudge}',
    requiredFields: ['teeShotStrategyNudge'],
    priority: 'weakness',
    condition: (stats) => !!stats.teeShotStrategyNudge,
  },
  {
    id: 'db1',
    category: 'approach',
    title: 'Bunkers',
    body: '{bunkerNudge}',
    requiredFields: ['bunkerNudge'],
    priority: 'weakness',
    condition: (stats) => !!stats.bunkerNudge,
  },
  {
    id: 'df1',
    category: 'mental',
    title: 'Round Rhythm',
    body: '{fatigueNudge}',
    requiredFields: ['fatigueNudge'],
    priority: 'weakness',
    condition: (stats) => !!stats.fatigueNudge,
  },
  { id: 'd13', category: 'approach', title: 'Par 3 Approach', body: 'Your par 3 GIR is {par3Gir}% ({par3GirContext}). Pick center green and commit to a smooth swing.', requiredFields: ['par3Gir'], priority: 'general' },
  { id: 'd14', category: 'approach', title: 'Scoring Zone', body: 'From inside 150, your estimated GIR is {scoringGir}%. That is your scoring zone today. Trust distance and commit.', requiredFields: ['scoringGir'], priority: 'general' },
  { id: 'd15', category: 'course', title: 'You Know This Course', body: 'Your {numPlays} rounds at {courseName} average {courseAvg}. Best is {courseBest}. Plan safe bogeys on holes {hardHoles}.', requiredFields: ['courseName', 'numPlays'], priority: 'course', condition: (stats) => stats.previousRoundsAtCourse > 0 },
  { id: 'd16', category: 'course', title: 'Your Nemesis Holes', body: 'At {courseName}, holes {nemesisHoles} cost about {nemesisStrokes} extra strokes. Play those holes safe today.', requiredFields: ['courseName', 'nemesisHoles'], priority: 'course', condition: (stats) => stats.previousRoundsAtCourse >= 2 },
  { id: 'd17', category: 'course', title: 'Your Best Holes Here', body: 'At {courseName}, holes {bestHoles} are your scoring chances. You average {bestHoleScore} there. Be aggressive with good numbers.', requiredFields: ['courseName', 'bestHoles'], priority: 'course', condition: (stats) => stats.previousRoundsAtCourse >= 2 },
  { id: 'd18', category: 'strategy', title: 'Warm-Up Plan', body: 'Warm-up: 10 lag putts, 5 chips to different pins, 5 smooth swings with your {topApproachClub}. Keep driver for last.', requiredFields: ['topApproachClub'], priority: 'plan' },
  { id: 'd19', category: 'strategy', title: 'Three Goals Today', body: 'Keep 3-putts under {threePuttGoal}, hit {fwGoal}+ fairways, and hit {girGoal}+ greens. That puts you near {scoreGoal}.', requiredFields: ['threePuttGoal', 'fwGoal', 'girGoal'], priority: 'plan' },
  { id: 'd20', category: 'strategy', title: 'After The Round', body: 'Snap your scorecard after the round. It will show how this round stacks up against your usual numbers.', requiredFields: [], ctaText: 'Import your scorecard', ctaAction: 'import_scorecard', priority: 'plan' },
];

const interpolate = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{([^}]+)\}/g, (_, key: string) => String(values[key] ?? ''));

const toNumber = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const buildDerivedStats = (
  rounds: SavedRound[],
  clubDistances: Record<string, number>,
  currentWeather: Partial<WeatherData> | null,
  handicap: number | null,
  plannedCourseName?: string | null
): DerivedStats => {
  const sorted = [...rounds].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const played = sorted.filter(r => toNumber(r.score) > 0);
  const numRounds = played.length;
  const avgScoreNum = numRounds ? played.reduce((sum, r) => sum + toNumber(r.score), 0) / numRounds : 0;
  const best = numRounds ? played.reduce((bestRound, round) => (toNumber(round.score) < toNumber(bestRound.score) ? round : bestRound), played[0]) : null;

  const halves = played.map((r) => {
    const holes = r.holes || [];
    if (holes.length >= 18) {
      const numberedHoles = holes
        .filter((h) => Number.isFinite(Number(h.number)))
        .map((h) => ({ ...h, _holeNumber: Number(h.number) }))
        .sort((a, b) => a._holeNumber - b._holeNumber);
      const frontHoles = numberedHoles.filter((h) => h._holeNumber >= 1 && h._holeNumber <= 9);
      const backHoles = numberedHoles.filter((h) => h._holeNumber >= 10 && h._holeNumber <= 18);
      if (frontHoles.length === 9 && backHoles.length === 9) {
        return {
          front: frontHoles.reduce((sum, h) => sum + toNumber(h.score), 0),
          back: backHoles.reduce((sum, h) => sum + toNumber(h.score), 0),
        };
      }
      const fallbackFront = holes.slice(0, 9).reduce((sum, h) => sum + toNumber(h.score), 0);
      const fallbackBack = holes.slice(9, 18).reduce((sum, h) => sum + toNumber(h.score), 0);
      return { front: fallbackFront, back: fallbackBack };
    }
    const score = toNumber(r.score);
    return { front: Math.round(score / 2), back: score - Math.round(score / 2) };
  });
  const frontAvgNum = halves.length ? halves.reduce((s, h) => s + h.front, 0) / halves.length : 0;
  const backAvgNum = halves.length ? halves.reduce((s, h) => s + h.back, 0) / halves.length : 0;
  const betterHalf = frontAvgNum <= backAvgNum ? 'front' : 'back';
  const weakerHalf = betterHalf === 'front' ? 'back' : 'front';

  const allHoles = played.flatMap(r => r.holes || []);
  const par3Holes = allHoles.filter(h => h.par === 3 && toNumber(h.score) > 0);
  const par5Holes = allHoles.filter(h => h.par === 5 && toNumber(h.score) > 0);
  const par3AvgNum = par3Holes.length ? par3Holes.reduce((s, h) => s + toNumber(h.score), 0) / par3Holes.length : 0;
  const par5AvgNum = par5Holes.length ? par5Holes.reduce((s, h) => s + toNumber(h.score), 0) / par5Holes.length : 0;
  const par5HolesPerRound = numRounds > 0 ? par5Holes.length / numRounds : 0;

  const puttRounds = played.filter(r => toNumber(r.stats?.putts) > 0);
  const avgPuttsNum = puttRounds.length ? puttRounds.reduce((s, r) => s + toNumber(r.stats?.putts), 0) / puttRounds.length : 0;
  const threePuttEstimate = Math.max(0, Math.round((avgPuttsNum - 30) / 2));
  const puttWindowSize = Math.min(3, puttRounds.length);
  const recentPuttAvg = puttWindowSize
    ? puttRounds.slice(0, puttWindowSize).reduce((s, r) => s + toNumber(r.stats?.putts), 0) / puttWindowSize
    : 0;
  const startPuttAvg = puttWindowSize
    ? puttRounds.slice(-puttWindowSize).reduce((s, r) => s + toNumber(r.stats?.putts), 0) / puttWindowSize
    : 0;
  const puttTrendDelta = recentPuttAvg - startPuttAvg;
  const puttTrend = puttWindowSize >= 2
    ? (puttTrendDelta <= -0.3 ? 'improved' : puttTrendDelta >= 0.3 ? 'slipped' : 'stayed steady')
    : 'stayed steady';

  const fairwaysHit = played.reduce((s, r) => s + toNumber(r.stats?.fairways), 0);
  const fairwaysPossible = played.reduce((s, r) => s + toNumber(r.stats?.fairwaysPossible), 0);
  const fwPctNum = fairwaysPossible > 0 ? (fairwaysHit / fairwaysPossible) * 100 : 0;
  const greensHit = played.reduce((s, r) => s + toNumber(r.stats?.greens), 0);
  const greensPossible = played.reduce((s, r) => s + toNumber(r.stats?.greensPossible), 0);
  const girPctNum = greensPossible > 0 ? (greensHit / greensPossible) * 100 : 0;
  const girPuttHoles = allHoles.filter((h) => h.greenHit === true && toNumber(h.putts) >= 0);
  const missGirPuttHoles = allHoles.filter((h) => h.greenHit !== null && h.greenHit !== undefined && h.greenHit !== true && toNumber(h.putts) >= 0);
  const avgGirPuttsNum = girPuttHoles.length
    ? girPuttHoles.reduce((s, h) => s + toNumber(h.putts), 0) / girPuttHoles.length
    : null;
  const avgMissGirPuttsNum = missGirPuttHoles.length
    ? missGirPuttHoles.reduce((s, h) => s + toNumber(h.putts), 0) / missGirPuttHoles.length
    : null;

  const directionalFairways = allHoles
    .map(h => h.fairwayHit)
    .filter((v): v is 'left' | 'right' | 'short' | 'long' | 'double-left' | 'double-right' => typeof v === 'string');
  const directionalGreens = allHoles
    .map(h => h.greenHit)
    .filter((v): v is 'left' | 'right' | 'short' | 'long' => typeof v === 'string');
  const countBy = <T extends string>(arr: T[]) => arr.reduce((acc, cur) => ({ ...acc, [cur]: (acc[cur] || 0) + 1 }), {} as Record<T, number>);
  const fwDirCount = countBy(directionalFairways);
  const girDirCount = countBy(directionalGreens);
  const topDir = (map: Record<string, number>, fallback: string) => {
    const entries = Object.entries(map);
    if (!entries.length) return fallback;
    return entries.sort((a, b) => b[1] - a[1])[0][0];
  };
  const fwMissDir = topDir(fwDirCount, 'right');
  const girMissDir = topDir(girDirCount, 'short');
  const fwMissPctNum = directionalFairways.length ? ((((fwDirCount as Record<string, number>)[fwMissDir] || 0) / directionalFairways.length) * 100) : 0;
  const girMissPctNum = directionalGreens.length ? ((((girDirCount as Record<string, number>)[girMissDir] || 0) / directionalGreens.length) * 100) : 0;
  const shortMissPct = directionalGreens.length ? Math.round((((girDirCount.short || 0) / directionalGreens.length) * 100)) : 0;

  const targetCourse = (plannedCourseName || '').trim().toLowerCase();
  const courseRounds = targetCourse
    ? played.filter(r => (r.courseName || '').trim().toLowerCase() === targetCourse)
    : [];
  const courseAvgNum = courseRounds.length ? courseRounds.reduce((s, r) => s + toNumber(r.score), 0) / courseRounds.length : 0;
  const courseBestNum = courseRounds.length ? Math.min(...courseRounds.map(r => toNumber(r.score))) : 0;

  const holeMap: Record<number, number[]> = {};
  courseRounds.forEach((r) => {
    (r.holes || []).forEach((h) => {
      if (!holeMap[h.number]) holeMap[h.number] = [];
      if (toNumber(h.score) > 0) holeMap[h.number].push(toNumber(h.score) - toNumber(h.par));
    });
  });
  const holeEntries = Object.entries(holeMap).map(([hole, diffs]) => ({ hole: Number(hole), avgDiff: diffs.reduce((s, d) => s + d, 0) / diffs.length }));
  const hardHoles = holeEntries.sort((a, b) => b.avgDiff - a.avgDiff).slice(0, 3).map(e => e.hole).join(', ') || 'the toughest holes';
  const bestHoles = holeEntries.sort((a, b) => a.avgDiff - b.avgDiff).slice(0, 3).map(e => e.hole).join(', ') || 'your strongest holes';
  const nemesisAvg = holeEntries.length ? holeEntries.sort((a, b) => b.avgDiff - a.avgDiff).slice(0, 3).reduce((s, h) => s + h.avgDiff, 0) / 3 : 0;
  const bestHoleAvg = holeEntries.length ? holeEntries.sort((a, b) => a.avgDiff - b.avgDiff).slice(0, 3).reduce((s, h) => s + h.avgDiff, 0) / 3 : 0;

  const approachClubCount: Record<string, number> = {};
  let driverFwKnown = 0;
  let driverFwHit = 0;
  allHoles.forEach((h) => {
    if (h.approachClub) {
      approachClubCount[h.approachClub] = (approachClubCount[h.approachClub] || 0) + 1;
    }
    const teeClub = String(h.teeClub || '').trim().toLowerCase();
    if ((teeClub === 'driver' || teeClub === 'dr') && (h.fairwayHit !== null && h.fairwayHit !== undefined)) {
      driverFwKnown += 1;
      if (isFairwayHit(h.fairwayHit)) {
        driverFwHit += 1;
      }
    }
  });
  const topApproachClub = Object.entries(approachClubCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '8-iron';
  const driverFwPctNum = driverFwKnown > 0 ? (driverFwHit / driverFwKnown) * 100 : null;

  const avgParNum = allHoles.length ? allHoles.reduce((s, h) => s + toNumber(h.par), 0) / allHoles.length : 4;
  const scoreToParNum = avgScoreNum - (avgParNum * 18);
  const weaknesses = [
    { category: 'tee' as NudgeCategory, value: fwPctNum },
    { category: 'approach' as NudgeCategory, value: girPctNum },
    { category: 'putting' as NudgeCategory, value: 100 - Math.max(0, (avgPuttsNum - 28) * 4) },
    { category: 'strategy' as NudgeCategory, value: 100 - Math.max(0, scoreToParNum * 3) },
  ];
  const weakestCategory = weaknesses.sort((a, b) => a.value - b.value)[0].category;
  const yardageAnalysis = analyzeClubYardages(played, clubDistances, handicap);
  const tier = getHandicapTier(handicap);
  const finding = yardageAnalysis.primaryFinding;
  const relevantFinding = finding && isFindingRelevantForTier(finding, tier) ? finding : null;

  let tempAdvisoryMessage: string | null = null;
  let tempF: number | null = null;
  let tempCategory: string | null = null;
  let tempAdjustedClubRef: string | null = null;
  let hasTempAdvisory = false;
  let tempAdjustedClubs: AdjustedClubDistance[] = [];

  const parseTemp = (value?: string | null): number | null => {
    if (!value) return null;
    const parsed = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  };

  const directTemp = parseTemp(currentWeather?.temp);
  if (directTemp != null) {
    const advisory = buildTempClubAdvisory(directTemp, clubDistances, topApproachClub);
    if (advisory.warrantNudge) {
      tempF = directTemp;
      tempCategory = advisory.category;
      tempAdvisoryMessage = advisory.preRoundMessage;
      hasTempAdvisory = true;
      tempAdjustedClubs = advisory.adjustedClubs.slice(0, 5);
      if (advisory.exampleClub && advisory.exampleAdjusted != null) {
        tempAdjustedClubRef = `${advisory.exampleClub} plays as ${advisory.exampleAdjusted} yds today`;
      }
    }
  }

  if (!hasTempAdvisory && !currentWeather && played.length >= 5) {
    const inferred = inferLikelyTemp(played);
    if (inferred) {
      const inferredCategory = getTempCategory(inferred.tempF);
      if (inferredCategory === 'COLD' || inferredCategory === 'FREEZING') {
        const advisory = buildTempClubAdvisory(inferred.tempF, clubDistances, topApproachClub);
        if (advisory.warrantNudge) {
          const caveat = inferred.confidence === 'LOW'
            ? ' (based on your typical rounds this time of year)'
            : ' (based on your recent rounds this month)';
          tempF = inferred.tempF;
          tempCategory = inferredCategory;
          tempAdvisoryMessage = advisory.preRoundMessage + caveat;
          hasTempAdvisory = true;
          tempAdjustedClubs = advisory.adjustedClubs.slice(0, 5);
          if (advisory.exampleClub && advisory.exampleAdjusted != null) {
            tempAdjustedClubRef = `${advisory.exampleClub} plays as ${advisory.exampleAdjusted} yds today`;
          }
        }
      }
    }
  }
  const momentum = analyzeMomentumTransitions(played);
  const momentumNudge = momentum.primaryPattern
    && (momentum.primaryPattern.type === 'BIRDIE_KILLS_NEXT'
      || momentum.primaryPattern.type === 'DOUBLE_COMPOUNDS'
      || momentum.primaryPattern.type === 'BOGEY_CHAINS')
    ? momentum.primaryPattern.actionable
    : null;
  const conditionsFinding = analyzeConditionsImpact(played);
  const timeOfDay = analyzeTimeOfDay(played);
  const teeStrategy = analyzeTeeStrategy(played);
  const bunker = analyzeBunkers(played, handicap);
  const fatigue = analyzeFatigue(played);
  const teeShotStrategyNudge = teeStrategy.primaryFinding?.preRoundMessage ?? null;
  const bunkerNudge = bunker.primaryFinding?.preRoundMessage ?? null;
  const fatigueNudge =
    fatigue.primaryFinding &&
    fatigue.fadePattern !== 'CONSISTENT' &&
    fatigue.fadePattern !== 'CLOSING_STRONG'
      ? fatigue.primaryFinding.preRoundMessage
      : null;

  return {
    roundCount: numRounds,
    numRounds: Math.max(numRounds, 1),
    avgScore: avgScoreNum ? avgScoreNum.toFixed(1) : '—',
    bestScore: best ? String(toNumber(best.score)) : '—',
    bestCourse: best?.courseName || 'your best round',
    frontAvg: frontAvgNum ? frontAvgNum.toFixed(1) : '—',
    backAvg: backAvgNum ? backAvgNum.toFixed(1) : '—',
    betterHalf,
    weakerHalf,
    diff: Math.abs(frontAvgNum - backAvgNum).toFixed(1),
    par3Avg: par3AvgNum ? par3AvgNum.toFixed(2) : '—',
    par3Diff: par3AvgNum ? (par3AvgNum - 3).toFixed(2) : '—',
    par3Insight: par3AvgNum > 3.4 ? 'Par 3s are costing strokes right now.' : 'Par 3 play is stable.',
    par3Target: par3AvgNum > 3.5 ? '1' : '2',
    par5Avg: par5AvgNum ? par5AvgNum.toFixed(2) : '—',
    par5Strokes: par5AvgNum ? Math.max(0, (par5AvgNum - 5) * par5HolesPerRound).toFixed(1) : '—',
    avgPutts: avgPuttsNum ? avgPuttsNum.toFixed(1) : '—',
    avg3Putts: String(threePuttEstimate),
    puttTrend,
    puttStart: puttWindowSize ? startPuttAvg.toFixed(1) : '—',
    puttRecent: puttWindowSize ? recentPuttAvg.toFixed(1) : '—',
    puttAdvice: avgPuttsNum >= 33 ? 'Prioritize speed control first.' : 'Keep your routine and commit to pace.',
    girPutts: avgGirPuttsNum !== null ? avgGirPuttsNum.toFixed(2) : '—',
    missGirPutts: avgMissGirPuttsNum !== null ? avgMissGirPuttsNum.toFixed(2) : '—',
    upDownInsight: 'has room to improve',
    fwPct: fwPctNum ? fwPctNum.toFixed(0) : '—',
    fwMissDir,
    fwMissPct: fwMissPctNum ? fwMissPctNum.toFixed(0) : '—',
    fwAimSide: fwMissDir.includes('right') ? 'left' : 'right',
    driverFwPct: driverFwPctNum !== null ? driverFwPctNum.toFixed(0) : '—',
    streakFw: String(Math.max(0, Math.round((fwPctNum / 100) * 6))),
    streakTotal: '6',
    streakInsight: fwPctNum >= 50 ? 'Build on the confidence.' : 'Simple targets will help.',
    girPct: girPctNum ? girPctNum.toFixed(0) : '—',
    girMissDir,
    girMissPct: girMissPctNum ? girMissPctNum.toFixed(0) : '—',
    shortMissPct,
    par3Gir: girPctNum ? Math.max(10, girPctNum - 5).toFixed(0) : '—',
    par3GirContext: girPctNum >= 40 ? 'above your baseline' : 'below your baseline',
    scoringGir: girPctNum ? Math.min(85, girPctNum + 8).toFixed(0) : '—',
    courseName: plannedCourseName || 'this course',
    previousRoundsAtCourse: courseRounds.length,
    numPlays: String(courseRounds.length),
    courseAvg: courseAvgNum ? courseAvgNum.toFixed(1) : '—',
    courseBest: courseBestNum ? String(courseBestNum) : '—',
    hardHoles,
    nemesisHoles: hardHoles,
    nemesisStrokes: nemesisAvg ? nemesisAvg.toFixed(1) : '—',
    bestHoles,
    bestHoleScore: bestHoleAvg ? bestHoleAvg.toFixed(1) : '—',
    topApproachClub,
    threePuttGoal: String(Math.max(1, threePuttEstimate)),
    fwGoal: String(Math.max(5, Math.round((fwPctNum / 100) * 14))),
    girGoal: String(Math.max(4, Math.round((girPctNum / 100) * 18))),
    scoreGoal: avgScoreNum ? String(Math.max(72, Math.round(avgScoreNum - 2))) : '90',
    weakestCategory,
    yardagePreRound: relevantFinding?.preRoundMessage ?? null,
    yardageFindingMsg: relevantFinding?.message ?? null,
    yardageFindingAction: relevantFinding?.actionMessage ?? null,
    yardageFindingType: relevantFinding?.type ?? null,
    yardageBand: relevantFinding?.band ?? null,
    yardageClub: relevantFinding?.club ?? null,
    yardageClubYardage: relevantFinding?.registeredYardage ?? null,
    yardageNearbyClub: relevantFinding?.nearbyClub ?? null,
    yardageNearbyYardage: relevantFinding?.nearbyYardage ?? null,
    hasContactIssue: yardageAnalysis.hasContactIssue,
    hasBetweenClubsIssue: yardageAnalysis.hasBetweenClubsIssue,
    systematicallyShort: yardageAnalysis.systematicallyShort,
    hasClubYardageData: yardageAnalysis.hasYardageData,
    momentumNudge,
    conditionsNudge: conditionsFinding?.nudgeMessage ?? null,
    timeOfDayNudge: timeOfDay.finding?.nudgeMessage ?? null,
    teeShotStrategyNudge,
    bunkerNudge,
    fatigueNudge,
    tempAdvisoryMessage,
    tempF,
    tempCategory,
    tempAdjustedClubRef,
    hasTempAdvisory,
    tempAdjustedClubs,
  };
};

const pickWithoutImmediateRepeat = async (candidates: CoachingNudgeCard[], count: number) => {
  const lastIdsRaw = await Storage.getItem(LAST_IDS_KEY);
  const countsRaw = await Storage.getItem(SHOWN_COUNT_KEY);
  const lastIds: string[] = lastIdsRaw ? JSON.parse(lastIdsRaw) : [];
  const shownCounts: Record<string, number> = countsRaw ? JSON.parse(countsRaw) : {};

  const sortByRotation = (cards: CoachingNudgeCard[]) =>
    [...cards].sort((a, b) => {
      const countDiff = (shownCounts[a.id] || 0) - (shownCounts[b.id] || 0);
      if (countDiff !== 0) return countDiff;
      return Math.random() - 0.5;
    });

  let pool = candidates.filter(card => !lastIds.includes(card.id));
  if (pool.length < count) {
    pool = candidates;
  }

  const picked = sortByRotation(pool).slice(0, count);
  picked.forEach(card => {
    shownCounts[card.id] = (shownCounts[card.id] || 0) + 1;
  });

  await Storage.setItem(LAST_IDS_KEY, JSON.stringify(picked.map(card => card.id)));
  await Storage.setItem(SHOWN_COUNT_KEY, JSON.stringify(shownCounts));

  return picked;
};

const buildDynamicCards = async (stats: DerivedStats): Promise<CoachingNudgeCard[]> => {
  let templates = DYNAMIC_TEMPLATES;

  if (stats.hasClubYardageData || stats.systematicallyShort || stats.hasContactIssue) {
    templates = templates.filter(template => template.id !== 'd12');
  }

  if (stats.yardageFindingType) {
    templates = templates.filter(template => template.id !== 'd11');
  }

  const now = Date.now();
  const lastVerificationRaw = await Storage.getItem(LAST_VERIFICATION_NUDGE);
  const acknowledgedRaw = await Storage.getItem(VERIFICATION_ACKNOWLEDGED);
  const lastVerificationTs = lastVerificationRaw ? new Date(lastVerificationRaw).getTime() : 0;
  const acknowledgedTs = acknowledgedRaw ? new Date(acknowledgedRaw).getTime() : 0;
  const dayMs = 24 * 60 * 60 * 1000;
  const canShowVerificationNudge =
    (!lastVerificationTs || now - lastVerificationTs > dayMs * 30) &&
    (!acknowledgedTs || now - acknowledgedTs > dayMs * 30);
  if (!canShowVerificationNudge) {
    templates = templates.filter(template => template.id !== 'dy6');
  }

  const cards = templates
    .filter(template => !template.condition || template.condition(stats))
    .filter(template => template.requiredFields.every((field) => {
      const value = (stats as unknown as Record<string, unknown>)[field];
      return value !== undefined && value !== null && String(value).trim() !== '' && String(value).trim() !== '—';
    }))
    .map((template) => {
      const base = {
        id: template.id,
        category: template.category,
        title: template.title,
        body: interpolate(template.body, stats as unknown as Record<string, string | number>),
        badge: 'Your Game' as NudgeBadge,
        ctaText: template.ctaText,
        ctaAction: template.ctaAction || 'none',
        _priority: template.priority || 'general',
      } as CoachingNudgeCard & { _priority: string };

      if (template.id === 'dt1') {
        base.badge = 'Pre-Round';
        base.adjustedClubs = stats.tempAdjustedClubs.slice(0, 5);
        base.tempF = stats.tempF ?? undefined;
      }

      return base;
    })
    .sort((a, b) => {
      const rank = (priority?: string) => {
        if (priority === 'course') return 0;
        if (priority === 'weakness') return 1;
        if (priority === 'general') return 2;
        if (priority === 'plan') return 3;
        return 4;
      };
      return rank((a as any)._priority) - rank((b as any)._priority);
    });

  const weaknessFirst = cards.filter(card => card.category === stats.weakestCategory);
  const others = cards.filter(card => card.category !== stats.weakestCategory);
  const ordered = [...weaknessFirst, ...others];
  const mapped = ordered.map(({ _priority, ...card }) => card as CoachingNudgeCard);

  if (mapped.some(card => card.id === 'dy6')) {
    await Storage.setItem(LAST_VERIFICATION_NUDGE, new Date().toISOString());
  }

  return mapped;
};

export async function getPlayTabNudges(
  rounds: SavedRound[],
  plannedCourseName?: string | null,
  currentWeather: Partial<WeatherData> | null = null,
  clubDistances: Record<string, number> = {},
  handicap: number | null = null
): Promise<CoachingNudgeCard[]> {
  const roundCount = rounds.filter(r => toNumber(r.score) > 0).length;
  const desiredCount = roundCount === 0 ? 5 : roundCount < 3 ? 4 : 5;

  if (roundCount === 0) {
    return pickWithoutImmediateRepeat(GENERIC_CARDS, desiredCount);
  }

  const stats = buildDerivedStats(rounds, clubDistances, currentWeather, handicap, plannedCourseName);
  const dynamic = await buildDynamicCards(stats);
  const plannedNameNorm = (plannedCourseName || '').trim().toLowerCase();
  if (plannedNameNorm) {
    const matched = rounds
      .filter((r) => !!r.courseName && r.courseName.toLowerCase().includes(plannedNameNorm))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    const courseId = matched?.courseId ?? null;
    if (courseId) {
      const brief = await buildCaddieBrief(courseId, plannedCourseName || matched.courseName, rounds, handicap);
      if (brief && brief.roundsPlayed >= 1) {
        dynamic.unshift({
          id: 'caddie-brief',
          category: 'course',
          badge: 'Pre-Round',
          title: brief.courseName,
          body: brief.gamePlan.oneLiner || 'Course plan is ready.',
          _brief: brief,
        });
      }
    }
  }

  if (roundCount < 3) {
    const caddieCard = dynamic.find((card) => !!card._brief);
    const oneDynamic = dynamic.slice(0, 1);
    const generic = await pickWithoutImmediateRepeat(
      GENERIC_CARDS.filter(card => !oneDynamic.some(d => d.category === card.category)),
      Math.max(0, desiredCount - oneDynamic.length),
    );
    const base = [...oneDynamic, ...generic];
    if (caddieCard) {
      return [caddieCard, ...base.filter((card) => card.id !== caddieCard.id)].slice(0, desiredCount);
    }
    return base;
  }

  let candidates = dynamic;
  if (stats.previousRoundsAtCourse > 0) {
    const courseCards = dynamic.filter(card => card.category === 'course');
    const otherCards = dynamic.filter(card => card.category !== 'course');
    candidates = [...courseCards, ...otherCards];
  }

  const withPlanAnchor = [...candidates];
  const hasPlanEnding = withPlanAnchor.some(card => card.id === 'd18' || card.id === 'd19');
  if (!hasPlanEnding) {
    withPlanAnchor.push({
      id: 'd19_fallback',
      category: 'strategy',
      title: 'Three Goals Today',
      body: interpolate('Keep 3-putts under {threePuttGoal}, hit {fwGoal}+ fairways, and hit {girGoal}+ greens.', stats as unknown as Record<string, string | number>),
      badge: 'Pre-Round',
    });
  }

  const dynamicCount = Math.max(1, desiredCount - 1);
  const pickedDynamic = await pickWithoutImmediateRepeat(withPlanAnchor, dynamicCount);
  const caddieCard = withPlanAnchor.find((card) => !!card._brief);
  let genericPool = GENERIC_CARDS.filter(card => !pickedDynamic.some(d => d.id === card.id));
  if (stats.hasClubYardageData || stats.systematicallyShort || stats.hasContactIssue) {
    genericPool = genericPool.filter(card => card.id !== 'g5' && card.id !== 'g6');
  }
  if (stats.hasTempAdvisory) {
    genericPool = genericPool.filter(card => card.id !== 'g6');
  }
  const fallbackGeneric = genericPool[Math.floor(Math.random() * Math.max(1, genericPool.length))];
  const combined = fallbackGeneric ? [...pickedDynamic, fallbackGeneric] : pickedDynamic;
  if (caddieCard) {
    return [caddieCard, ...combined.filter((card) => card.id !== caddieCard.id)].slice(0, desiredCount);
  }
  return combined;
}
