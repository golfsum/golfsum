/**
 * Per-round caddie observations.
 *
 * Voice rules (apply to every string returned from here):
 *   - Talk like a caddie, not a coach app. Short sentences. Second person.
 *   - Specific numbers, never "a few" or "sometimes".
 *   - Pair every observation with a concrete next step (drill, swing
 *     thought, or club-change) when the data supports it.
 *   - NO em-dashes. Use commas, periods, or two separate sentences.
 *   - NO filler words: "solid", "nice job", "typical", "overall", "truly".
 *   - NO "AI" cadence: no "strategic approach", "utilize", "optimize",
 *     "leverage", "establish", "maintain" (used as fluff).
 *   - NO "worse" or "worst". Use "off", "below", "higher than par",
 *     "toughest", "trickiest" instead. A caddie frames constructively.
 *   - DON'T diagnose swing faults from stats. A caddie can't see your
 *     face-angle, path, or setup from a miss direction. List possible
 *     causes ("could be face, path, aim, or the tee box lining you up"),
 *     then give a course-management move they can make tomorrow (aim
 *     bias, club selection, target of the fat side of the green).
 *     Leave swing prescriptions to the player's coach.
 *   - It's okay to sound blunt. A real caddie doesn't cushion.
 *
 * The catalog here runs on a single saved round plus the rest of the
 * player's history (for comparison baselines). Ranks findings by how
 * many strokes they cost (severity), returns the top 3.
 */

import type { SavedRound, RoundHole } from '../types';

export interface CaddieNote {
  /** Stable id for React keys and dedup. */
  id: string;
  /** The bullet copy, caddie voice, no em-dashes. */
  text: string;
  /** Higher number = more strokes this is costing. Used to sort. */
  severity: number;
  /** Tag for the kind of observation so we can limit how many of one tag show. */
  kind:
    | 'driver'
    | 'approach'
    | 'short_game'
    | 'putting'
    | 'three_putt'
    | 'par3'
    | 'par5'
    | 'opening'
    | 'closing'
    | 'penalty'
    | 'streak'
    | 'baseline';
}

const MIN_FIR_ATTEMPTS = 6;
const MIN_GIR_ATTEMPTS = 6;
const MIN_PAR_SAMPLES = 2;

function asHoles(round: SavedRound): RoundHole[] {
  return Array.isArray(round.holes) ? round.holes : [];
}

function countBy<T>(arr: T[], pred: (v: T) => boolean) {
  return arr.reduce((n, v) => (pred(v) ? n + 1 : n), 0);
}

/** Driver tendency: miss direction, strike count, and what to do about it. */
function driverNotes(round: SavedRound): CaddieNote[] {
  const holes = asHoles(round);
  const firAttempts = holes.filter((h) => h.par >= 4 && h.fairwayHit != null);
  if (firAttempts.length < MIN_FIR_ATTEMPTS) return [];

  const hits = countBy(firAttempts, (h) => h.fairwayHit === true);
  const missRight = countBy(firAttempts, (h) => h.fairwayHit === 'right');
  const missLeft = countBy(firAttempts, (h) => h.fairwayHit === 'left');
  const firPct = Math.round((hits / firAttempts.length) * 100);

  const out: CaddieNote[] = [];
  if (missRight >= 3 && missRight >= missLeft + 2) {
    out.push({
      id: 'driver_right',
      kind: 'driver',
      severity: 3 + missRight * 0.3,
      text: `Tee ball leaked right ${missRight} times. Could be face, path, aim, or the tee box itself pointing you there. Next round, pick a spot a yard or two in front of the ball and aim that, then set your feet. Play your tee shots with a target a club-length left of the center line so the pattern plays to the fairway.`,
    });
  } else if (missLeft >= 3 && missLeft >= missRight + 2) {
    out.push({
      id: 'driver_left',
      kind: 'driver',
      severity: 3 + missLeft * 0.3,
      text: `${missLeft} tee shots pulled left. Could be the face, the path, or the tee box lining you up that way. Pick an intermediate spot in front of the ball and aim that, then set your feet. Play for the pattern and aim a touch right of center until it settles.`,
    });
  } else if (missRight >= 2 && missLeft >= 2) {
    out.push({
      id: 'driver_two_way',
      kind: 'driver',
      severity: 4,
      text: `${missRight} right and ${missLeft} left off the tee. A two-way miss is hard to plan around. Pre-shot: same alignment routine every time. On course: swing to 80 percent and aim at the widest part of the fairway until the pattern tightens.`,
    });
  } else if (firPct >= 65 && firAttempts.length >= 8) {
    out.push({
      id: 'driver_hot',
      kind: 'driver',
      severity: 1,
      text: `${hits} fairways on ${firAttempts.length} drives. Tee game was in a good place. Notice what you were looking at before each shot and keep that routine next round.`,
    });
  } else if (firPct < 30) {
    out.push({
      id: 'driver_cold',
      kind: 'driver',
      severity: 4,
      text: `Only ${hits} of ${firAttempts.length} fairways. Driver was not cooperating. Think about 3-wood or a long iron off the tee on the tight holes until you trust the big stick again.`,
    });
  }

  return out;
}

/** Approach / GIR tendency. */
function approachNotes(round: SavedRound): CaddieNote[] {
  const holes = asHoles(round);
  const girAttempts = holes.filter((h) => h.greenHit != null);
  if (girAttempts.length < MIN_GIR_ATTEMPTS) return [];

  const hits = countBy(girAttempts, (h) => h.greenHit === true);
  const missShort = countBy(girAttempts, (h) => h.greenHit === 'short');
  const missLong = countBy(girAttempts, (h) => h.greenHit === 'long');
  const missRight = countBy(girAttempts, (h) => h.greenHit === 'right');
  const missLeft = countBy(girAttempts, (h) => h.greenHit === 'left');
  const girPct = Math.round((hits / girAttempts.length) * 100);

  const out: CaddieNote[] = [];
  if (missShort >= 4 && missShort > missLong) {
    out.push({
      id: 'approach_short',
      kind: 'approach',
      severity: 5,
      text: `${missShort} approaches finished short. Could be club selection, a soft strike, wind you underestimated, or uphill lies. Easiest fix on course: play one more club and swing smooth. If you flushed a few shorts too, check your carry yardages on the range.`,
    });
  } else if (missLong >= 3 && missLong > missShort) {
    out.push({
      id: 'approach_long',
      kind: 'approach',
      severity: 4,
      text: `${missLong} approaches ran long. Could be extra adrenaline, a hot strike, wind help, or hitting more club than the yardage called for. Next round, pick the number you actually carry the club, not the longest you have hit it.`,
    });
  } else if (missRight >= 3 && missRight >= missLeft + 2) {
    out.push({
      id: 'approach_right',
      kind: 'approach',
      severity: 3,
      text: `Approach misses went right ${missRight} times. Could be setup, path, or aim. Bias your target a few yards left of the pin and aim at the fat side of the green. Play the pattern until it closes.`,
    });
  } else if (missLeft >= 3 && missLeft >= missRight + 2) {
    out.push({
      id: 'approach_left',
      kind: 'approach',
      severity: 3,
      text: `${missLeft} approaches pulled left. Same idea in reverse. Bias your target a few yards right of the pin and aim at the fat side of the green until the pattern tightens.`,
    });
  }

  if (girPct >= 55 && girAttempts.length >= 10) {
    out.push({
      id: 'approach_hot',
      kind: 'approach',
      severity: 1,
      text: `${hits} greens hit on ${girAttempts.length}. Irons were flush. Keep the tempo and pre-shot routine you had today.`,
    });
  } else if (girPct < 25 && girAttempts.length >= 10) {
    out.push({
      id: 'approach_cold',
      kind: 'approach',
      severity: 5,
      text: `Only ${hits} greens. Irons were not clicking. On course, aim for the middle of the green and take one extra club. On the range, pick two clubs you lean on and log ten carries of each.`,
    });
  }

  return out;
}

/** Putting: total putts, per-hole average, three-putt count. */
function puttingNotes(round: SavedRound): CaddieNote[] {
  const holes = asHoles(round);
  const stats = round.stats || {};
  const puttsTotal = typeof stats.putts === 'number' ? stats.putts : null;
  const holesPlayed = holes.filter((h) => typeof h.score === 'number').length;

  const out: CaddieNote[] = [];
  if (puttsTotal != null && holesPlayed > 0) {
    const perHole = puttsTotal / holesPlayed;
    if (perHole >= 2.2) {
      out.push({
        id: 'putt_lag',
        kind: 'putting',
        severity: 4,
        text: `${perHole.toFixed(1)} putts per hole. Lag distance is the issue. Run the 30-40-50 foot ladder, goal is finishing inside three feet on eight of ten.`,
      });
    } else if (perHole <= 1.75) {
      out.push({
        id: 'putt_hot',
        kind: 'putting',
        severity: 1,
        text: `${puttsTotal} putts. Flatstick was hot. Whatever you did on the practice green before the round, do it again.`,
      });
    }
  }

  const threePutts = holes.filter((h) => (h.putts || 0) >= 3).length;
  if (threePutts >= 3) {
    out.push({
      id: 'three_putt',
      kind: 'three_putt',
      severity: 3 + threePutts * 0.5,
      text: `${threePutts} three-putts. That's the round right there. First putt speed, always. Pick a spot to leave it past the hole, not short.`,
    });
  } else if (threePutts === 0 && holesPlayed >= 14) {
    out.push({
      id: 'no_three_putt',
      kind: 'three_putt',
      severity: 1,
      text: `Zero three-putts across ${holesPlayed} holes. Speed control was where it needed to be.`,
    });
  }

  return out;
}

/** Scrambling / short game. */
function shortGameNotes(round: SavedRound): CaddieNote[] {
  const holes = asHoles(round);
  const attempts = holes.filter((h) => h.greenHit === false && typeof h.putts === 'number');
  if (attempts.length < 4) return [];

  const saves = countBy(attempts, (h) => (h.putts ?? 99) <= 1);
  const pct = Math.round((saves / attempts.length) * 100);
  const out: CaddieNote[] = [];

  if (pct >= 50) {
    out.push({
      id: 'scramble_hot',
      kind: 'short_game',
      severity: 2,
      text: `${saves} up-and-downs out of ${attempts.length}. Short game kept the round alive. That's how strokes get saved.`,
    });
  } else if (pct <= 15 && attempts.length >= 6) {
    out.push({
      id: 'scramble_cold',
      kind: 'short_game',
      severity: 4,
      text: `${saves} saves on ${attempts.length} chances. Short game cost you. Next practice: 40-yard wedges, greenside chips, and one hour on five-footers.`,
    });
  }

  return out;
}

/** Par-3 scoring. */
function par3Notes(round: SavedRound): CaddieNote[] {
  const holes = asHoles(round);
  const par3s = holes.filter((h) => h.par === 3 && typeof h.score === 'number');
  if (par3s.length < MIN_PAR_SAMPLES) return [];
  const overCount = par3s.filter((h) => h.score > h.par).length;
  const avgVsPar = par3s.reduce((sum, h) => sum + (h.score - h.par), 0) / par3s.length;

  if (overCount >= par3s.length && par3s.length >= 3) {
    return [{
      id: 'par3_cold',
      kind: 'par3',
      severity: 3,
      text: `Over par on every par-3 today. Aim at the middle of the green, not the pin. A 30-footer for birdie is a better outcome than short-siding into a bunker.`,
    }];
  }
  if (avgVsPar <= -0.2 && par3s.length >= 3) {
    return [{
      id: 'par3_hot',
      kind: 'par3',
      severity: 1,
      text: `Par-3s played under par on average. That's how you lower scores without hitting longer drives.`,
    }];
  }
  return [];
}

/** Par-5 scoring: are we getting what we should out of them? */
function par5Notes(round: SavedRound): CaddieNote[] {
  const holes = asHoles(round);
  const par5s = holes.filter((h) => h.par === 5 && typeof h.score === 'number');
  if (par5s.length < MIN_PAR_SAMPLES) return [];

  const birdiesOrBetter = par5s.filter((h) => h.score <= h.par - 1).length;
  const overBy2 = par5s.filter((h) => h.score >= h.par + 2).length;

  if (birdiesOrBetter === 0 && par5s.length >= 3) {
    return [{
      id: 'par5_missed',
      kind: 'par5',
      severity: 3,
      text: `No birdies on the par-5s. These are the scoring holes. Next time, pick a layup yardage you own, hit the right club twice to get there.`,
    }];
  }
  if (overBy2 >= 2) {
    return [{
      id: 'par5_blow_up',
      kind: 'par5',
      severity: 4,
      text: `${overBy2} par-5s played two-over or higher. Usually the second shot got ambitious. Lay up to your favourite wedge yardage, not the longest layup.`,
    }];
  }
  return [];
}

/** Opening-hole scoring: did you start clean or chase it all day? */
function openingClosingNotes(round: SavedRound): CaddieNote[] {
  const holes = asHoles(round);
  if (holes.length < 9) return [];
  const out: CaddieNote[] = [];

  const h1 = holes[0];
  if (h1 && typeof h1.score === 'number' && h1.score - h1.par >= 2) {
    out.push({
      id: 'opening_rough',
      kind: 'opening',
      severity: 2,
      text: `Opened with a ${h1.score} on a par ${h1.par}. Warm up longer next round. Hit ten balls and roll ten putts before the first tee.`,
    });
  }

  const last3 = holes.slice(-3).filter((h) => typeof h.score === 'number');
  if (last3.length >= 2) {
    const over = last3.reduce((sum, h) => sum + (h.score - h.par), 0);
    if (over >= 3) {
      out.push({
        id: 'closing_fade',
        kind: 'closing',
        severity: 3,
        text: `Closing stretch played ${over > 0 ? '+' : ''}${over}. Legs and focus go first. Eat something at the turn, walk between shots, center-of-the-green targets coming in.`,
      });
    }
  }
  return out;
}

/** Streak detection inside a single round (run of pars/bogeys/birdies). */
function streakNotes(round: SavedRound): CaddieNote[] {
  const holes = asHoles(round).filter((h) => typeof h.score === 'number');
  if (holes.length < 9) return [];

  let bestRun = 0;
  let run = 0;
  let worstRun = 0;
  let wrun = 0;
  for (const h of holes) {
    const diff = h.score - h.par;
    if (diff <= 0) { run += 1; bestRun = Math.max(bestRun, run); } else { run = 0; }
    if (diff >= 1) { wrun += 1; worstRun = Math.max(worstRun, wrun); } else { wrun = 0; }
  }

  const out: CaddieNote[] = [];
  if (bestRun >= 5) {
    out.push({
      id: 'streak_pars',
      kind: 'streak',
      severity: 1,
      text: `${bestRun} holes in a row at par or better. That's the stretch where rounds get saved. Note what you were thinking about and bring it next time.`,
    });
  }
  if (worstRun >= 4) {
    out.push({
      id: 'streak_bogeys',
      kind: 'streak',
      severity: 3,
      text: `${worstRun} bogeys or higher in a row. Next time it starts, reset after the hole. Deep breath, next shot is the only one that matters.`,
    });
  }
  return out;
}

/** Round-vs-baseline observation when we have enough history. */
function baselineNote(round: SavedRound, history: SavedRound[]): CaddieNote[] {
  if (!Array.isArray(history) || history.length < 3) return [];
  const otherRoundsSameCourse = history.filter(
    (r) => r.id !== round.id && r.courseId === round.courseId && typeof r.score === 'number'
  );
  if (otherRoundsSameCourse.length < 2) return [];
  const avg = otherRoundsSameCourse.reduce((s, r) => s + r.score, 0) / otherRoundsSameCourse.length;
  const delta = round.score - avg;
  if (Math.abs(delta) < 2) return [];
  return [{
    id: 'baseline_vs_course',
    kind: 'baseline',
    severity: 1,
    text: delta < 0
      ? `Beat your average at this course by ${Math.abs(delta).toFixed(1)} strokes. Whatever was different today, repeat it.`
      : `Shot ${delta.toFixed(1)} over your average here. One bad stretch, not the whole round. Check the hole-by-hole to find where it slipped.`,
  }];
}

/** Main entrypoint. Returns ordered, capped list for the round detail. */
export function buildCaddieNotes(round: SavedRound, history: SavedRound[] = []): CaddieNote[] {
  const all = [
    ...driverNotes(round),
    ...approachNotes(round),
    ...puttingNotes(round),
    ...shortGameNotes(round),
    ...par3Notes(round),
    ...par5Notes(round),
    ...openingClosingNotes(round),
    ...streakNotes(round),
    ...baselineNote(round, history),
  ];

  // Sort by severity (biggest strokes-lost first). Cap at 4 so the section
  // doesn't swallow the screen but still shows meaningful depth.
  const sorted = all.sort((a, b) => b.severity - a.severity);

  // Mix: keep at least one positive (severity <= 2) note if available, so
  // the section isn't all negatives. That's what a good caddie does.
  const positives = sorted.filter((n) => n.severity <= 2);
  const negatives = sorted.filter((n) => n.severity > 2);
  const result: CaddieNote[] = [];
  negatives.slice(0, 3).forEach((n) => result.push(n));
  if (positives.length > 0 && result.length < 4) {
    result.push(positives[0]);
  }

  // Dedup by id.
  const seen = new Set<string>();
  return result.filter((n) => (seen.has(n.id) ? false : (seen.add(n.id), true)));
}
