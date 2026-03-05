import { SavedRound } from '../types';

export type MilestoneType =
  | 'FIRST_SUB_80'
  | 'FIRST_SUB_90'
  | 'FIRST_SUB_100'
  | 'HANDICAP_MILESTONE'
  | 'ROUND_COUNT'
  | 'BIRDIE_STREAK'
  | 'PERSONAL_BEST'
  | 'BIRDIE_COUNT';

export interface MilestoneEvent {
  type: MilestoneType;
  headline: string;
  statLine: string;
  subStats: string[];
  shareCaption: string;
}

const toNum = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function detectMilestone(
  newRound: SavedRound,
  allRounds: SavedRound[],
  handicap: number | null
): MilestoneEvent | null {
  const completedRounds = allRounds
    .filter((r) => toNum(r.score) > 0 && !r.isSample)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const priorRounds = completedRounds.filter((r) => r.id !== newRound.id);
  const score = newRound.score;

  const priorBest = priorRounds.length > 0 ? Math.min(...priorRounds.map((r) => r.score)) : null;
  if (priorBest !== null && score < priorBest) {
    const diff = priorBest - score;
    return {
      type: 'PERSONAL_BEST',
      headline: 'New Personal Best',
      statLine: `${score} at ${newRound.courseName}. ${diff} strokes better than previous best.`,
      subStats: buildRoundSubStats(newRound),
      shareCaption: `Shot ${score} today at ${newRound.courseName}. New personal best.`,
    };
  }

  const thresholds = [80, 90, 100] as const;
  for (const threshold of thresholds) {
    const isFirstUnder = score < threshold && priorRounds.every((r) => r.score >= threshold);
    if (isFirstUnder && priorRounds.length >= 2) {
      return {
        type: threshold === 80 ? 'FIRST_SUB_80' : threshold === 90 ? 'FIRST_SUB_90' : 'FIRST_SUB_100',
        headline: `First Time Under ${threshold}`,
        statLine: `${score} at ${newRound.courseName}.`,
        subStats: buildRoundSubStats(newRound),
        shareCaption: `Shot ${score} today. First time breaking ${threshold}.`,
      };
    }
  }

  if (handicap !== null) {
    const milestones = [0, 5, 10, 15, 20];
    for (const m of milestones) {
      if (handicap <= m) {
        const prevDiffs = priorRounds
          .filter((r) => typeof r.differential === 'number')
          .map((r) => r.differential as number);
        const prevBestDiff = prevDiffs.length > 0 ? Math.min(...prevDiffs) : null;
        if (prevBestDiff !== null && prevBestDiff > m + 0.5) {
          return {
            type: 'HANDICAP_MILESTONE',
            headline: m === 0 ? 'Scratch Golfer' : `Down to ${m} Handicap`,
            statLine: `Handicap index now ${handicap.toFixed(1)}.`,
            subStats: buildRoundSubStats(newRound),
            shareCaption: `Handicap index is now ${handicap.toFixed(1)}. The work is paying off.`,
          };
        }
      }
    }
  }

  const countMilestones = [10, 25, 50, 100];
  if (countMilestones.includes(completedRounds.length)) {
    return {
      type: 'ROUND_COUNT',
      headline: `${completedRounds.length} Rounds Tracked`,
      statLine: buildRoundCountStatLine(completedRounds),
      subStats: [],
      shareCaption: `${completedRounds.length} rounds tracked with GolfSum. The data does not lie.`,
    };
  }

  const holes = newRound.holes ?? [];
  const birdies = holes.filter((h) => h.score > 0 && h.score < h.par).length;
  if (birdies >= 5) {
    return {
      type: 'BIRDIE_COUNT',
      headline: `${birdies} Birdies in One Round`,
      statLine: `${score} at ${newRound.courseName} with ${birdies} birdies.`,
      subStats: buildRoundSubStats(newRound),
      shareCaption: `${birdies} birdies today at ${newRound.courseName}. ${score} total.`,
    };
  }

  const sortedHoles = [...holes].filter((h) => h.score > 0 && h.par > 0).sort((a, b) => a.number - b.number);
  let run = 0;
  let maxRun = 0;
  sortedHoles.forEach((h) => {
    if (h.score < h.par) {
      run += 1;
      maxRun = Math.max(maxRun, run);
    } else {
      run = 0;
    }
  });
  if (maxRun >= 3) {
    return {
      type: 'BIRDIE_STREAK',
      headline: `${maxRun} Birdies in a Row`,
      statLine: `${score} at ${newRound.courseName}.`,
      subStats: buildRoundSubStats(newRound),
      shareCaption: `Put together a ${maxRun}-birdie streak today at ${newRound.courseName}.`,
    };
  }

  return null;
}

function buildRoundSubStats(round: SavedRound): string[] {
  const stats: string[] = [];
  const fairways = toNum((round.stats as any).fairways);
  const fairwaysPossible = toNum((round.stats as any).fairwaysPossible);
  const greens = toNum((round.stats as any).greens);
  const greensPossible = toNum((round.stats as any).greensPossible);
  const putts = toNum((round.stats as any).putts ?? (round.stats as any).totalPutts);

  const firPct = fairwaysPossible > 0 ? Math.round((fairways / fairwaysPossible) * 100) : null;
  const girPct = greensPossible > 0 ? Math.round((greens / greensPossible) * 100) : null;

  if (firPct !== null) stats.push(`${firPct}% FIR`);
  if (girPct !== null) stats.push(`${girPct}% GIR`);
  if (putts > 0) stats.push(`${putts} putts`);

  return stats.slice(0, 3);
}

function buildRoundCountStatLine(rounds: SavedRound[]): string {
  const scores = rounds.map((r) => toNum(r.score)).filter((s) => s > 0);
  const best = Math.min(...scores);
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  return `Best round: ${best}. Average: ${avg}. ${rounds.length} rounds of data.`;
}
