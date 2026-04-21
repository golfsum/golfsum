import { PatternInsightType, type HandicapTier } from './typesEnums';
import { resolveHandicapTier } from '../../utils/handicap';

export const getHandicapTier = (handicap: number | undefined): HandicapTier =>
  resolveHandicapTier(handicap);

const normalizeTier = (tier: HandicapTier): 'LOW' | 'MID' | 'HIGH' => {
  if (tier === 'SCRATCH') return 'LOW';
  if (tier === 'BEGINNER') return 'HIGH';
  return tier;
};

export const getHandicapAwareTitle = (
  type: PatternInsightType,
  handicap: number | undefined,
  isRight?: boolean
): string => {
  const tier = normalizeTier(getHandicapTier(handicap));

  switch (type) {
    case PatternInsightType.FAIRWAYS_MISSED_RIGHT:
    case PatternInsightType.FAIRWAYS_MISSED_LEFT:
      if (tier === 'LOW') return isRight ? 'Right Miss Trend' : 'Left Miss Trend';
      if (tier === 'MID') return isRight ? 'Miss Trend: Right' : 'Miss Trend: Left';
      return isRight ? 'Right Misses' : 'Left Misses';

    case PatternInsightType.APPROACHES_MISSED_SHORT:
      return 'Approaches Missed Short';
    case PatternInsightType.APPROACHES_MISSED_LONG:
      return 'Approaches Missed Long';
    case PatternInsightType.GREENS_MISSED_LEFT:
      return 'Greens Missed Left';
    case PatternInsightType.GREENS_MISSED_RIGHT:
      return 'Greens Missed Right';
    case PatternInsightType.HIGH_THREE_PUTT:
      return 'Three-Putt Trend';
    case PatternInsightType.LOW_SHORT_PUTT_MAKE_RATE:
      return 'Short Putt Conversion';
    case PatternInsightType.PENALTIES_HURTING_SCORES:
      return 'Penalties Adding Strokes';
    case PatternInsightType.WIND_FAIRWAY_ACCURACY_DROP:
      return 'Wind Hurting Accuracy';
    case PatternInsightType.LOW_UP_DOWN_RATE:
      return 'Up-and-Down Rate Is Low';
    case PatternInsightType.POOR_BUNKER_SAVES:
      return 'Bunker Holes Are Costing Strokes';
    case PatternInsightType.WEAK_PAR3_SCORING:
      return 'Par 3s Are Costing Strokes';
    case PatternInsightType.POOR_PAR5_SCORING:
      return tier === 'LOW' ? 'Par 5 Birdie Opportunities Missed' : 'Par 5s Costing Strokes';
    case PatternInsightType.APPROACH_DISTANCE_WEAKNESS:
      return 'Approach Distance Gap';
    case PatternInsightType.BACK_NINE_SCORING_DROP:
      return 'Back Nine Fade';
    case PatternInsightType.PAR4_SCORING_STRUGGLE:
      return 'Par 4s Are Costing Strokes';
    case PatternInsightType.HIGH_BOGEY_CONVERSION:
      return 'Bogeys Are Leading to More Bogeys';
    case PatternInsightType.FRONT_NINE_BLOWUP:
      return 'Slow Starts Are Costing Strokes';
    case PatternInsightType.WEATHER_SCORING_DROP:
      return 'Scores Drop in Wind';
    default:
      return 'Performance Trend';
  }
};

export const getHandicapAwareObservation = (
  type: PatternInsightType,
  handicap: number | undefined,
  dominantRate?: number,
  isRight?: boolean
): string => {
  const tier = normalizeTier(getHandicapTier(handicap));
  const rateText = dominantRate ? `${(dominantRate * 100).toFixed(0)}%` : '';

  switch (type) {
    case PatternInsightType.FAIRWAYS_MISSED_RIGHT:
    case PatternInsightType.FAIRWAYS_MISSED_LEFT:
      if (tier === 'LOW') {
        return `${rateText} of your misses are finishing ${isRight ? 'right' : 'left'} of target.`;
      }
      if (tier === 'MID') {
        return `Most of your misses are ${isRight ? 'right' : 'left'} of target.`;
      }
      return `Misses are trending ${isRight ? 'right' : 'left'} of target.`;

    case PatternInsightType.APPROACHES_MISSED_SHORT:
    case PatternInsightType.APPROACHES_MISSED_LONG:
      return `${rateText} of your approach misses are ${type === PatternInsightType.APPROACHES_MISSED_SHORT ? 'short' : 'long'}.`;

    case PatternInsightType.HIGH_THREE_PUTT:
      return 'Three-putts are occurring more often than expected.';

    case PatternInsightType.PENALTIES_HURTING_SCORES:
      return 'Penalty shots are adding strokes to your rounds.';

    default:
      return 'A trend is showing in your recent rounds.';
  }
};

export const getHandicapAwareWorkOn = (
  type: PatternInsightType,
  handicap: number | undefined,
  isRight?: boolean
): string[] => {
  const rawTier = getHandicapTier(handicap);
  const tier = normalizeTier(rawTier);

  switch (type) {
    case PatternInsightType.FAIRWAYS_MISSED_RIGHT:
    case PatternInsightType.FAIRWAYS_MISSED_LEFT:
      if (tier === 'LOW') {
        return [
          'Check alignment and face control at address',
          'Focus on start line more than curve',
          'Choose targets that fit your miss'
        ];
      }
      if (tier === 'MID') {
        return [
          'Pick a clear start target off the tee',
          'Commit to a consistent tee-shot shape',
          'Avoid mid-round overcorrections'
        ];
      }
      return [
        'Aim for the widest part of the fairway',
        'Use your most reliable club',
        "Don't try to kill it. Short and straight wins."
      ];

    case PatternInsightType.APPROACHES_MISSED_SHORT:
      if (rawTier === 'SCRATCH') {
        return [
          'Check carry distances against on-course numbers',
          'Identify contact quality patterns under pressure',
          'Confirm carry vs total distinction on approach clubs',
        ];
      }
      if (rawTier === 'BEGINNER') {
        return [
          'Take two more clubs than you think',
          'Focus on clean contact over distance',
          'Aim for the center of the green every time',
        ];
      }
      return tier === 'LOW'
        ? ['Trust carry yardages', 'Commit fully to club choice', 'Aim center-green when in doubt']
        : tier === 'MID'
        ? ['Take one more club when unsure', 'Commit to the full swing', 'Account for wind']
        : ['Focus on clean contact', 'Aim for the center of the green', 'Avoid decel swings'];

    case PatternInsightType.APPROACHES_MISSED_LONG:
      return tier === 'LOW'
        ? ['Factor lie and spin', 'Pick back-edge targets', 'Control tempo']
        : tier === 'MID'
        ? ['Check lie before selecting club', 'Favor controlled swings', 'Aim for safer back targets']
        : ['Take one less club when needed', 'Focus on rhythm', 'Aim center-green'];

    case PatternInsightType.HIGH_THREE_PUTT:
      return tier === 'LOW'
        ? ['Practice pace control from 30-50 feet', 'Leave uphill second putts', 'Make speed priority']
        : tier === 'MID'
        ? ['Prioritize speed over line', 'Aim to finish inside 3 feet', 'Avoid downhill second putts']
        : ['Get the first putt close', 'Focus on speed not line', 'Inside 5 feet is success'];

    case PatternInsightType.PENALTIES_HURTING_SCORES:
      return [
        'Identify penalty holes before the round',
        'Choose conservative tee targets',
        'Accept one miss and avoid compounding mistakes'
      ];

    default:
      return [];
  }
};

export const getCoachExplanation = (type: PatternInsightType, isRight?: boolean): string => {
  switch (type) {
    case PatternInsightType.FAIRWAYS_MISSED_RIGHT:
      return 'A right miss usually means the clubface is open to your swing path at impact. Aiming further left often increases curvature if the face stays open.';
    case PatternInsightType.FAIRWAYS_MISSED_LEFT:
      return 'A left miss often means the clubface is closing relative to your path. Aiming right can actually amplify the hook if the face stays closed.';
    case PatternInsightType.APPROACHES_MISSED_SHORT:
      return 'Short misses are often caused by under-clubbing, heavy contact, or underestimating wind. Trust carry distances over total yardage.';
    case PatternInsightType.APPROACHES_MISSED_LONG:
      return 'Long misses can come from over-clubbing, flyers, or adrenaline. Favor controlled tempo and safe targets.';
    case PatternInsightType.HIGH_THREE_PUTT:
      return 'Three-putts usually come from poor speed control on the first putt, not the line. Focus on leaving the ball within 3 feet.';
    case PatternInsightType.PENALTIES_HURTING_SCORES:
      return 'Penalty shots add strokes quickly. A conservative target and safe club choice often saves more strokes than aggressive plays.';
    default:
      return '';
  }
};

export const getBeforeNextRound = (type: PatternInsightType, isRight?: boolean): string[] => {
  switch (type) {
    case PatternInsightType.FAIRWAYS_MISSED_RIGHT:
    case PatternInsightType.FAIRWAYS_MISSED_LEFT:
      return [
        'Pick a clear start-line target on tee shots',
        'Trust your setup and commit to alignment',
        'Avoid mid-round aiming adjustments'
      ];

    case PatternInsightType.APPROACHES_MISSED_SHORT:
      return [
        'Check carry yardages before the round',
        'Commit to full swings with chosen club',
        'Aim center-green when uncertain'
      ];

    case PatternInsightType.APPROACHES_MISSED_LONG:
      return [
        'Account for lie and wind before selecting club',
        'Favor controlled tempo over extra speed',
        'Pick safe back-edge targets'
      ];

    case PatternInsightType.HIGH_THREE_PUTT:
      return [
        'Spend 5 minutes on lag putt speed control',
        'Focus on leaving uphill second putts',
        'Make speed your priority on long putts'
      ];

    case PatternInsightType.PENALTIES_HURTING_SCORES:
      return [
        'Identify penalty holes and plan conservative targets',
        'Choose the club that keeps you in play',
        'Accept one miss and avoid compounding mistakes'
      ];

    default:
      return [];
  }
};
