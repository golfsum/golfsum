import type { SavedRound, GpsShotLog, RoundHole } from '../types';

export type HoleSuggestionState = 'no_history' | 'building' | 'data_backed' | 'tied';
export type HoleSuggestionMetric =
  | 'fairway_rate'
  | 'approach_distance'
  | 'avg_score'
  | 'approach_club_par3'
  | 'distance_based_par3'
  | 'gir_low_par3'
  | 'strong_green_par3'
  | 'scoring_trend'
  | 'best_leave'
  | 'tee_club'
  | 'par5_reachable';

export interface HoleSuggestion {
  state: HoleSuggestionState;
  club: string | null;
  label: string;
  rounds: number;
  metric?: HoleSuggestionMetric | null;
  fairwayRate?: number | null;
  avgApproachYards?: number | null;
  avgScore?: number | null;
  competitorAvgScore?: number | null;
  competitorLabel?: string | null;
  tiedWith?: string | null;
  tiedWithLabel?: string | null;
  fallbackYards?: number | null;
  par?: number | null;
  holeNumber?: number | null;
  girRate?: number | null;
  bestLeaveMin?: number | null;
  bestLeaveMax?: number | null;
  girRateAtLeave?: number | null;
  holeLength?: number | null;
  title?: string | null;
  body?: string | null;
  support?: string | null;
  clubDistanceSource?: 'gps' | 'manual' | null;
  clubDistanceSampleCount?: number | null;
  clubDistanceConfidence?: 'high' | 'low' | 'manual' | null;
  clubMatchQuality?: 'strong' | 'ok' | 'gap' | null;
}

interface FallbackClub {
  club: string;
  yards?: number | null;
  source?: 'gps' | 'manual' | null;
  sampleCount?: number | null;
  confidence?: 'high' | 'low' | 'manual' | null;
  matchQuality?: 'strong' | 'ok' | 'gap' | null;
}

interface ClubRow {
  club: string;
  label: string;
  rounds: number;
  fairwayHits: number;
  fairwayTracked: number;
  totalScore: number;
  approachTotal: number;
  approachCount: number;
  girHits: number;
  girTracked: number;
}

interface LeaveBandRow {
  label: string;
  min: number;
  max: number;
  rounds: number;
  girHits: number;
  totalScore: number;
}

interface HoleStats {
  rounds: number;
  avgScore: number | null;
  girRate: number | null;
  holeLength: number | null;
  bestLeaveBand: LeaveBandRow | null;
  bestTeeClub: ClubRow | null;
  scoringLeader: ClubRow | null;
  scoringRunner: ClubRow | null;
}

interface SuggestionOptions {
  par?: number | null;
  holeLength?: number | null;
  gpsDistanceYards?: number | null;
  fallbackClub?: FallbackClub | null;
  clubTotals?: Record<string, number | null | undefined> | null;
  playerRating?: number | null;
}

type PlayerRatingGroup = 'plus_scratch' | 'low' | 'mid_low' | 'mid' | 'high';

function normalizeClubKey(value?: string | null): string {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';

  const compact = raw.replace(/[\s._-]+/g, '');
  const aliases: Record<string, string> = {
    dr: 'driver',
    driver: 'driver',
    '1w': 'driver',
    '3w': '3 wood',
    '3wood': '3 wood',
    '5w': '5 wood',
    '5wood': '5 wood',
    '7w': '7 wood',
    '7wood': '7 wood',
    '2h': '2 hybrid',
    '3h': '3 hybrid',
    '4h': '4 hybrid',
    '5h': '5 hybrid',
    '2hybrid': '2 hybrid',
    '3hybrid': '3 hybrid',
    '4hybrid': '4 hybrid',
    '5hybrid': '5 hybrid',
    pw: 'pw',
    gw: 'gw',
    aw: 'aw',
    sw: 'sw',
    lw: 'lw',
  };
  if (aliases[compact]) return aliases[compact];

  const ironMatch = compact.match(/^([3-9])i(?:ron)?$/);
  if (ironMatch) return `${ironMatch[1]} iron`;

  return raw.replace(/\s+/g, ' ');
}

function formatClubLabel(value?: string | null): string {
  const key = normalizeClubKey(value);
  if (!key) return 'Driver';

  if (key === 'driver') return 'Driver';
  if (key.endsWith(' wood')) {
    return key.replace(/^(\d)\swood$/, '$1 Wood').replace(/\b\w/g, (char) => char.toUpperCase());
  }
  if (key.endsWith(' hybrid')) {
    return key.replace(/^(\d)\shybrid$/, '$1 Hybrid').replace(/\b\w/g, (char) => char.toUpperCase());
  }
  if (key.endsWith(' iron')) {
    return key.replace(/^(\d)\siron$/, '$1 Iron').replace(/\b\w/g, (char) => char.toUpperCase());
  }

  const wedgeLabels: Record<string, string> = {
    pw: 'PW',
    gw: 'GW',
    aw: 'AW',
    sw: 'SW',
    lw: 'LW',
  };
  if (wedgeLabels[key]) return wedgeLabels[key];

  return key.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatPercent(value?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
  return `${Math.round(value * 100)}%`;
}

function getPlayerRatingGroup(playerRating?: number | null): PlayerRatingGroup {
  if (playerRating === null || playerRating === undefined || !Number.isFinite(playerRating)) return 'mid';
  if (playerRating <= 0) return 'plus_scratch';
  if (playerRating <= 5) return 'low';
  if (playerRating <= 10) return 'mid_low';
  if (playerRating <= 15) return 'mid';
  return 'high';
}

function getFallbackSuggestion(
  fallbackClub?: FallbackClub | null,
  par?: number | null,
  holeNumber?: number | null
): HoleSuggestion {
  const label = formatClubLabel(fallbackClub?.club || 'Driver');
  return {
    state: 'no_history',
    club: normalizeClubKey(fallbackClub?.club || 'Driver'),
    label,
    rounds: 0,
    fallbackYards: typeof fallbackClub?.yards === 'number' ? fallbackClub.yards : null,
    clubDistanceSource: fallbackClub?.source ?? null,
    clubDistanceSampleCount: fallbackClub?.sampleCount ?? null,
    clubDistanceConfidence: fallbackClub?.confidence ?? null,
    clubMatchQuality: fallbackClub?.matchQuality ?? null,
    par: par ?? null,
    holeNumber: holeNumber ?? null,
  };
}

function getTeeShot(gpsShots: GpsShotLog[] | undefined, holeNumber: number): GpsShotLog | null {
  const shots = (gpsShots || [])
    .filter((shot) => shot.holeNumber === holeNumber)
    .sort((a, b) => (a.shotNumber ?? 0) - (b.shotNumber ?? 0));
  if (!shots.length) return null;
  return shots.find((shot) => String(shot.lie || '').toLowerCase() === 'tee box') || shots[0];
}

function getApproachShot(gpsShots: GpsShotLog[] | undefined, holeNumber: number): GpsShotLog | null {
  const shots = (gpsShots || [])
    .filter((shot) => shot.holeNumber === holeNumber)
    .sort((a, b) => (a.shotNumber ?? 0) - (b.shotNumber ?? 0));
  return shots.find((shot) => (shot.shotNumber ?? 0) > 1) || null;
}

function isFairwayHit(value: RoundHole['fairwayHit']): boolean | null {
  if (value === true) return true;
  if (
    value === false ||
    value === 'left' ||
    value === 'right' ||
    value === 'short' ||
    value === 'long' ||
    value === 'double-left' ||
    value === 'double-right'
  ) {
    return false;
  }
  return null;
}

function isGreenHit(value: RoundHole['greenHit']): boolean | null {
  if (value === true) return true;
  if (
    value === false ||
    value === 'left' ||
    value === 'right' ||
    value === 'short' ||
    value === 'long'
  ) {
    return false;
  }
  return null;
}

function parseApproachBand(label?: string | null) {
  const match = String(label || '').match(/(\d+)\s*-\s*(\d+)/);
  if (!match) return null;
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { label: String(label), min, max };
}

function collectClubRows(rounds: SavedRound[], holeNumber: number): ClubRow[] {
  const rows = new Map<string, ClubRow>();

  rounds.forEach((round) => {
    const hole = (round.holes || []).find((entry) => entry.number === holeNumber);
    if (!hole || typeof hole.score !== 'number') return;

    const teeShot = getTeeShot(round.gpsShots, holeNumber);
    const approachShot = getApproachShot(round.gpsShots, holeNumber);
    const clubLabel = teeShot?.club || hole.teeClub || null;
    const clubKey = normalizeClubKey(clubLabel);
    if (!clubKey) return;

    const row = rows.get(clubKey) || {
      club: clubKey,
      label: formatClubLabel(clubLabel),
      rounds: 0,
      fairwayHits: 0,
      fairwayTracked: 0,
      totalScore: 0,
      approachTotal: 0,
      approachCount: 0,
      girHits: 0,
      girTracked: 0,
    };

    row.rounds += 1;
    row.totalScore += hole.score;

    const fairwayHit = isFairwayHit(hole.fairwayHit);
    if (fairwayHit !== null) {
      row.fairwayTracked += 1;
      if (fairwayHit) row.fairwayHits += 1;
    }

    const greenHit = isGreenHit(hole.greenHit);
    if (greenHit !== null) {
      row.girTracked += 1;
      if (greenHit) row.girHits += 1;
    }

    const approachYards =
      typeof approachShot?.playingYards === 'number'
        ? approachShot.playingYards
        : typeof approachShot?.actualYards === 'number'
          ? approachShot.actualYards
          : null;
    if (typeof approachYards === 'number' && Number.isFinite(approachYards)) {
      row.approachTotal += approachYards;
      row.approachCount += 1;
    }

    rows.set(clubKey, row);
  });

  return [...rows.values()];
}

function collectLeaveBands(rounds: SavedRound[], holeNumber: number): LeaveBandRow[] {
  const rows = new Map<string, LeaveBandRow>();

  rounds.forEach((round) => {
    const hole = (round.holes || []).find((entry) => entry.number === holeNumber);
    if (!hole || typeof hole.score !== 'number') return;
    const band = parseApproachBand(String(hole.approachDistance || ''));
    const greenHit = isGreenHit(hole.greenHit);
    if (!band || greenHit === null) return;

    const row = rows.get(band.label) || {
      label: band.label,
      min: band.min,
      max: band.max,
      rounds: 0,
      girHits: 0,
      totalScore: 0,
    };

    row.rounds += 1;
    row.totalScore += hole.score;
    if (greenHit) row.girHits += 1;
    rows.set(band.label, row);
  });

  return [...rows.values()];
}

function averageScore(row: { rounds: number; totalScore: number }): number {
  return row.rounds > 0 ? row.totalScore / row.rounds : Number.POSITIVE_INFINITY;
}

function fairwayRate(row: ClubRow): number | null {
  return row.fairwayTracked > 0 ? row.fairwayHits / row.fairwayTracked : null;
}

function avgApproach(row: ClubRow): number | null {
  return row.approachCount > 0 ? row.approachTotal / row.approachCount : null;
}

function girRate(row: { rounds: number; girHits: number }): number | null {
  return row.rounds > 0 ? row.girHits / row.rounds : null;
}

function summarizeHoleStats(rounds: SavedRound[], holeNumber: number): HoleStats {
  const holeRows: RoundHole[] = rounds
    .map((round) => (round.holes || []).find((entry) => entry.number === holeNumber))
    .filter((hole): hole is RoundHole => Boolean(hole));

  const roundsPlayed = holeRows.filter((hole) => typeof hole.score === 'number').length;
  const avgScore =
    roundsPlayed > 0
      ? holeRows.reduce((sum: number, hole: RoundHole) => sum + Number(hole.score || 0), 0) / roundsPlayed
      : null;

  const girTracked = holeRows
    .map((hole: RoundHole) => isGreenHit(hole.greenHit))
    .filter((value: boolean | null): value is boolean => value !== null);
  const holeGirRate =
    girTracked.length > 0 ? girTracked.filter(Boolean).length / girTracked.length : null;

  const leaveBands = collectLeaveBands(rounds, holeNumber)
    .filter((row) => row.rounds >= 3)
    .sort((left, right) => {
      const girDelta = (right.girHits / right.rounds) - (left.girHits / left.rounds);
      if (Math.abs(girDelta) > 0.001) return girDelta;
      return averageScore(left) - averageScore(right);
    });

  const clubRows = collectClubRows(rounds, holeNumber);
  const scoringRows = clubRows
    .filter((row) => row.rounds > 0)
    .map((row) => ({ ...row, avgScore: averageScore(row) }))
    .sort((a, b) => a.avgScore - b.avgScore);

  return {
    rounds: roundsPlayed,
    avgScore,
    girRate: holeGirRate,
    holeLength: null,
    bestLeaveBand: leaveBands[0] || null,
    bestTeeClub: clubRows
      .filter((row) => row.rounds >= 3)
      .sort((left, right) => averageScore(left) - averageScore(right))[0] || null,
    scoringLeader: scoringRows[0] || null,
    scoringRunner: scoringRows[1] || null,
  };
}

function normalizeClubTotals(
  clubTotals?: Record<string, number | null | undefined> | null
): Record<string, number> {
  const entries = Object.entries(clubTotals || {})
    .filter(([, yards]) => typeof yards === 'number' && Number.isFinite(yards))
    .map(([club, yards]) => [normalizeClubKey(club), Number(yards)]);
  return Object.fromEntries(entries);
}

function getBestPar3Club(
  rounds: SavedRound[],
  holeNumber: number,
  gpsDistanceYards?: number | null,
  clubTotals?: Record<string, number | null | undefined> | null
) {
  const distance = typeof gpsDistanceYards === 'number' && Number.isFinite(gpsDistanceYards)
    ? gpsDistanceYards
    : null;
  const normalizedTotals = normalizeClubTotals(clubTotals);
  const rows = collectClubRows(rounds, holeNumber)
    .filter((row) => row.girTracked >= 5)
    .map((row) => ({
      ...row,
      girRate: row.girTracked > 0 ? row.girHits / row.girTracked : 0,
      clubYards: normalizedTotals[row.club] ?? null,
    }))
    .filter((row) => {
      if (!distance || typeof row.clubYards !== 'number') return true;
      return Math.abs(row.clubYards - distance) <= 15;
    })
    .sort((left, right) => {
      const girDelta = right.girRate - left.girRate;
      if (Math.abs(girDelta) > 0.001) return girDelta;
      return averageScore(left) - averageScore(right);
    });

  return rows[0] || null;
}

function getDistanceBasedPar3Club(
  gpsDistanceYards?: number | null,
  fallbackClub?: FallbackClub | null,
  clubTotals?: Record<string, number | null | undefined> | null
) {
  const distance = typeof gpsDistanceYards === 'number' && Number.isFinite(gpsDistanceYards)
    ? gpsDistanceYards
    : typeof fallbackClub?.yards === 'number' && Number.isFinite(fallbackClub.yards)
      ? fallbackClub.yards
      : null;

  const normalizedTotals = normalizeClubTotals(clubTotals);
  const candidates = Object.entries(normalizedTotals)
    .map(([club, yards]) => ({
      club,
      label: formatClubLabel(club),
      yards,
    }))
    .sort((left, right) => {
      if (distance === null) return right.yards - left.yards;
      return Math.abs(left.yards - distance) - Math.abs(right.yards - distance);
    });

  if (candidates[0]) return candidates[0];
  if (!fallbackClub?.club) return null;
  return {
    club: normalizeClubKey(fallbackClub.club),
    label: formatClubLabel(fallbackClub.club),
    yards: typeof fallbackClub.yards === 'number' ? fallbackClub.yards : null,
  };
}

function formatDistance(distance?: number | null): string {
  if (typeof distance !== 'number' || !Number.isFinite(distance)) return '';
  return `${Math.round(distance)}y`;
}

function getPar3ScoringTitle(avgScore: number | null, par: number, group: PlayerRatingGroup): string {
  if (typeof avgScore !== 'number' || !Number.isFinite(avgScore)) return `Hole ${par}`;
  if (avgScore < par) return 'Good hole for you';
  if (avgScore === par) return group === 'mid_low' ? 'Solid par 3 for you' : `Hole ${par}`;
  return `Hole ${par}`;
}

function buildPar3DistanceBody(
  group: PlayerRatingGroup,
  clubLabel: string,
  distanceYards: number | null,
  clubYards: number | null
): string {
  const centerText = formatDistance(distanceYards);
  const clubText = typeof clubYards === 'number' && Number.isFinite(clubYards) ? formatDistance(clubYards) : null;

  switch (group) {
    case 'plus_scratch':
      return `${centerText} to the center. Your ${clubLabel} is the play. You know your number.`;
    case 'low':
      return `${centerText} to center. ${clubLabel} averages ${clubText || centerText} for you. Take a little extra and go at it.`;
    case 'mid_low':
      return `${centerText} to the center. Your ${clubLabel} is ${clubText || centerText} avg. Good club. Middle of the green.`;
    case 'mid':
      return `${centerText} to the center. ${clubLabel} is your club. Smooth swing, go at the green.`;
    case 'high':
    default:
      return `${centerText} to the center. Take your ${clubLabel} and aim for the middle of the green.`;
  }
}

function buildPar3BestClubCopy(
  group: PlayerRatingGroup,
  clubLabel: string,
  distanceYards: number | null,
  gir: number,
  rounds: number
): { title: string; body: string } {
  const distanceText = formatDistance(distanceYards);
  const girText = formatPercent(gir);

  switch (group) {
    case 'plus_scratch':
      return {
        title: 'Best club here',
        body: `${clubLabel} at ${distanceText}, ${girText} greens from this range. Miss left if you miss.`,
      };
    case 'low':
      return {
        title: 'Best club here',
        body: `${clubLabel}, ${girText} greens from this range over ${rounds} rounds. Good number for you here.`,
      };
    case 'mid_low':
      return {
        title: 'Best club here',
        body: `${clubLabel}, ${distanceText} avg. You hit this green ${girText} of the time from this range. Good club for you here.`,
      };
    case 'mid':
      return {
        title: 'Best club here',
        body: `${clubLabel} is your play. You hit this distance well. Take your normal swing and go at the green.`,
      };
    case 'high':
    default:
      return {
        title: 'Best club here',
        body: `${clubLabel}. Take a smooth swing and aim for the center of the green. Front fringe is fine too.`,
      };
  }
}

function buildPar3ToughGreenCopy(group: PlayerRatingGroup, gir: number): { title: string; body: string } {
  const girText = formatPercent(gir);

  switch (group) {
    case 'plus_scratch':
      return {
        title: 'Tough green',
        body: `${girText} greens here. Nobody is holding this in regulation. Miss short, chip from the front. Stay out of the back bunkers.`,
      };
    case 'low':
      return {
        title: 'Tough green to hold',
        body: `You are hitting this green ${girText} of the time. Best miss is short left. Easy chip from there.`,
      };
    case 'mid_low':
      return {
        title: 'Tough green',
        body: 'This green is hard to stick. Aim for the center and take what you get. Short is your best miss.',
      };
    case 'mid':
      return {
        title: 'Tough green',
        body: 'Aim for the front half of the green. If you miss, short is the place to be. Easy chip from there.',
      };
    case 'high':
    default:
      return {
        title: 'Play to the front',
        body: 'Aim for the front center of the green. Short of the flag is a great result. You will have an easy chip from there.',
      };
  }
}

function buildPar3StrongGreenCopy(group: PlayerRatingGroup, clubLabel: string, gir: number): { title: string; body: string } {
  const girText = formatPercent(gir);
  switch (group) {
    case 'plus_scratch':
      return { title: 'Good hole for you', body: `${girText} greens here. ${clubLabel} is your best club. You know this one.` };
    case 'low':
      return { title: 'Good hole for you', body: `${girText} greens here. ${clubLabel}, trust your number. You have been solid on this hole.` };
    case 'mid_low':
      return { title: 'Good hole for you', body: `You hit this green ${girText} of the time. ${clubLabel} is your play. Go at it.` };
    case 'mid':
      return { title: 'Good hole for you', body: `This is one of your better par 3s. ${clubLabel}, middle of the green, trust it.` };
    case 'high':
    default:
      return { title: 'Good hole for you', body: `You do well here. ${clubLabel}, take your normal swing, aim for the middle.` };
  }
}

function buildPar3ScoringTrendCopy(
  group: PlayerRatingGroup,
  avgScore: number | null,
  par: number,
  rounds: number,
  holeNumber: number,
  clubLabel?: string | null,
  clubYards?: number | null
): { title: string; body: string } {
  const avgText = typeof avgScore === 'number' && Number.isFinite(avgScore) ? avgScore.toFixed(1) : null;
  const clubText = clubLabel
    ? typeof clubYards === 'number' && Number.isFinite(clubYards)
      ? `${clubLabel} at ${Math.round(clubYards)}y`
      : clubLabel
    : null;

  if (typeof avgScore === 'number' && avgScore < par) {
    return {
      title: 'Good hole for you',
      body: `${avgText} avg here over ${rounds} rounds. Better than par.${clubText ? ` ${clubText}, go right at it.` : ' Keep doing what you are doing.'}`,
    };
  }

  if (typeof avgScore === 'number' && avgScore === par) {
    if (group === 'mid_low') {
      return {
        title: 'Solid par 3 for you',
        body: `${avgText} avg here over ${rounds} rounds.${clubText ? ` ${clubText} is your play.` : ''} Middle of the green.`,
      };
    }
    return {
      title: `Hole ${holeNumber}`,
      body: `${avgText} average on this hole. Solid. Pick your club, go at the middle, make your par.`,
    };
  }

  if (group === 'plus_scratch' || group === 'low') {
    return {
      title: `Hole ${holeNumber}`,
      body: `${avgText || '--'} avg here over ${rounds} rounds. Hard par 3. Bogey is not a disaster. Short miss, clean chip.`,
    };
  }

  if (group === 'mid_low') {
    return {
      title: `Hole ${holeNumber}`,
      body: `${avgText || '--'} avg here. Tough hole. Go at the front half, take your par or bogey and move on.`,
    };
  }

  if (group === 'mid') {
    return {
      title: `Hole ${holeNumber}`,
      body: 'This is one of the tougher par 3s on the course. Front half of the green, smooth swing, take your score.',
    };
  }

  return {
    title: `Hole ${holeNumber}`,
    body: 'Long par 3. Aim for the front center of the green. A bogey here is a good score.',
  };
}

function checkReachableInTwo(
  clubTotals?: Record<string, number | null | undefined> | null,
  holeLength?: number | null
) {
  const normalizedTotals = normalizeClubTotals(clubTotals);
  const driverYards = normalizedTotals.driver ?? null;
  const nonDriverEntries = Object.entries(normalizedTotals)
    .filter(([club]) => club !== 'driver')
    .sort((left, right) => right[1] - left[1]);
  const longestSecondShot = nonDriverEntries[0];
  if (
    !driverYards ||
    !longestSecondShot ||
    typeof holeLength !== 'number' ||
    !Number.isFinite(holeLength)
  ) {
    return { isReachable: false, club: null };
  }

  const totalReach = driverYards + longestSecondShot[1];
  return {
    isReachable: totalReach >= holeLength - 15,
    club: formatClubLabel(longestSecondShot[0]),
  };
}

export function selectTipType(
  par: number,
  holeStats: HoleStats,
  clubTotals?: Record<string, number | null | undefined> | null,
  rounds?: SavedRound[],
  holeNumber?: number,
  gpsDistanceYards?: number | null,
  fallbackClub?: FallbackClub | null
) {
  const totalRounds = holeStats?.rounds || 0;
  const minRounds = 3;

  if (par === 3) {
    const bestClub = rounds && holeNumber
      ? getBestPar3Club(rounds, holeNumber, gpsDistanceYards, clubTotals)
      : null;

    if (totalRounds >= 4 && typeof holeStats.girRate === 'number' && holeStats.girRate > 0.6 && bestClub) {
      return {
        type: 'strong_green_par3' as const,
        club: bestClub.label,
        clubYards: bestClub.clubYards ?? null,
        girRate: holeStats.girRate,
        rounds: totalRounds,
      };
    }

    if (bestClub) {
      return {
        type: 'approach_club_par3' as const,
        club: bestClub.label,
        clubYards: bestClub.clubYards ?? null,
        girRate: bestClub.girRate,
        rounds: bestClub.rounds,
      };
    }

    if (totalRounds >= 4 && typeof holeStats.girRate === 'number' && holeStats.girRate < 0.3) {
      return { type: 'gir_low_par3' as const, girRate: holeStats.girRate, rounds: totalRounds };
    }

    if (totalRounds >= 4 && typeof holeStats.avgScore === 'number' && Number.isFinite(holeStats.avgScore)) {
      return {
        type: 'scoring_trend' as const,
        avgScore: holeStats.avgScore,
        par,
        rounds: totalRounds,
      };
    }

    const distanceClub = getDistanceBasedPar3Club(gpsDistanceYards, fallbackClub, clubTotals);
    if (distanceClub) {
      return {
        type: 'distance_based_par3' as const,
        club: distanceClub.label,
        clubYards: typeof distanceClub.yards === 'number' ? distanceClub.yards : null,
        rounds: totalRounds,
      };
    }

    if (totalRounds < minRounds) {
      return { type: 'building' as const, rounds: totalRounds, needed: minRounds };
    }

    return { type: 'building' as const, rounds: totalRounds, needed: minRounds };
  }

  if (totalRounds < minRounds) {
    return { type: 'building' as const, rounds: totalRounds, needed: minRounds };
  }

  if (par === 5) {
    const reachable = checkReachableInTwo(clubTotals, holeStats.holeLength);
    if (reachable.isReachable) {
      return { type: 'par5_reachable' as const, club: reachable.club, rounds: totalRounds };
    }
  }

  if (holeStats.bestLeaveBand) {
    return {
      type: 'best_leave' as const,
      bestLeaveMin: holeStats.bestLeaveBand.min,
      bestLeaveMax: holeStats.bestLeaveBand.max,
      girRate: holeStats.bestLeaveBand.girHits / holeStats.bestLeaveBand.rounds,
      rounds: holeStats.bestLeaveBand.rounds,
    };
  }

  if (holeStats.bestTeeClub) {
    return {
      type: 'tee_club' as const,
      club: holeStats.bestTeeClub.label,
      fairwayRate: fairwayRate(holeStats.bestTeeClub),
      avgScore: Number(averageScore(holeStats.bestTeeClub).toFixed(1)),
      rounds: holeStats.bestTeeClub.rounds,
    };
  }

  return {
    type: 'scoring_trend' as const,
    avgScore: holeStats.avgScore,
    par,
    rounds: totalRounds,
  };
}

export function buildInsightCopy(suggestion?: HoleSuggestion | null): string | null {
  if (!suggestion) return null;

  if (suggestion.body) return suggestion.body;

  if (suggestion.state === 'building') {
    if (suggestion.rounds <= 0) return 'No history on this hole yet';
    if (suggestion.rounds === 1) return '1 round here so far';
    return `${suggestion.rounds} rounds here so far`;
  }

  if (suggestion.state === 'tied') {
    return `${suggestion.label} or ${suggestion.tiedWithLabel} · Similar results. Your call.`;
  }

  if (suggestion.state !== 'data_backed') return null;

  if (
    suggestion.metric === 'approach_club_par3' &&
    suggestion.label &&
    typeof suggestion.girRate === 'number'
  ) {
    return `${suggestion.label} to ${Math.round(suggestion.fallbackYards || 0)}y. ${formatPercent(suggestion.girRate)} GIR from this range over ${suggestion.rounds} rounds.`;
  }

  if (suggestion.metric === 'gir_low_par3' && typeof suggestion.girRate === 'number') {
    return `You hit this green ${formatPercent(suggestion.girRate)} of the time. Focus on your short-game position off the tee and favor the easiest chip angle.`;
  }

  if (
    suggestion.metric === 'best_leave' &&
    typeof suggestion.bestLeaveMin === 'number' &&
    typeof suggestion.bestLeaveMax === 'number'
  ) {
    return `Leave ${suggestion.bestLeaveMin}-${suggestion.bestLeaveMax}y for your best GIR chances on this hole (${formatPercent(suggestion.girRateAtLeave ?? suggestion.girRate)} from that range, ${suggestion.rounds} rounds)`;
  }

  if (suggestion.metric === 'par5_reachable' && suggestion.label) {
    return `Your ${suggestion.label} can reach from a good tee shot. Consider going for it in two.`;
  }

  if (suggestion.metric === 'tee_club' && suggestion.label) {
    const fairway = typeof suggestion.fairwayRate === 'number'
      ? `${formatPercent(suggestion.fairwayRate)} fairways`
      : typeof suggestion.avgScore === 'number'
        ? `avg ${suggestion.avgScore.toFixed(1)}`
        : `${suggestion.rounds} rounds`;
    return `${suggestion.label}, ${fairway} on this hole over ${suggestion.rounds} rounds.`;
  }

  if (
    suggestion.metric === 'avg_score' &&
    typeof suggestion.avgScore === 'number' &&
    typeof suggestion.competitorAvgScore === 'number' &&
    suggestion.competitorLabel
  ) {
    return `${suggestion.label} averages ${suggestion.avgScore.toFixed(1)} on this hole vs ${suggestion.competitorAvgScore.toFixed(1)} with ${suggestion.competitorLabel} over ${suggestion.rounds} rounds.`;
  }

  if (suggestion.metric === 'avg_score' && typeof suggestion.avgScore === 'number') {
    return `You average ${suggestion.avgScore.toFixed(1)} on this hole over ${suggestion.rounds} rounds.`;
  }

  if (suggestion.metric === 'fairway_rate' && typeof suggestion.fairwayRate === 'number') {
    return `${suggestion.label}, ${Math.round(suggestion.fairwayRate * 100)}% fairways on this hole over ${suggestion.rounds} rounds.`;
  }

  if (suggestion.metric === 'approach_distance' && typeof suggestion.avgApproachYards === 'number') {
    return `${suggestion.label} leaves about ${Math.round(suggestion.avgApproachYards)}y in on this hole.`;
  }

  return null;
}

function buildSuggestionFromTipType(
  tip: ReturnType<typeof selectTipType>,
  fallback: HoleSuggestion,
  par: number,
  holeNumber: number,
  holeLength: number | null,
  playerRating?: number | null
): HoleSuggestion {
  const playerGroup = getPlayerRatingGroup(playerRating);

  if (tip.type === 'building') {
    return {
      ...fallback,
      state: 'building',
      rounds: tip.rounds,
      par,
      holeNumber,
      title: 'Hole history',
      body:
        tip.rounds <= 0
          ? 'No history on this hole yet'
          : tip.rounds === 1
            ? '1 round here so far'
            : `${tip.rounds} rounds here so far`,
      support:
        typeof fallback.fallbackYards === 'number'
          ? `${Math.round(fallback.fallbackYards)}y today`
          : 'Play this hole a few times and tips will appear here',
    };
  }

  if (tip.type === 'approach_club_par3') {
    const copy = buildPar3BestClubCopy(
      playerGroup,
      String(tip.club || fallback.label),
      fallback.fallbackYards ?? null,
      Number(tip.girRate || 0),
      tip.rounds,
    );
    return {
      ...fallback,
      state: 'data_backed',
      label: String(tip.club || fallback.label),
      club: normalizeClubKey(String(tip.club || fallback.label)),
      metric: 'approach_club_par3',
      rounds: tip.rounds,
      par,
      holeNumber,
      girRate: tip.girRate,
      title: copy.title,
      body: copy.body,
      support: `${tip.rounds} rounds here`,
    };
  }

  if (tip.type === 'gir_low_par3') {
    const copy = buildPar3ToughGreenCopy(playerGroup, Number(tip.girRate || 0));
    return {
      ...fallback,
      state: 'data_backed',
      metric: 'gir_low_par3',
      rounds: tip.rounds,
      par,
      holeNumber,
      girRate: tip.girRate,
      title: copy.title,
      body: copy.body,
      support: `${tip.rounds} rounds here`,
    };
  }

  if (tip.type === 'strong_green_par3') {
    const copy = buildPar3StrongGreenCopy(
      playerGroup,
      String(tip.club || fallback.label),
      Number(tip.girRate || 0),
    );
    return {
      ...fallback,
      state: 'data_backed',
      label: String(tip.club || fallback.label),
      club: normalizeClubKey(String(tip.club || fallback.label)),
      metric: 'strong_green_par3',
      rounds: tip.rounds,
      par,
      holeNumber,
      girRate: tip.girRate,
      title: copy.title,
      body: copy.body,
      support: `${tip.rounds} rounds here`,
    };
  }

  if (tip.type === 'distance_based_par3') {
    return {
      ...fallback,
      state: 'data_backed',
      label: String(tip.club || fallback.label),
      club: normalizeClubKey(String(tip.club || fallback.label)),
      metric: 'distance_based_par3',
      rounds: tip.rounds,
      par,
      holeNumber,
      title: 'Off the tee',
      body: buildPar3DistanceBody(
        playerGroup,
        String(tip.club || fallback.label),
        fallback.fallbackYards ?? null,
        tip.clubYards ?? fallback.fallbackYards ?? null,
      ),
      support: `${tip.rounds} rounds here`,
    };
  }

  if (tip.type === 'par5_reachable') {
    return {
      ...fallback,
      state: 'data_backed',
      label: String(tip.club || fallback.label),
      metric: 'par5_reachable',
      rounds: tip.rounds,
      par,
      holeNumber,
      title: 'Reachable in two',
      body: `Your ${tip.club} can reach from a good tee shot. Consider going for it in two.`,
      support: `${tip.rounds} rounds here`,
    };
  }

  if (tip.type === 'best_leave') {
    const leaveLabel = par === 5 ? 'Layup target' : 'Best leave';
    return {
      ...fallback,
      state: 'data_backed',
      metric: 'best_leave',
      rounds: tip.rounds,
      par,
      holeNumber,
      bestLeaveMin: tip.bestLeaveMin,
      bestLeaveMax: tip.bestLeaveMax,
      girRate: tip.girRate,
      girRateAtLeave: tip.girRate,
      title: leaveLabel,
      body: `Leave ${tip.bestLeaveMin}-${tip.bestLeaveMax}y in. ${formatPercent(tip.girRate)} GIR from that range over ${tip.rounds} rounds.`,
      support: `${tip.rounds} rounds here`,
    };
  }

  if (tip.type === 'tee_club') {
    return {
      ...fallback,
      state: 'data_backed',
      label: String(tip.club || fallback.label),
      club: normalizeClubKey(String(tip.club || fallback.label)),
      metric: 'tee_club',
      rounds: tip.rounds,
      par,
      holeNumber,
      fairwayRate: tip.fairwayRate ?? null,
      avgScore: tip.avgScore ?? null,
      title: 'Off the tee',
      body: typeof tip.fairwayRate === 'number'
        ? `${tip.club}, ${formatPercent(tip.fairwayRate)} fairways on this hole over ${tip.rounds} rounds.`
        : `${tip.club}, avg ${Number(tip.avgScore || 0).toFixed(1)} on this hole over ${tip.rounds} rounds.`,
      support: `${tip.rounds} rounds here`,
    };
  }

  return {
    ...fallback,
    ...(() => {
      if (par === 3) {
        const distanceClub = getDistanceBasedPar3Club(fallback.fallbackYards ?? null, { club: fallback.label, yards: fallback.fallbackYards }, null);
        const copy = buildPar3ScoringTrendCopy(
          playerGroup,
          tip.avgScore ?? null,
          par,
          tip.rounds,
          holeNumber,
          distanceClub?.label ?? fallback.label,
          distanceClub?.yards ?? fallback.fallbackYards ?? null,
        );
        return {
          state: 'data_backed' as const,
          metric: 'scoring_trend' as const,
          rounds: tip.rounds,
          par,
          holeNumber,
          avgScore: tip.avgScore ?? null,
          holeLength,
          title: copy.title,
          body: copy.body,
          support: `${tip.rounds} rounds here`,
        };
      }
      return null;
    })(),
    ...fallback,
    ...(par !== 3 ? {
      state: 'data_backed' as const,
      metric: 'avg_score' as const,
      rounds: tip.rounds,
      par,
      holeNumber,
      avgScore: tip.avgScore ?? null,
      holeLength,
      title: `Hole ${holeNumber}`,
      body: `You average ${Number(tip.avgScore || 0).toFixed(1)} on this hole over ${tip.rounds} rounds.`,
      support: `${tip.rounds} rounds here`,
    } : {}),
  };
}

export function getSuggestion(
  rounds: SavedRound[],
  holeNumber: number,
  optionsOrFallback?: SuggestionOptions | FallbackClub | null
): HoleSuggestion {
  const options: SuggestionOptions =
    optionsOrFallback && ('fallbackClub' in (optionsOrFallback as SuggestionOptions) || 'par' in (optionsOrFallback as SuggestionOptions) || 'clubTotals' in (optionsOrFallback as SuggestionOptions))
      ? (optionsOrFallback as SuggestionOptions)
      : { fallbackClub: (optionsOrFallback as FallbackClub | null) || null };

  const par = Number(options.par || 4);
  const holeStats = summarizeHoleStats(rounds, holeNumber);
  const fallback = getFallbackSuggestion(options.fallbackClub, par, holeNumber);

  const tip = selectTipType(
    par,
    {
      ...holeStats,
      holeLength:
        typeof options.holeLength === 'number' && Number.isFinite(options.holeLength)
          ? options.holeLength
          : holeStats.holeLength,
    },
    options.clubTotals,
    rounds,
    holeNumber,
    options.gpsDistanceYards ?? options.fallbackClub?.yards ?? null,
    options.fallbackClub ?? null,
  );

  return buildSuggestionFromTipType(
    tip,
    {
      ...fallback,
      fallbackYards:
        typeof options.gpsDistanceYards === 'number'
          ? options.gpsDistanceYards
          : fallback.fallbackYards,
    },
    par,
    holeNumber,
    typeof options.holeLength === 'number' ? options.holeLength : holeStats.holeLength,
    options.playerRating ?? null,
  );
}
