import type { CourseSnapshot, RoundHole, SavedRound } from '../types';

export type DoglegType = 'right' | 'left' | 'straight';

export type AnalysisTab = 'coaching' | 'holes' | 'averages' | 'dispersion';

export interface CoachResource {
  title: string;
  url: string;
}

export interface AnalysisHole {
  number: number;
  par: number;
  score: number;
  delta: number;
  dogleg: DoglegType;
  fairwayHit: RoundHole['fairwayHit'];
  greenHit: RoundHole['greenHit'];
  teeClub?: string | null;
  approachClub?: string | null;
  fairwayBunker?: boolean;
  greenSideBunker?: boolean;
  putts?: number | null;
  firstPuttDistance?: number | null;
  pinLocation?: 'front' | 'middle' | 'back' | null;
}

export interface AnalysisShot {
  id: string;
  holeNumber: number;
  holePar: number;
  holeDelta: number;
  dogleg: DoglegType;
  shotNumber: number | null;
  club: string;
  clubLabel: string;
  lie: string | null;
  dist: number | null;
  adj: number | null;
  sx: number | null;
  sy: number | null;
  resultLie: string | null;
  greenResult: 'hit' | 'short' | 'long' | 'left' | 'right' | null;
  fairwayResult: 'hit' | 'left' | 'right' | null;
  isApproach: boolean;
  isTeeShot: boolean;
  isLayup: boolean;
  isRecovery: boolean;
}

export interface OverviewCell {
  label: string;
  value: string;
  tone: 'green' | 'amber' | 'red' | 'white';
}

export interface InsightCard {
  badge: string;
  title: string;
  tone: 'green' | 'amber' | 'red';
  note: string;
  support?: string | null;
  resources?: CoachResource[];
}

export interface GroupCard {
  key: string;
  label: string;
  avgDelta: number | null;
  tone: 'green' | 'amber' | 'red' | 'white';
  holeCount: number;
  holes: AnalysisHole[];
  birdies: number;
  pars: number;
  overPar: number;
  fairwayHitCount: number;
  fairwayTotal: number;
  coachingNote: string | null;
}

export interface LieSummary {
  lie: string;
  color: string;
  count: number;
}

export interface ClubAverageRow {
  club: string;
  clubLabel: string;
  gpsAvg: number | null;
  playingAvg: number | null;
  count: number;
  byLie: Array<{
    lie: string;
    color: string;
    gpsAvg: number | null;
    playingAvg: number | null;
    deltaVsFairway: number | null;
    count: number;
  }>;
}

export interface DistanceEngineSummary {
  avgGps: number | null;
  avgPlaying: number | null;
  avgDelta: number | null;
  maxDelta: number | null;
  note: string | null;
}

export interface DistanceBandRow {
  label: string;
  count: number;
  girPct: number | null;
  avgDelta: number | null;
  tone: 'green' | 'amber' | 'red' | 'white';
}

export interface LieImpactRow {
  label: string;
  count: number;
  avgDelta: number | null;
  deltaVsFairway: number | null;
  tone: 'green' | 'amber' | 'red' | 'white';
}

export interface ClubMissRow {
  club: string;
  clubLabel: string;
  color: string;
  count: number;
  shortPct: number;
  longPct: number;
  leftPct: number;
  rightPct: number;
  dominant: 'SHORT' | 'LONG' | 'LEFT' | 'RIGHT' | null;
}

export interface TeeClubPerformanceRow {
  club: string;
  clubLabel: string;
  color: string;
  count: number;
  fairwayPct: number | null;
  avgPlaying: number | null;
  avgDelta: number | null;
  tag: string | null;
}

export interface PuttingSummary {
  trackedHoles: number;
  totalPutts: number | null;
  avgPutts: number | null;
  avgFirstPuttDistance: number | null;
  pinLocations: Array<{ label: 'Front' | 'Middle' | 'Back'; count: number }>;
  pinLocationRows: Array<{ label: 'Front' | 'Middle' | 'Back'; count: number; avgPutts: number | null; avgFirstPuttDistance: number | null }>;
  firstPuttBuckets: Array<{ label: string; count: number; avgPutts: number | null; threePuttPct: number | null }>;
}

export interface PracticeFocusCard {
  title: string;
  why: string;
  drill: string;
  resources: CoachResource[];
}

export interface DispersionClub {
  club: string;
  clubLabel: string;
  color: string;
  shots: AnalysisShot[];
  points: Array<{ x: number; y: number }>;
  centroid: { x: number; y: number } | null;
  spread: number | null;
  missLabel: string;
  note: string;
}

export interface RoundAnalysisData {
  holes: AnalysisHole[];
  shots: AnalysisShot[];
  holeCount: number;
  totalScore: number;
  totalPar: number;
  scoreToPar: number;
  playTimeMinutes: number | null;
  playTimeLabel: string | null;
  scoreCells: Array<{ number: number; delta: number }>;
  overviewCells: OverviewCell[];
  strengthCard: InsightCard | null;
  focusCard: InsightCard | null;
  shapeStrengthCard: InsightCard | null;
  shapeFocusCard: InsightCard | null;
  mostCostlyPattern: InsightCard | null;
  bestScoringWindowCard: InsightCard | null;
  targetDistanceCard: InsightCard | null;
  lieImpactCard: InsightCard | null;
  puttingCard: InsightCard | null;
  pinLocationCard: InsightCard | null;
  nextPracticeFocus: PracticeFocusCard | null;
  patternInsights: InsightCard[];
  parGroups: GroupCard[];
  doglegGroups: GroupCard[];
  lieSummaries: LieSummary[];
  clubAverageRows: ClubAverageRow[];
  distanceEngineSummary: DistanceEngineSummary | null;
  distanceBandRows: DistanceBandRow[];
  lieImpactRows: LieImpactRow[];
  clubMissRows: ClubMissRow[];
  teeClubPerformanceRows: TeeClubPerformanceRow[];
  puttingSummary: PuttingSummary | null;
  teeShotTendency: {
    fairwayPct: number | null;
    leftCount: number;
    rightCount: number;
    label: string | null;
  };
  dispersionClubs: DispersionClub[];
  availableDoglegs: DoglegType[];
}

const CLUB_META: Record<string, { label: string; color: string }> = {
  dr: { label: 'Driver', color: '#F87171' },
  driver: { label: 'Driver', color: '#F87171' },
  '3w': { label: '3 Wood', color: '#FB923C' },
  '3 wood': { label: '3 Wood', color: '#FB923C' },
  '5i': { label: '5 Iron', color: '#FBBF24' },
  '5 iron': { label: '5 Iron', color: '#FBBF24' },
  '6i': { label: '6 Iron', color: '#EAB308' },
  '6 iron': { label: '6 Iron', color: '#EAB308' },
  '7i': { label: '7 Iron', color: '#A3E635' },
  '7 iron': { label: '7 Iron', color: '#A3E635' },
  '8i': { label: '8 Iron', color: '#34D399' },
  '8 iron': { label: '8 Iron', color: '#34D399' },
  '9i': { label: '9 Iron', color: '#22D3EE' },
  '9 iron': { label: '9 Iron', color: '#22D3EE' },
  pw: { label: 'PW', color: '#60A5FA' },
  gw: { label: 'GW', color: '#A78BFA' },
  sw: { label: 'SW', color: '#E879F9' },
};

const LIE_COLORS: Record<string, string> = {
  Fairway: '#4CAF7D',
  Rough: '#A3E635',
  'Left Rough': '#A3E635',
  'Right Rough': '#A3E635',
  Sand: '#FBBF24',
  'Fairway Bunker': '#FBBF24',
  'Greenside Bunker': '#F59E0B',
  'Tee Box': '#60A5FA',
  Tee: '#60A5FA',
  Green: '#34D399',
  Trees: '#86EFAC',
  Water: '#60A5FA',
};

const CHANNELS = {
  swing: 'Athletic Motion Golf',
  swingAlt: 'Chris Ryan Golf',
  shortGame: 'Phil Mickelson',
  shortGameAlt: 'Porzak Golf',
  putting: 'Dave Pelz',
  strategy: 'Eric Cogorno',
};

const avg = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);
const roundPct = (value: number) => Math.round(value * 100);

const normalizeDogleg = (value: unknown): DoglegType => {
  if (typeof value !== 'string') return 'straight';
  const lower = value.trim().toLowerCase();
  if (lower === 'left') return 'left';
  if (lower === 'right') return 'right';
  return 'straight';
};

const getSnapshotHole = (snapshot: CourseSnapshot | undefined, holeNumber: number) =>
  snapshot?.holes?.find((hole) => hole.number === holeNumber);

const getGpsHoleSummaryMap = (round: SavedRound) =>
  new Map((round.gpsHoleSummaries ?? []).map((summary) => [summary.holeNumber, summary]));

const getRoundPar = (round: SavedRound, playedHoles: AnalysisHole[]) => {
  if (round.stats?.coursePar) return round.stats.coursePar;
  if (round.stats?.totalPar) return round.stats.totalPar;
  if (playedHoles.length) return playedHoles.reduce((sum, hole) => sum + hole.par, 0);
  if (round.courseSnapshot?.holes?.length) {
    return round.courseSnapshot.holes.reduce((sum, hole) => sum + hole.par, 0);
  }
  return 72;
};

const getScoreTone = (delta: number): OverviewCell['tone'] => {
  if (delta < 0) return 'green';
  if (delta > 0) return 'red';
  return 'white';
};

const getPlayTimeMinutes = (round: SavedRound): number | null => {
  if (typeof round.roundDurationMinutes === 'number' && Number.isFinite(round.roundDurationMinutes) && round.roundDurationMinutes > 0) {
    return Math.round(round.roundDurationMinutes);
  }
  if (typeof round.roundStartedAt === 'number' && typeof round.roundEndedAt === 'number') {
    const diff = round.roundEndedAt - round.roundStartedAt;
    if (Number.isFinite(diff) && diff > 0) {
      return Math.max(1, Math.round(diff / 60000));
    }
  }
  return null;
};

const formatPlayTime = (minutes: number | null) => {
  if (minutes === null) return null;
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
};

const getAverageTone = (value: number | null, highRisk = 0.5): OverviewCell['tone'] => {
  if (value === null) return 'white';
  if (value <= 0) return 'green';
  if (value <= highRisk) return 'amber';
  return 'red';
};

const formatDelta = (value: number | null, digits = 1) => {
  if (value === null) return '—';
  if (Math.abs(value) < 0.05) return 'E';
  const rounded = value.toFixed(digits);
  return value > 0 ? `+${rounded}` : rounded;
};

const formatScoreDelta = (delta: number) => {
  if (delta <= -2) return `E${delta}`;
  if (delta === -1) return '-1';
  if (delta === 0) return 'E';
  if (delta === 1) return '+1';
  return `+${delta}`;
};

const getScoreColor = (delta: number) => {
  if (delta <= -2) return '#22D3EE';
  if (delta === -1) return '#4CAF7D';
  if (delta === 0) return 'rgba(255,255,255,0.08)';
  if (delta === 1) return '#FBBF24';
  return '#F87171';
};

const isFairwayHit = (value: RoundHole['fairwayHit']) => value === true;
const isLeftMiss = (value: RoundHole['fairwayHit']) => value === 'left' || value === 'double-left';
const isRightMiss = (value: RoundHole['fairwayHit']) => value === 'right' || value === 'double-right';

const getParCoaching = (par: number, avgDelta: number | null, best: boolean) => {
  if (avgDelta === null) return null;
  if (best) {
    if (par === 3) return 'Your par-3 routine held up. Keep trusting your number and making committed swings to a clear target.';
    if (par === 4) return 'Your par-4 management was stable. Keep prioritizing the fairway and take the easy middle of the green when needed.';
    return 'Your par-5 plan worked. Stay patient and keep choosing preferred layup numbers instead of forcing the second shot.';
  }
  if (avgDelta <= 0.5) return null;
  if (par === 3) return 'Par 3s require precision over flag hunting. Pick a wider target, trust the yardage, and commit fully to the club.';
  if (par === 4) return 'Pars first on par 4s. Put the tee ball in play and let the approach start from the fairway more often.';
  return 'Par 5s should not demand hero shots. Lay up to a favorite number when the green is not a realistic second-shot target.';
};

const getDoglegCoaching = (dogleg: DoglegType, avgDelta: number | null, best: boolean) => {
  if (avgDelta === null) return null;
  if (best) {
    if (dogleg === 'right') return 'Dogleg-right holes fit your eye. Keep using the corner as the visual target and trust the shape.';
    if (dogleg === 'left') return 'Dogleg-left holes were stable. Keep committing to the outside edge and taking the widest landing zone.';
    return 'Straight holes were productive. Keep treating them as chances to play simple, center-face golf.';
  }
  if (avgDelta <= 0.8) return null;
  if (dogleg === 'right') return 'Play to the corner instead of trying to cut too much off the dogleg. Less club can create a wider approach window.';
  if (dogleg === 'left') return 'Aim to the outside edge of the corner and prioritize the widest landing area. Forced shape adds needless risk here.';
  return 'Straight holes should be scoring holes. Build a conservative tee target so the approach can be more aggressive.';
};

const normalizeClub = (value: string | null | undefined) => {
  if (!value) return null;
  const key = value.trim().toLowerCase();
  return key.length ? key : null;
};

const normalizeLieLabel = (lie: string | null | undefined) => {
  if (!lie) return null;
  if (lie === 'Left Rough' || lie === 'Right Rough') return 'Rough';
  return lie;
};

const getClubMeta = (club: string | null | undefined) => {
  const key = normalizeClub(club);
  if (!key) return { label: 'Club', color: '#4CAF7D', key: 'unknown' };
  return {
    label: CLUB_META[key]?.label ?? club ?? 'Club',
    color: CLUB_META[key]?.color ?? '#4CAF7D',
    key,
  };
};

const getLieColor = (lie: string | null | undefined) => {
  if (!lie) return 'rgba(255,255,255,0.35)';
  return LIE_COLORS[lie] ?? 'rgba(255,255,255,0.35)';
};

const buildYouTubeSearchURL = (channelName: string, query: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`${query} ${channelName}`)}`;

const getCoachResources = (topic: string): CoachResource[] => {
  switch (topic) {
    case 'approach-short':
      return [
        { title: 'Approach distance control', url: buildYouTubeSearchURL(CHANNELS.shortGame, 'approach shot distance control take enough club') },
        { title: 'Club selection and commitment', url: buildYouTubeSearchURL(CHANNELS.swing, 'golf club selection approach iron') },
      ];
    case 'approach-long':
      return [
        { title: 'Iron tempo for distance control', url: buildYouTubeSearchURL(CHANNELS.swing, 'golf tempo drill distance control iron') },
        { title: 'Flyer and distance control', url: buildYouTubeSearchURL(CHANNELS.shortGameAlt, 'flyer lie distance control iron') },
      ];
    case 'tee-right':
      return [
        { title: 'Fix right miss off the tee', url: buildYouTubeSearchURL(CHANNELS.swing, 'fix slice driver simple drill') },
        { title: 'Clubface control at impact', url: buildYouTubeSearchURL(CHANNELS.swingAlt, 'clubface control impact drill') },
      ];
    case 'tee-left':
      return [
        { title: 'Fix left miss off the tee', url: buildYouTubeSearchURL(CHANNELS.swing, 'fix hook driver simple') },
        { title: 'Grip and face control', url: buildYouTubeSearchURL(CHANNELS.swingAlt, 'golf grip neutral fix hook') },
      ];
    case 'rough':
      return [
        { title: 'Distance loss from rough', url: buildYouTubeSearchURL(CHANNELS.shortGameAlt, 'rough lie iron distance control golf') },
        { title: 'Rough lie strategy', url: buildYouTubeSearchURL(CHANNELS.strategy, 'golf course management rough lie strategy') },
      ];
    case 'fairway-bunker':
      return [
        { title: 'Fairway bunker basics', url: buildYouTubeSearchURL(CHANNELS.shortGame, 'fairway bunker basics golf') },
        { title: 'Fairway bunker setup and strike', url: buildYouTubeSearchURL(CHANNELS.shortGameAlt, 'fairway bunker iron setup golf') },
      ];
    case 'wedge-window':
      return [
        { title: 'Wedge distance ladder drill', url: buildYouTubeSearchURL(CHANNELS.shortGameAlt, 'wedge distance ladder drill golf') },
        { title: 'Build a stock scoring yardage', url: buildYouTubeSearchURL(CHANNELS.strategy, 'golf layup favorite yardage strategy') },
      ];
    case 'par5':
      return [
        { title: 'Par-5 course management', url: buildYouTubeSearchURL(CHANNELS.strategy, 'par 5 course management layup distance golf') },
        { title: 'Lay up to a favorite number', url: buildYouTubeSearchURL(CHANNELS.strategy, 'golf lay up to favorite number strategy') },
      ];
    case 'dogleg-right':
      return [
        { title: 'Dogleg right tee strategy', url: buildYouTubeSearchURL(CHANNELS.strategy, 'dogleg right tee shot strategy golf') },
        { title: 'Play to the corner', url: buildYouTubeSearchURL(CHANNELS.strategy, 'golf course management play to corner dogleg') },
      ];
    case 'dogleg-left':
      return [
        { title: 'Dogleg left tee strategy', url: buildYouTubeSearchURL(CHANNELS.strategy, 'dogleg left tee shot strategy golf') },
        { title: 'Targeting the outside edge', url: buildYouTubeSearchURL(CHANNELS.strategy, 'golf course management target outside edge dogleg') },
      ];
    case 'recovery':
      return [
        { title: 'Smart recovery golf', url: buildYouTubeSearchURL(CHANNELS.strategy, 'golf recovery shot course management') },
        { title: 'Punch-out discipline', url: buildYouTubeSearchURL(CHANNELS.strategy, 'punch out golf strategy avoid hero shots') },
      ];
    default:
      return [];
  }
};

const createFallbackShots = (holes: AnalysisHole[]) => {
  const shots: AnalysisShot[] = [];
  holes.forEach((hole) => {
    if (hole.par >= 4 && hole.teeClub) {
      const meta = getClubMeta(hole.teeClub);
      shots.push({
        id: `${hole.number}-tee`,
        holeNumber: hole.number,
        holePar: hole.par,
        holeDelta: hole.delta,
        dogleg: hole.dogleg,
        shotNumber: 1,
        club: meta.key,
        clubLabel: meta.label,
        lie: 'Tee Box',
        dist: null,
        adj: null,
        sx: null,
        sy: null,
        resultLie: null,
        greenResult: null,
        fairwayResult: hole.fairwayHit === true ? 'hit' : isLeftMiss(hole.fairwayHit) ? 'left' : isRightMiss(hole.fairwayHit) ? 'right' : null,
        isApproach: false,
        isTeeShot: true,
        isLayup: false,
        isRecovery: false,
      });
    }
    if (hole.approachClub) {
      const meta = getClubMeta(hole.approachClub);
      shots.push({
        id: `${hole.number}-app`,
        holeNumber: hole.number,
        holePar: hole.par,
        holeDelta: hole.delta,
        dogleg: hole.dogleg,
        shotNumber: hole.par === 3 ? 1 : 2,
        club: meta.key,
        clubLabel: meta.label,
        lie: hole.fairwayBunker ? 'Fairway Bunker' : hole.greenSideBunker ? 'Greenside Bunker' : hole.greenHit === true ? 'Fairway' : null,
        dist: null,
        adj: null,
        sx: null,
        sy: null,
        resultLie: hole.greenHit === true ? 'Green' : null,
        greenResult: hole.greenHit === true
          ? 'hit'
          : hole.greenHit === 'short' || hole.greenHit === 'long' || hole.greenHit === 'left' || hole.greenHit === 'right'
            ? hole.greenHit
            : null,
        fairwayResult: null,
        isApproach: true,
        isTeeShot: false,
        isLayup: false,
        isRecovery: false,
      });
    }
  });
  return shots;
};

const extractShots = (round: SavedRound, holes: AnalysisHole[]) => {
  const anyRound = round as SavedRound & {
    gpsShots?: unknown[];
    shots?: unknown[];
    shotHistory?: unknown[];
    loggedShotsByHole?: Record<string, unknown[]>;
  };
  const fromRoundShots = Array.isArray(anyRound.shots) ? anyRound.shots : [];
  const fromGpsShots = Array.isArray(anyRound.gpsShots) ? anyRound.gpsShots : [];
  const fromShotHistory = Array.isArray(anyRound.shotHistory) ? anyRound.shotHistory : [];
  const fromLoggedByHole = anyRound.loggedShotsByHole
    ? Object.entries(anyRound.loggedShotsByHole).flatMap(([holeNumber, entries]) =>
        Array.isArray(entries)
          ? entries.map((entry, entryIndex) => ({
              ...(entry as Record<string, unknown>),
              holeNumber: Number(holeNumber) + 1,
              shotNumber: typeof (entry as Record<string, unknown>).shotNumber === 'number'
                ? (entry as Record<string, unknown>).shotNumber
                : entryIndex + 1,
            }))
          : []
      )
    : [];
  const holeShots = (round.holes ?? []).flatMap((hole) => {
    const anyHole = hole as RoundHole & { shots?: unknown[] };
    return Array.isArray(anyHole.shots)
      ? anyHole.shots.map((shot, shotIndex) => ({
          ...(shot as Record<string, unknown>),
          holeNumber: hole.number,
          shotNumber: typeof (shot as Record<string, unknown>).shotNumber === 'number'
            ? (shot as Record<string, unknown>).shotNumber
            : shotIndex + 1,
        }))
      : [];
  });

  const rawShots = [...fromGpsShots, ...fromRoundShots, ...fromShotHistory, ...fromLoggedByHole, ...holeShots];
  if (!rawShots.length) return createFallbackShots(holes);

  const holeMap = new Map(holes.map((hole) => [hole.number, hole]));

  return rawShots
    .map((shot, index) => {
      const anyShot = shot as Record<string, unknown>;
      const meta = getClubMeta(typeof anyShot.club === 'string' ? anyShot.club : null);
      const holeNumber = typeof anyShot.holeNumber === 'number'
        ? anyShot.holeNumber
        : typeof anyShot.hole === 'number'
          ? anyShot.hole
          : index + 1;
      const hole = holeMap.get(holeNumber);
      const lieRaw = typeof anyShot.lie === 'string' ? anyShot.lie : null;
      const shotNumber = typeof anyShot.shotNumber === 'number'
        ? anyShot.shotNumber
        : typeof anyShot.num === 'number'
          ? anyShot.num
          : typeof anyShot.strokeNumber === 'number'
            ? anyShot.strokeNumber
            : null;
      const fairwayResult = typeof anyShot.fairwayResult === 'string'
        ? (anyShot.fairwayResult as 'hit' | 'left' | 'right')
        : shotNumber === 1 && hole
          ? hole.fairwayHit === true
            ? 'hit'
            : isLeftMiss(hole.fairwayHit)
              ? 'left'
              : isRightMiss(hole.fairwayHit)
                ? 'right'
                : null
          : null;
      const greenResult = typeof anyShot.greenResult === 'string'
        ? (anyShot.greenResult as 'hit' | 'short' | 'long' | 'left' | 'right')
        : hole?.greenHit === true
          ? 'hit'
          : hole?.greenHit === 'short' || hole?.greenHit === 'long' || hole?.greenHit === 'left' || hole?.greenHit === 'right'
            ? hole.greenHit
            : null;
      const normalizedLie = lieRaw === 'Sand' && hole?.fairwayBunker
        ? 'Fairway Bunker'
        : lieRaw === 'Sand' && hole?.greenSideBunker
          ? 'Greenside Bunker'
          : lieRaw;
      const isTeeShot = typeof anyShot.isTeeShot === 'boolean'
        ? anyShot.isTeeShot
        : normalizedLie === 'Tee Box' || normalizedLie === 'Tee' || (shotNumber === 1 && (hole?.par ?? 4) >= 4);
      const isApproach = typeof anyShot.isApproach === 'boolean'
        ? anyShot.isApproach
        : greenResult !== null || (typeof shotNumber === 'number' && ((hole?.par ?? 4) === 3 ? shotNumber === 1 : shotNumber === 2));
      return {
        id: String(anyShot.id ?? `${holeNumber}-${index}`),
        holeNumber,
        holePar: hole?.par ?? (typeof anyShot.holePar === 'number' ? anyShot.holePar : 4),
        holeDelta: hole?.delta ?? 0,
        dogleg: hole?.dogleg ?? normalizeDogleg(anyShot.dogleg),
        shotNumber,
        club: meta.key,
        clubLabel: meta.label,
        lie: normalizedLie,
        dist: typeof anyShot.actualYards === 'number'
          ? anyShot.actualYards
          : typeof anyShot.dist === 'number'
            ? anyShot.dist
            : null,
        adj: typeof anyShot.playingYards === 'number'
          ? anyShot.playingYards
          : typeof anyShot.adj === 'number'
            ? anyShot.adj
            : null,
        sx: typeof anyShot.sx === 'number' ? anyShot.sx : null,
        sy: typeof anyShot.sy === 'number' ? anyShot.sy : null,
        resultLie: typeof anyShot.resultLie === 'string' ? anyShot.resultLie : greenResult === 'hit' ? 'Green' : null,
        greenResult,
        fairwayResult,
        isApproach,
        isTeeShot,
        isLayup: typeof anyShot.isLayup === 'boolean'
          ? anyShot.isLayup
          : Boolean(!isApproach && !isTeeShot && (hole?.par ?? 4) === 5 && shotNumber === 2),
        isRecovery: typeof anyShot.isRecovery === 'boolean'
          ? anyShot.isRecovery
          : normalizedLie === 'Trees' || normalizedLie === 'Water' || normalizedLie === 'Fairway Bunker' || normalizedLie === 'Greenside Bunker',
      } satisfies AnalysisShot;
    })
    .filter((shot) => !!shot.club);
};

const buildOverview = (
  scoreToPar: number,
  parGroups: GroupCard[],
  doglegGroups: GroupCard[],
): OverviewCell[] => {
  const cellForGroup = (label: string, group: GroupCard | undefined, highRisk = 0.5): OverviewCell => ({
    label,
    value: formatDelta(group?.avgDelta ?? null),
    tone: getAverageTone(group?.avgDelta ?? null, highRisk),
  });

  return [
    { label: 'SCORE', value: scoreToPar > 0 ? `+${scoreToPar}` : scoreToPar < 0 ? `${scoreToPar}` : 'E', tone: getScoreTone(scoreToPar) },
    cellForGroup('PAR 3', parGroups.find((group) => group.key === 'par-3')),
    cellForGroup('PAR 4', parGroups.find((group) => group.key === 'par-4')),
    cellForGroup('PAR 5', parGroups.find((group) => group.key === 'par-5')),
    cellForGroup('DOGLEG RIGHT', doglegGroups.find((group) => group.key === 'right'), 1),
    cellForGroup('DOGLEG LEFT', doglegGroups.find((group) => group.key === 'left'), 1),
    cellForGroup('STRAIGHT', doglegGroups.find((group) => group.key === 'straight'), 1),
  ];
};

const buildStrengthFocusCards = (parGroups: GroupCard[]) => {
  const withData = parGroups.filter((group) => group.avgDelta !== null);
  if (!withData.length) {
    return { strengthCard: null, focusCard: null };
  }
  const sorted = [...withData].sort((a, b) => (a.avgDelta ?? 99) - (b.avgDelta ?? 99));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  return {
    strengthCard: {
      badge: best.label.replace('Par ', ''),
      title: `${best.label} strength`,
      tone: 'green' as const,
      note: getParCoaching(Number(best.label.replace('Par ', '')), best.avgDelta, true) ?? '',
    },
    focusCard: (worst.avgDelta ?? 0) > 0.5
      ? {
          badge: worst.label.replace('Par ', ''),
          title: `${worst.label} focus`,
          tone: 'red' as const,
          note: getParCoaching(Number(worst.label.replace('Par ', '')), worst.avgDelta, false) ?? '',
        }
      : null,
  };
};

const buildShapeCards = (doglegGroups: GroupCard[]) => {
  const withEnoughData = doglegGroups.filter((group) => group.holeCount >= 2 && group.avgDelta !== null);
  if (!withEnoughData.length) {
    return { shapeStrengthCard: null, shapeFocusCard: null };
  }
  const sorted = [...withEnoughData].sort((a, b) => (a.avgDelta ?? 99) - (b.avgDelta ?? 99));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  return {
    shapeStrengthCard: {
      badge: best.label === 'Straight' ? '—' : best.label === 'Dogleg Right' ? 'R' : 'L',
      title: `${best.label} strength`,
      tone: 'green' as const,
      note: getDoglegCoaching(best.key as DoglegType, best.avgDelta, true) ?? '',
    },
    shapeFocusCard: (worst.avgDelta ?? 0) > 0.8
      ? {
          badge: worst.label === 'Straight' ? '—' : worst.label === 'Dogleg Right' ? 'R' : 'L',
          title: `${worst.label} focus`,
          tone: 'red' as const,
          note: getDoglegCoaching(worst.key as DoglegType, worst.avgDelta, false) ?? '',
        }
      : null,
  };
};

const buildMostCostlyPattern = (
  parGroups: GroupCard[],
  teeShotTendency: RoundAnalysisData['teeShotTendency'],
  distanceBandRows: DistanceBandRow[],
  lieImpactRows: LieImpactRow[],
  clubMissRows: ClubMissRow[],
): InsightCard | null => {
  const candidates: Array<{ score: number; card: InsightCard }> = [];
  const worstBand = [...distanceBandRows]
    .filter((row) => row.count >= 2 && row.avgDelta !== null)
    .sort((a, b) => (b.avgDelta ?? -99) - (a.avgDelta ?? -99))[0];
  const worstLie = [...lieImpactRows]
    .filter((row) => row.label !== 'Fairway' && row.deltaVsFairway !== null)
    .sort((a, b) => (b.deltaVsFairway ?? -99) - (a.deltaVsFairway ?? -99))[0];
  const shortBiasClub = clubMissRows.find((row) => row.dominant === 'SHORT' && row.shortPct >= 40);
  const par5 = parGroups.find((group) => group.key === 'par-5');

  if (shortBiasClub) {
    candidates.push({
      score: shortBiasClub.shortPct,
      card: {
        badge: 'A',
        title: 'Most costly miss: approaches short',
        tone: 'red',
        support: `${shortBiasClub.clubLabel} missed short ${shortBiasClub.shortPct}% of the time.`,
        note: 'This was a distance-control issue more than a direction issue. Favor enough club and commit to the full motion.',
        resources: getCoachResources('approach-short'),
      },
    });
  }
  if (worstLie && (worstLie.deltaVsFairway ?? 0) >= 0.8) {
    candidates.push({
      score: (worstLie.deltaVsFairway ?? 0) * 30,
      card: {
        badge: 'L',
        title: `Most costly spot: ${worstLie.label.toLowerCase()} lies`,
        tone: 'red',
        support: `${worstLie.label} averaged ${formatDelta(worstLie.avgDelta)} relative to fairway ${formatDelta(lieImpactRows.find((row) => row.label === 'Fairway')?.avgDelta ?? null)}.`,
        note: worstLie.label === 'Fairway Bunker'
          ? 'Fairway bunkers were costing real strokes. Plan safer lines and rehearse clean bunker contact.'
          : 'The lie penalty was large enough to change both club and target. Treat these lies as scoring risk, not stock-yardage swings.',
        resources: worstLie.label === 'Fairway Bunker' ? getCoachResources('fairway-bunker') : getCoachResources('rough'),
      },
    });
  }
  if (worstBand && (worstBand.avgDelta ?? 0) > 1) {
    candidates.push({
      score: (worstBand.avgDelta ?? 0) * 20,
      card: {
        badge: 'D',
        title: `Most costly window: ${worstBand.label}`,
        tone: 'red',
        support: `${worstBand.label} averaged ${formatDelta(worstBand.avgDelta)} over ${worstBand.count} shot${worstBand.count === 1 ? '' : 's'}.`,
        note: 'This distance band cost the most relative to par. Use a bigger target and a stock number until this band settles down.',
        resources: getCoachResources('approach-short'),
      },
    });
  }
  if (teeShotTendency.label) {
    candidates.push({
      score: 35,
      card: {
        badge: 'T',
        title: `Most costly tee miss: ${teeShotTendency.label.toLowerCase()}`,
        tone: 'amber',
        support: `Tee misses split L ${teeShotTendency.leftCount} / R ${teeShotTendency.rightCount}.`,
        note: 'Starting the hole from the wrong side kept creating harder second shots. Pick a start line that removes the dominant miss.',
        resources: teeShotTendency.label === 'Missing right' ? getCoachResources('tee-right') : getCoachResources('tee-left'),
      },
    });
  }
  if ((par5?.avgDelta ?? 0) > 1) {
    candidates.push({
      score: (par5?.avgDelta ?? 0) * 18,
      card: {
        badge: '5',
        title: 'Most costly hole type: par 5s',
        tone: 'red',
        support: `Par 5s averaged ${formatDelta(par5?.avgDelta ?? null)} this round.`,
        note: 'Par 5s should be built around your favorite third-shot number. Lay up more often when the second shot is not clearly there.',
        resources: getCoachResources('par5'),
      },
    });
  }

  return [...candidates].sort((a, b) => b.score - a.score)[0]?.card ?? null;
};

const buildBestScoringWindowCard = (distanceBandRows: DistanceBandRow[]): InsightCard | null => {
  const best = [...distanceBandRows]
    .filter((row) => row.count >= 2 && row.avgDelta !== null)
    .sort((a, b) => (a.avgDelta ?? 99) - (b.avgDelta ?? 99))[0];
  if (!best) return null;
  return {
    badge: 'W',
    title: 'Best scoring window',
    tone: 'green',
    support: `${best.label} averaged ${formatDelta(best.avgDelta)} with ${best.girPct ?? 0}% greens hit.`,
    note: 'This was your best-performing yardage band. Keep feeding this number with smart layups and conservative tee choices.',
    resources: getCoachResources('wedge-window'),
  };
};

const buildTargetDistanceCard = (distanceBandRows: DistanceBandRow[]): InsightCard | null => {
  const best = [...distanceBandRows]
    .filter((row) => row.count >= 2 && row.avgDelta !== null)
    .sort((a, b) => (a.avgDelta ?? 99) - (b.avgDelta ?? 99))[0];
  if (!best) return null;
  return {
    badge: 'T',
    title: 'Target this number off the tee',
    tone: 'green',
    support: `${best.label} was your cleanest scoring band this round.`,
    note: `When the hole allows it, play the tee ball or layup to leave ${best.label}. That distance window is currently producing your best scoring.`,
    resources: getCoachResources('wedge-window'),
  };
};

const buildLieImpactCard = (lieImpactRows: LieImpactRow[]): InsightCard | null => {
  const fairway = lieImpactRows.find((row) => row.label === 'Fairway');
  const worst = [...lieImpactRows]
    .filter((row) => row.label !== 'Fairway' && row.deltaVsFairway !== null)
    .sort((a, b) => (b.deltaVsFairway ?? -99) - (a.deltaVsFairway ?? -99))[0];
  if (!fairway || !worst || (worst.deltaVsFairway ?? 0) < 0.5) return null;
  return {
    badge: 'L',
    title: 'Lie impact this round',
    tone: worst.label.includes('Bunker') ? 'red' : 'amber',
    support: `${worst.label} averaged ${formatDelta(worst.avgDelta)}. Fairway averaged ${formatDelta(fairway.avgDelta)}.`,
    note: `You scored ${worst.deltaVsFairway?.toFixed(1)} better from fairway than ${worst.label.toLowerCase()}. ${worst.label} needs more attention in practice and on-course decision making.`,
    resources: worst.label === 'Fairway Bunker' ? getCoachResources('fairway-bunker') : getCoachResources('rough'),
  };
};

const buildPuttingCard = (puttingSummary: PuttingSummary | null): InsightCard | null => {
  if (!puttingSummary || puttingSummary.trackedHoles < 3) return null;

  const avgPutts = puttingSummary.avgPutts;
  const avgFirstPuttDistance = puttingSummary.avgFirstPuttDistance;
  const longLagBucket = puttingSummary.firstPuttBuckets.find((bucket) => bucket.label === '30+ ft');

  if (longLagBucket && longLagBucket.count >= 2 && (longLagBucket.threePuttPct ?? 0) >= 34) {
    return {
      badge: 'P',
      title: 'Lag putting focus',
      tone: 'red',
      support: `${longLagBucket.threePuttPct}% of putts from 30+ ft became 3-putts.`,
      note: 'The main leak is pace from long range. Start practice with long putts that finish inside a 3-foot circle instead of chasing makes.',
      resources: getCoachResources('putting'),
    };
  }

  if (avgPutts !== null && avgPutts >= 2.2) {
    return {
      badge: 'P',
      title: 'Putting focus',
      tone: 'red',
      support: `Tracked greens averaged ${avgPutts.toFixed(1)} putts with a ${avgFirstPuttDistance !== null ? `${Math.round(avgFirstPuttDistance)} ft` : '—'} first putt.`,
      note: 'Too many strokes are staying on the green. Prioritize pace control first so the second putt keeps shrinking.',
      resources: getCoachResources('putting'),
    };
  }

  if (avgPutts !== null && avgPutts <= 1.9) {
    return {
      badge: 'P',
      title: 'Putting strength',
      tone: 'green',
      support: `Tracked greens averaged ${avgPutts.toFixed(1)} putts.`,
      note: 'Your speed control held up well on the greens. Keep leaning on the same first-look routine and commitment.',
      resources: getCoachResources('putting'),
    };
  }

  if (avgFirstPuttDistance !== null && avgFirstPuttDistance >= 24) {
    return {
      badge: 'P',
      title: 'Long first putts',
      tone: 'amber',
      support: `Average first putt distance was ${Math.round(avgFirstPuttDistance)} ft.`,
      note: 'You gave yourself a lot of long first putts. Favor safer approach targets when the round starts stretching putt length.',
      resources: getCoachResources('putting'),
    };
  }

  return null;
};

const buildPinLocationCard = (puttingSummary: PuttingSummary | null): InsightCard | null => {
  if (!puttingSummary || puttingSummary.pinLocationRows.length < 2) return null;

  const rows = puttingSummary.pinLocationRows.filter((row) => row.count >= 1 && row.avgPutts !== null);
  if (rows.length < 2) return null;

  const sorted = [...rows].sort((a, b) => (b.avgPutts ?? 0) - (a.avgPutts ?? 0));
  const worst = sorted[0];
  const best = sorted[sorted.length - 1];
  const gap = (worst.avgPutts ?? 0) - (best.avgPutts ?? 0);
  if (gap < 0.5) return null;

  return {
    badge: 'P',
    title: `${worst.label} pins were toughest`,
    tone: worst.label === 'Back' ? 'red' : 'amber',
    support: `${worst.label} pins averaged ${worst.avgPutts?.toFixed(1)} putts versus ${best.avgPutts?.toFixed(1)} on ${best.label.toLowerCase()} pins.`,
    note: worst.label === 'Back'
      ? 'Back pins stretched the first putt and raised the scoring cost on the green. Favor the safe side of the hole when the pin is deep.'
      : 'This pin position produced more work on the greens than the others. Use the wider part of the green and accept a longer birdie chance.',
    resources: getCoachResources('putting'),
  };
};

const buildNextPracticeFocus = (
  mostCostlyPattern: InsightCard | null,
  targetDistanceCard: InsightCard | null,
  lieImpactCard: InsightCard | null,
  puttingCard: InsightCard | null,
): PracticeFocusCard | null => {
  if (puttingCard?.title === 'Putting focus') {
    return {
      title: 'Lag putting pace',
      why: puttingCard.note,
      drill: 'Drop 10 balls from 25 to 40 feet and score each rep by whether the next putt finishes inside 3 feet.',
      resources: puttingCard.resources ?? [],
    };
  }
  if (mostCostlyPattern?.title.includes('approaches finishing short')) {
    return {
      title: '125-150y commitment',
      why: 'Short misses were the clearest scoring leak. Commit to enough club and a full finish.',
      drill: '10-ball ladder to a center-green target with one extra club. Track short / pin-high / long.',
      resources: getCoachResources('approach-short'),
    };
  }
  if (lieImpactCard?.title) {
    return {
      title: 'Lie management',
      why: lieImpactCard.note,
      drill: 'Alternate 5 fairway balls and 5 rough or bunker balls with the same club. Record carry loss and choose a stock adjustment.',
      resources: lieImpactCard.resources ?? [],
    };
  }
  if (targetDistanceCard) {
    return {
      title: 'Build a stock scoring yardage',
      why: targetDistanceCard.note,
      drill: 'Hit three-shot sequences that leave your best distance band. Choose a tee club and layup club that repeat the number.',
      resources: targetDistanceCard.resources ?? [],
    };
  }
  if (mostCostlyPattern) {
    return {
      title: 'Primary scoring leak',
      why: mostCostlyPattern.note,
      drill: 'Recreate the exact miss in a 15-minute block and keep one metric: start line, carry, or leave distance.',
      resources: mostCostlyPattern.resources ?? [],
    };
  }
  return null;
};

const buildPatternInsights = (
  holes: AnalysisHole[],
  parGroups: GroupCard[],
  doglegGroups: GroupCard[],
  lieImpactRows: LieImpactRow[],
  clubMissRows: ClubMissRow[],
  teeClubPerformanceRows: TeeClubPerformanceRow[],
  distanceBandRows: DistanceBandRow[],
  puttingSummary: PuttingSummary | null,
) => {
  const insights: InsightCard[] = [];
  const par3 = parGroups.find((group) => group.key === 'par-3');
  const par5 = parGroups.find((group) => group.key === 'par-5');
  const doglegRight = doglegGroups.find((group) => group.key === 'right');
  const doglegLeft = doglegGroups.find((group) => group.key === 'left');

  const teeHoles = holes.filter((hole) => hole.par >= 4);
  const leftRough = teeHoles.filter((hole) => isLeftMiss(hole.fairwayHit)).length;
  const rightRough = teeHoles.filter((hole) => isRightMiss(hole.fairwayHit)).length;
  const shortBiasClub = clubMissRows.find((row) => row.dominant === 'SHORT' && row.shortPct >= 40);
  const bestBand = [...distanceBandRows]
    .filter((row) => row.count >= 2 && row.avgDelta !== null)
    .sort((a, b) => (a.avgDelta ?? 99) - (b.avgDelta ?? 99))[0];
  const worstLie = [...lieImpactRows]
    .filter((row) => row.label !== 'Fairway' && row.deltaVsFairway !== null)
    .sort((a, b) => (b.deltaVsFairway ?? -99) - (a.deltaVsFairway ?? -99))[0];
  if (puttingSummary && puttingSummary.avgPutts !== null && puttingSummary.trackedHoles >= 3 && puttingSummary.avgPutts >= 2.2) {
    insights.push({
      badge: 'P',
      title: 'Putting pace needs attention',
      tone: 'amber',
      support: `${puttingSummary.avgPutts.toFixed(1)} putts per tracked hole.`,
      note: 'The fastest way to clean this up is better pace on the first putt. Make the comeback putt shorter before chasing more makes.',
      resources: getCoachResources('putting'),
    });
  }
  if (puttingSummary && puttingSummary.avgFirstPuttDistance !== null && puttingSummary.trackedHoles >= 3 && puttingSummary.avgFirstPuttDistance >= 24) {
    insights.push({
      badge: 'P',
      title: 'First putts are too long',
      tone: 'amber',
      support: `${Math.round(puttingSummary.avgFirstPuttDistance)} ft average first putt distance.`,
      note: 'Long first putts usually start with approach proximity. Feed more middle-green targets when approaches are leaking away from the hole.',
      resources: getCoachResources('putting'),
    });
  }
  const pinRows = puttingSummary?.pinLocationRows.filter((row) => row.avgPutts !== null) ?? [];
  if (pinRows.length >= 2) {
    const sortedPins = [...pinRows].sort((a, b) => (b.avgPutts ?? 0) - (a.avgPutts ?? 0));
    const worstPin = sortedPins[0];
    const bestPin = sortedPins[sortedPins.length - 1];
    const gap = (worstPin.avgPutts ?? 0) - (bestPin.avgPutts ?? 0);
    if (gap >= 0.5) {
      insights.push({
        badge: 'P',
        title: `${worstPin.label} pins demanded more`,
        tone: worstPin.label === 'Back' ? 'red' : 'amber',
        support: `${worstPin.avgPutts?.toFixed(1)} putts on ${worstPin.label.toLowerCase()} pins.`,
        note: 'Pin depth changed the scoring task on the green. Build more rounds around leaving uphill or center-green first putts when the hole is tucked deep.',
        resources: getCoachResources('putting'),
      });
    }
  }
  const longLagBucket = puttingSummary?.firstPuttBuckets.find((bucket) => bucket.label === '30+ ft');
  if (longLagBucket && longLagBucket.count >= 2 && (longLagBucket.threePuttPct ?? 0) >= 34) {
    insights.push({
      badge: 'P',
      title: '3-putts rise from long range',
      tone: 'amber',
      support: `${longLagBucket.threePuttPct}% 3-putt rate from 30+ ft.`,
      note: 'When the first putt gets long, the round starts leaking extra strokes. Put more reps into long-distance pace than short make drills.',
      resources: getCoachResources('putting'),
    });
  }
  const saferTeeClub = teeClubPerformanceRows.find((row) => row.tag === 'SAFER SCORES');

  if ((par3?.avgDelta ?? 0) > 0.5) {
    insights.push({
      badge: '3',
      title: 'Par 3 scoring',
      tone: 'red',
      note: 'Focus on a precise target, trust the yardage, and make a committed swing instead of chasing the flag.',
      resources: getCoachResources('approach-short'),
    });
  }
  if ((par3?.avgDelta ?? 1) <= 0) {
    insights.push({
      badge: '3',
      title: 'Par 3 strength',
      tone: 'green',
      note: 'Your par-3 routine is holding up. Keep the same target discipline and club commitment.',
    });
  }
  if ((par5?.avgDelta ?? 0) > 1) {
    insights.push({
      badge: '5',
      title: 'Par 5 scoring',
      tone: 'red',
      note: 'Lay up to a preferred distance when the second shot is not clearly on. Do not force a low-percentage birdie try.',
      resources: getCoachResources('par5'),
    });
  }
  if ((doglegRight?.avgDelta ?? 0) > 1) {
    insights.push({
      badge: 'R',
      title: 'Dogleg right',
      tone: 'red',
      note: 'Play to the corner instead of trying to cut too much off. A smaller club can widen the landing window.',
      resources: getCoachResources('dogleg-right'),
    });
  }
  if ((doglegLeft?.avgDelta ?? 0) > 1) {
    insights.push({
      badge: 'L',
      title: 'Dogleg left',
      tone: 'red',
      note: 'Aim to the outside edge of the corner and maximize landing zone width before chasing angle.',
      resources: getCoachResources('dogleg-left'),
    });
  }
  if (rightRough >= 2 && rightRough > leftRough) {
    insights.push({
      badge: 'T',
      title: 'Tee miss right',
      tone: 'amber',
      note: 'Favor the left half of the fairway or close the face slightly. Your dominant miss is leaking right.',
      resources: getCoachResources('tee-right'),
    });
  }
  if (leftRough >= 2 && leftRough > rightRough) {
    insights.push({
      badge: 'T',
      title: 'Tee miss left',
      tone: 'amber',
      note: 'Favor the right half of the fairway and make sure alignment does not start too far left.',
      resources: getCoachResources('tee-left'),
    });
  }
  if (shortBiasClub) {
    insights.push({
      badge: 'A',
      title: `${shortBiasClub.clubLabel} short bias`,
      tone: 'amber',
      note: `${shortBiasClub.shortPct}% of ${shortBiasClub.clubLabel} approach misses finished short. Favor enough club and commit to a full finish.`,
      resources: getCoachResources('approach-short'),
    });
  }
  if (worstLie && (worstLie.deltaVsFairway ?? 0) >= 0.8) {
    insights.push({
      badge: 'L',
      title: `${worstLie.label} penalty`,
      tone: worstLie.label.includes('Bunker') ? 'red' : 'amber',
      note: `${worstLie.label} averaged ${worstLie.deltaVsFairway?.toFixed(1)} shots higher than fairway. Respect the lie and adjust club plus target.`,
      resources: worstLie.label === 'Fairway Bunker' ? getCoachResources('fairway-bunker') : getCoachResources('rough'),
    });
  }
  if (bestBand) {
    insights.push({
      badge: 'D',
      title: `Best distance ${bestBand.label}`,
      tone: 'green',
      note: `This was your best scoring window. When a hole gives you options, try to leave ${bestBand.label}.`,
      resources: getCoachResources('wedge-window'),
    });
  }
  if (saferTeeClub) {
    insights.push({
      badge: 'C',
      title: `${saferTeeClub.clubLabel} safer scores`,
      tone: 'green',
      note: `${saferTeeClub.clubLabel} is producing a better mix of fairways and scoring. Use it more often when the hole narrows.`,
      resources: getCoachResources('tee-right'),
    });
  }

  return insights;
};

const buildGroupCard = (key: string, label: string, holes: AnalysisHole[], coachingNote: string | null): GroupCard => {
  const avgDelta = avg(holes.map((hole) => hole.delta));
  const fairwayTracked = holes.filter((hole) => hole.par >= 4 && hole.fairwayHit !== null && hole.fairwayHit !== undefined);
  return {
    key,
    label,
    avgDelta,
    tone: getAverageTone(avgDelta),
    holeCount: holes.length,
    holes,
    birdies: holes.filter((hole) => hole.delta < 0).length,
    pars: holes.filter((hole) => hole.delta === 0).length,
    overPar: holes.filter((hole) => hole.delta > 0).length,
    fairwayHitCount: fairwayTracked.filter((hole) => isFairwayHit(hole.fairwayHit)).length,
    fairwayTotal: fairwayTracked.length,
    coachingNote,
  };
};

const buildLieSummaries = (shots: AnalysisShot[]): LieSummary[] => {
  const tally = new Map<string, number>();
  shots.forEach((shot) => {
    if (!shot.lie) return;
    tally.set(shot.lie, (tally.get(shot.lie) ?? 0) + 1);
  });
  return [...tally.entries()]
    .map(([lie, count]) => ({ lie, count, color: getLieColor(lie) }))
    .sort((a, b) => b.count - a.count);
};

const buildClubAverages = (shots: AnalysisShot[]): ClubAverageRow[] => {
  const grouped = new Map<string, AnalysisShot[]>();
  shots.forEach((shot) => {
    if (!shot.club) return;
    const current = grouped.get(shot.club) ?? [];
    current.push(shot);
    grouped.set(shot.club, current);
  });
  return [...grouped.entries()]
    .map(([club, clubShots]) => {
      const byLieMap = new Map<string, AnalysisShot[]>();
      clubShots.forEach((shot) => {
        const lie = shot.lie ?? 'Unknown';
        const current = byLieMap.get(lie) ?? [];
        current.push(shot);
        byLieMap.set(lie, current);
      });
      const fairwayPlaying = avg((byLieMap.get('Fairway') ?? []).map((shot) => shot.adj).filter((value): value is number => typeof value === 'number'));
      const gpsAvg = avg(clubShots.map((shot) => shot.dist).filter((value): value is number => typeof value === 'number'));
      const playingAvg = avg(clubShots.map((shot) => shot.adj).filter((value): value is number => typeof value === 'number'));
      return {
        club,
        clubLabel: clubShots[0]?.clubLabel ?? getClubMeta(club).label,
        gpsAvg,
        playingAvg,
        count: clubShots.length,
        byLie: [...byLieMap.entries()]
          .map(([lie, lieShots]) => {
            const lieGps = avg(lieShots.map((shot) => shot.dist).filter((value): value is number => typeof value === 'number'));
            const liePlaying = avg(lieShots.map((shot) => shot.adj).filter((value): value is number => typeof value === 'number'));
            return {
              lie,
              color: getLieColor(lie),
              gpsAvg: lieGps,
              playingAvg: liePlaying,
              deltaVsFairway: liePlaying !== null && fairwayPlaying !== null ? Math.round(liePlaying - fairwayPlaying) : null,
              count: lieShots.length,
            };
          })
          .sort((a, b) => b.count - a.count),
      };
    })
    .sort((a, b) => b.count - a.count);
};

const buildDistanceEngineSummary = (shots: AnalysisShot[]): DistanceEngineSummary | null => {
  const distanceShots = shots.filter((shot) => typeof shot.dist === 'number' && typeof shot.adj === 'number');
  if (!distanceShots.length) return null;
  const deltas = distanceShots.map((shot) => (shot.adj as number) - (shot.dist as number));
  const avgDeltaValue = avg(deltas);
  let note = 'Playing distance stayed close to GPS. This was a relatively neutral conditions round.';
  if ((avgDeltaValue ?? 0) >= 4) {
    note = 'Conditions added meaningful yardage. Keep trusting the playing number, not raw GPS.';
  } else if ((avgDeltaValue ?? 0) <= -4) {
    note = 'Conditions were helping overall. Raw GPS was playing shorter than the adjusted number.';
  }
  return {
    avgGps: avg(distanceShots.map((shot) => shot.dist as number)),
    avgPlaying: avg(distanceShots.map((shot) => shot.adj as number)),
    avgDelta: avgDeltaValue,
    maxDelta: deltas.length ? Math.max(...deltas.map((value) => Math.abs(Math.round(value)))) : null,
    note,
  };
};

const getBandLabel = (yards: number) => {
  if (yards < 75) return '<75';
  if (yards <= 100) return '75-100';
  if (yards <= 125) return '100-125';
  if (yards <= 150) return '125-150';
  if (yards <= 175) return '150-175';
  if (yards <= 200) return '175-200';
  return '200+';
};

const BAND_ORDER = ['<75', '75-100', '100-125', '125-150', '150-175', '175-200', '200+'];

const buildDistanceBands = (shots: AnalysisShot[]): DistanceBandRow[] => {
  const grouped = new Map<string, AnalysisShot[]>();
  shots
    .filter((shot) => shot.isApproach && Number.isFinite(shot.adj ?? shot.dist))
    .forEach((shot) => {
      const band = getBandLabel(Number.isFinite(shot.adj) ? (shot.adj as number) : (shot.dist as number));
      const current = grouped.get(band) ?? [];
      current.push(shot);
      grouped.set(band, current);
    });
  return BAND_ORDER
    .map((label) => {
      const bandShots = grouped.get(label) ?? [];
      const avgDeltaValue = avg(bandShots.map((shot) => shot.holeDelta));
      const girHits = bandShots.filter((shot) => shot.greenResult === 'hit' || shot.resultLie === 'Green').length;
      return {
        label,
        count: bandShots.length,
        girPct: bandShots.length ? Math.round((girHits / bandShots.length) * 100) : null,
        avgDelta: avgDeltaValue,
        tone: getAverageTone(avgDeltaValue),
      } satisfies DistanceBandRow;
    })
    .filter((row) => row.count > 0);
};

const buildLieImpactRows = (holes: AnalysisHole[], shots: AnalysisShot[]): LieImpactRow[] => {
  const holeMap = new Map(holes.map((hole) => [hole.number, hole]));
  const holeSets = {
    Fairway: new Set<number>(),
    Rough: new Set<number>(),
    'Fairway Bunker': new Set<number>(),
    'Greenside Bunker': new Set<number>(),
  };

  shots.forEach((shot) => {
    const lie = normalizeLieLabel(shot.lie);
    if (!lie) return;
    if (lie === 'Fairway') holeSets.Fairway.add(shot.holeNumber);
    if (lie === 'Rough') holeSets.Rough.add(shot.holeNumber);
    if (shot.lie === 'Fairway Bunker') holeSets['Fairway Bunker'].add(shot.holeNumber);
    if (shot.lie === 'Greenside Bunker') holeSets['Greenside Bunker'].add(shot.holeNumber);
  });

  holes.forEach((hole) => {
    if (hole.fairwayBunker) holeSets['Fairway Bunker'].add(hole.number);
    if (hole.greenSideBunker) holeSets['Greenside Bunker'].add(hole.number);
  });

  const fairwayAvg = avg([...holeSets.Fairway].map((holeNumber) => holeMap.get(holeNumber)?.delta).filter((value): value is number => typeof value === 'number'));

  return (['Fairway', 'Rough', 'Fairway Bunker', 'Greenside Bunker'] as const)
    .map((label) => {
      const holeNumbers = [...holeSets[label]];
      const avgDeltaValue = avg(holeNumbers.map((holeNumber) => holeMap.get(holeNumber)?.delta).filter((value): value is number => typeof value === 'number'));
      const deltaVsFairway = avgDeltaValue !== null && fairwayAvg !== null ? Number((avgDeltaValue - fairwayAvg).toFixed(1)) : null;
      return {
        label,
        count: holeNumbers.length,
        avgDelta: avgDeltaValue,
        deltaVsFairway,
        tone: label === 'Fairway'
          ? 'green'
          : deltaVsFairway === null
            ? 'white'
            : deltaVsFairway <= 0.3
              ? 'green'
              : deltaVsFairway <= 1
                ? 'amber'
                : 'red',
      } satisfies LieImpactRow;
    })
    .filter((row) => row.count > 0);
};

const buildClubMissRows = (shots: AnalysisShot[]): ClubMissRow[] => {
  const grouped = new Map<string, AnalysisShot[]>();
  shots
    .filter((shot) => shot.isApproach && !!shot.greenResult)
    .forEach((shot) => {
      const current = grouped.get(shot.club) ?? [];
      current.push(shot);
      grouped.set(shot.club, current);
    });

  return [...grouped.entries()]
    .filter(([, clubShots]) => clubShots.length >= 3)
    .map(([club, clubShots]) => {
      const count = clubShots.length;
      const shortPct = roundPct(clubShots.filter((shot) => shot.greenResult === 'short').length / count);
      const longPct = roundPct(clubShots.filter((shot) => shot.greenResult === 'long').length / count);
      const leftPct = roundPct(clubShots.filter((shot) => shot.greenResult === 'left').length / count);
      const rightPct = roundPct(clubShots.filter((shot) => shot.greenResult === 'right').length / count);
      const ranked = [
        { key: 'SHORT' as const, value: shortPct },
        { key: 'LONG' as const, value: longPct },
        { key: 'LEFT' as const, value: leftPct },
        { key: 'RIGHT' as const, value: rightPct },
      ].sort((a, b) => b.value - a.value);
      return {
        club,
        clubLabel: clubShots[0]?.clubLabel ?? getClubMeta(club).label,
        color: getClubMeta(club).color,
        count,
        shortPct,
        longPct,
        leftPct,
        rightPct,
        dominant: ranked[0].value >= 40 ? ranked[0].key : null,
      } satisfies ClubMissRow;
    })
    .sort((a, b) => b.count - a.count);
};

const buildTeeClubPerformance = (shots: AnalysisShot[]): TeeClubPerformanceRow[] => {
  const grouped = new Map<string, AnalysisShot[]>();
  shots
    .filter((shot) => shot.isTeeShot && shot.holePar >= 4)
    .forEach((shot) => {
      const current = grouped.get(shot.club) ?? [];
      current.push(shot);
      grouped.set(shot.club, current);
    });

  const rows = [...grouped.entries()]
    .filter(([, clubShots]) => clubShots.length >= 2)
    .map(([club, clubShots]) => {
      const fairwayTracked = clubShots.filter((shot) => !!shot.fairwayResult);
      return {
        club,
        clubLabel: clubShots[0]?.clubLabel ?? getClubMeta(club).label,
        color: getClubMeta(club).color,
        count: clubShots.length,
        fairwayPct: fairwayTracked.length
          ? Math.round((fairwayTracked.filter((shot) => shot.fairwayResult === 'hit').length / fairwayTracked.length) * 100)
          : null,
        avgPlaying: avg(clubShots.map((shot) => shot.adj ?? shot.dist).filter((value): value is number => typeof value === 'number')),
        avgDelta: avg(clubShots.map((shot) => shot.holeDelta)),
        tag: null as string | null,
      } satisfies TeeClubPerformanceRow;
    })
    .sort((a, b) => b.count - a.count);

  const bestFairway = [...rows].filter((row) => row.fairwayPct !== null).sort((a, b) => (b.fairwayPct ?? 0) - (a.fairwayPct ?? 0))[0];
  const bestScoring = [...rows].filter((row) => row.avgDelta !== null).sort((a, b) => (a.avgDelta ?? 99) - (b.avgDelta ?? 99))[0];

  rows.forEach((row) => {
    if (bestFairway && bestScoring && row.club === bestFairway.club && row.fairwayPct !== null) {
      if ((bestFairway.fairwayPct ?? 0) - (bestScoring.fairwayPct ?? 0) >= 12 && (bestFairway.avgDelta ?? 99) <= (bestScoring.avgDelta ?? 99) + 0.2) {
        row.tag = 'SAFER SCORES';
        return;
      }
    }
    if (bestScoring && row.club === bestScoring.club && row.fairwayPct !== null && bestFairway?.fairwayPct !== null) {
      if ((bestFairway.fairwayPct ?? 0) - row.fairwayPct <= 8) {
        row.tag = 'BEST SCORING CLUB';
      }
    }
  });

  return rows;
};

const buildPuttingSummary = (holes: AnalysisHole[]): PuttingSummary | null => {
  const trackedHoles = holes.filter((hole) =>
    hole.putts !== null && hole.putts !== undefined
    || hole.firstPuttDistance !== null && hole.firstPuttDistance !== undefined
    || hole.pinLocation
  );

  if (!trackedHoles.length) return null;

  const puttValues = trackedHoles
    .map((hole) => hole.putts)
    .filter((value): value is number => value !== null && value !== undefined);
  const firstPuttValues = trackedHoles
    .map((hole) => hole.firstPuttDistance)
    .filter((value): value is number => value !== null && value !== undefined);

  const pinCounts: Record<'Front' | 'Middle' | 'Back', number> = {
    Front: 0,
    Middle: 0,
    Back: 0,
  };

  trackedHoles.forEach((hole) => {
    if (hole.pinLocation === 'front') pinCounts.Front += 1;
    if (hole.pinLocation === 'middle') pinCounts.Middle += 1;
    if (hole.pinLocation === 'back') pinCounts.Back += 1;
  });

  const pinLocationRows = (['front', 'middle', 'back'] as const)
    .map((pin) => {
      const pinHoles = trackedHoles.filter((hole) => hole.pinLocation === pin);
      if (!pinHoles.length) return null;
      const pinPutts = pinHoles
        .map((hole) => hole.putts)
        .filter((value): value is number => value !== null && value !== undefined);
      const pinFirstPutts = pinHoles
        .map((hole) => hole.firstPuttDistance)
        .filter((value): value is number => value !== null && value !== undefined);
      return {
        label: (pin === 'front' ? 'Front' : pin === 'middle' ? 'Middle' : 'Back') as 'Front' | 'Middle' | 'Back',
        count: pinHoles.length,
        avgPutts: avg(pinPutts),
        avgFirstPuttDistance: avg(pinFirstPutts),
      };
    })
    .filter((row): row is NonNullable<typeof row> => !!row);

  const firstPuttBuckets = [
    { label: '<15 ft', min: 0, max: 15 },
    { label: '15-30 ft', min: 15, max: 30 },
    { label: '30+ ft', min: 30, max: Number.POSITIVE_INFINITY },
  ]
    .map((bucket) => {
      const bucketHoles = trackedHoles.filter((hole) => {
        if (hole.firstPuttDistance === null || hole.firstPuttDistance === undefined) return false;
        return hole.firstPuttDistance >= bucket.min && hole.firstPuttDistance < bucket.max;
      });
      if (!bucketHoles.length) return null;
      const bucketPutts = bucketHoles
        .map((hole) => hole.putts)
        .filter((value): value is number => value !== null && value !== undefined);
      const threePuttTracked = bucketHoles.filter((hole) => hole.putts !== null && hole.putts !== undefined);
      return {
        label: bucket.label,
        count: bucketHoles.length,
        avgPutts: avg(bucketPutts),
        threePuttPct: threePuttTracked.length
          ? Math.round((threePuttTracked.filter((hole) => (hole.putts ?? 0) >= 3).length / threePuttTracked.length) * 100)
          : null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => !!row);

  return {
    trackedHoles: trackedHoles.length,
    totalPutts: puttValues.length ? puttValues.reduce((sum, value) => sum + value, 0) : null,
    avgPutts: avg(puttValues),
    avgFirstPuttDistance: avg(firstPuttValues),
    pinLocations: (Object.entries(pinCounts) as Array<[PuttingSummary['pinLocations'][number]['label'], number]>)
      .filter(([, count]) => count > 0)
      .map(([label, count]) => ({ label, count })),
    pinLocationRows,
    firstPuttBuckets,
  };
};

const buildDispersion = (shots: AnalysisShot[]): DispersionClub[] => {
  const eligible = shots.filter((shot) => typeof shot.sx === 'number' && typeof shot.sy === 'number');
  const byClub = new Map<string, AnalysisShot[]>();
  eligible.forEach((shot) => {
    const current = byClub.get(shot.club) ?? [];
    current.push(shot);
    byClub.set(shot.club, current);
  });

  return [...byClub.entries()]
    .filter(([, clubShots]) => clubShots.length >= 3)
    .map(([club, clubShots]) => {
      const xs = clubShots.map((shot) => shot.sx as number);
      const ys = clubShots.map((shot) => shot.sy as number);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const spanX = Math.max(1, maxX - minX);
      const spanY = Math.max(1, maxY - minY);
      const points = clubShots.map((shot) => ({
        x: ((shot.sx as number) - minX) / spanX * 120 - 60,
        y: ((shot.sy as number) - minY) / spanY * 90 - 45,
      }));
      const centroid = {
        x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
        y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
      };
      const spread = Math.sqrt(points.reduce((sum, point) => {
        const dx = point.x - centroid.x;
        const dy = point.y - centroid.y;
        return sum + dx * dx + dy * dy;
      }, 0) / points.length);
      let missLabel = 'Center';
      if (centroid.x > 8 && centroid.y > 8) missLabel = 'Right / Short';
      else if (centroid.x > 8) missLabel = 'Right';
      else if (centroid.x < -8) missLabel = 'Left';
      else if (centroid.y > 8) missLabel = 'Short';
      else if (centroid.y < -8) missLabel = 'Long';
      const note = missLabel === 'Right / Short'
        ? 'Right-and-short misses often come from decelerating through impact. Keep the speed moving through the strike.'
        : missLabel === 'Left'
          ? 'Left misses usually show up when the hands get too active early. Stay quieter through release.'
          : missLabel === 'Long'
            ? 'Long misses can come from too much club or adrenaline. Re-check carry number before attacking flags.'
            : missLabel === 'Short'
              ? 'Short misses often mean under-clubbing or backing off the swing. Commit to the full motion.'
              : 'Your landing area stayed centered. Keep using the same target discipline.';
      return {
        club,
        clubLabel: clubShots[0]?.clubLabel ?? getClubMeta(club).label,
        color: getClubMeta(club).color,
        shots: clubShots,
        points,
        centroid,
        spread: Math.round(spread),
        missLabel,
        note,
      };
    })
    .sort((a, b) => b.shots.length - a.shots.length);
};

export function buildRoundAnalysis(round: SavedRound): RoundAnalysisData {
  const gpsHoleSummaryMap = getGpsHoleSummaryMap(round);
  const rawHoles = (round.holes ?? [])
    .filter((hole) => (hole.isSaved ?? hole.score > 0))
    .map((hole) => {
      const snapshotHole = getSnapshotHole(round.courseSnapshot, hole.number);
      const dogleg = normalizeDogleg((hole as RoundHole & { dogleg?: string }).dogleg ?? (snapshotHole as { dogleg?: string } | undefined)?.dogleg);
      const gpsSummary = gpsHoleSummaryMap.get(hole.number);
      return {
        number: hole.number,
        par: hole.par ?? snapshotHole?.par ?? 4,
        score: hole.score,
        delta: hole.score - (hole.par ?? snapshotHole?.par ?? 4),
        dogleg,
        fairwayHit: hole.fairwayHit,
        greenHit: hole.greenHit,
        teeClub: hole.teeClub,
        approachClub: hole.approachClub,
        fairwayBunker: hole.fairwayBunker,
        greenSideBunker: hole.greenSideBunker,
        putts: hole.putts ?? gpsSummary?.putts ?? null,
        firstPuttDistance: hole.firstPuttDistance ?? gpsSummary?.firstPuttDistance ?? null,
        pinLocation: gpsSummary?.pinLocation ?? null,
      } satisfies AnalysisHole;
    })
    .sort((a, b) => a.number - b.number);

  const totalPar = getRoundPar(round, rawHoles);
  const totalScore = round.score || rawHoles.reduce((sum, hole) => sum + hole.score, 0);
  const scoreToPar = totalScore - totalPar;
  const playTimeMinutes = getPlayTimeMinutes(round);
  const playTimeLabel = formatPlayTime(playTimeMinutes);

  const parGroups = [3, 4, 5].map((par) => {
    const holes = rawHoles.filter((hole) => hole.par === par);
    return buildGroupCard(`par-${par}`, `Par ${par}`, holes, null);
  });

  const doglegGroups = (['right', 'left', 'straight'] as DoglegType[]).map((dogleg) => {
    const holes = rawHoles.filter((hole) => hole.dogleg === dogleg);
    return buildGroupCard(
      dogleg,
      dogleg === 'right' ? 'Dogleg Right' : dogleg === 'left' ? 'Dogleg Left' : 'Straight',
      holes,
      null,
    );
  });

  const parWithData = parGroups.filter((group) => group.avgDelta !== null);
  const bestParKey = [...parWithData].sort((a, b) => (a.avgDelta ?? 99) - (b.avgDelta ?? 99))[0]?.key ?? null;
  const worstParKey = [...parWithData].sort((a, b) => (b.avgDelta ?? -99) - (a.avgDelta ?? -99))[0]?.key ?? null;
  parGroups.forEach((group) => {
    const par = Number(group.label.replace('Par ', ''));
    group.coachingNote = group.key === bestParKey
      ? getParCoaching(par, group.avgDelta, true)
      : group.key === worstParKey
        ? getParCoaching(par, group.avgDelta, false)
        : null;
  });

  const doglegWithData = doglegGroups.filter((group) => group.avgDelta !== null && group.holeCount >= 1);
  const worstDoglegKey = [...doglegWithData].sort((a, b) => (b.avgDelta ?? -99) - (a.avgDelta ?? -99))[0]?.key ?? null;
  doglegGroups.forEach((group) => {
    group.coachingNote = group.key === worstDoglegKey
      ? getDoglegCoaching(group.key as DoglegType, group.avgDelta, false)
      : null;
  });

  const { strengthCard, focusCard } = buildStrengthFocusCards(parGroups);
  const { shapeStrengthCard, shapeFocusCard } = buildShapeCards(doglegGroups);
  const shots = extractShots(round, rawHoles);
  const lieSummaries = buildLieSummaries(shots);
  const clubAverageRows = buildClubAverages(shots);
  const distanceEngineSummary = buildDistanceEngineSummary(shots);
  const distanceBandRows = buildDistanceBands(shots);
  const lieImpactRows = buildLieImpactRows(rawHoles, shots);
  const clubMissRows = buildClubMissRows(shots);
  const teeClubPerformanceRows = buildTeeClubPerformance(shots);
  const puttingSummary = buildPuttingSummary(rawHoles);
  const dispersionClubs = buildDispersion(shots);
  const teeHoles = rawHoles.filter((hole) => hole.par >= 4);
  const fairwayTracked = teeHoles.filter((hole) => hole.fairwayHit !== null && hole.fairwayHit !== undefined);
  const leftCount = teeHoles.filter((hole) => isLeftMiss(hole.fairwayHit)).length;
  const rightCount = teeHoles.filter((hole) => isRightMiss(hole.fairwayHit)).length;
  const teeShotTendency = {
    fairwayPct: fairwayTracked.length ? Math.round((fairwayTracked.filter((hole) => isFairwayHit(hole.fairwayHit)).length / fairwayTracked.length) * 100) : null,
    leftCount,
    rightCount,
    label: rightCount >= 2 && rightCount > leftCount
      ? 'Missing right'
      : leftCount >= 2 && leftCount > rightCount
        ? 'Missing left'
        : null,
  };
  const mostCostlyPattern = buildMostCostlyPattern(parGroups, teeShotTendency, distanceBandRows, lieImpactRows, clubMissRows);
  const bestScoringWindowCard = buildBestScoringWindowCard(distanceBandRows);
  const targetDistanceCard = buildTargetDistanceCard(distanceBandRows);
  const lieImpactCard = buildLieImpactCard(lieImpactRows);
  const puttingCard = buildPuttingCard(puttingSummary);
  const pinLocationCard = buildPinLocationCard(puttingSummary);
  const nextPracticeFocus = buildNextPracticeFocus(mostCostlyPattern, targetDistanceCard, lieImpactCard, puttingCard);

  return {
    holes: rawHoles,
    shots,
    holeCount: rawHoles.length,
    totalScore,
    totalPar,
    scoreToPar,
    scoreCells: rawHoles.map((hole) => ({ number: hole.number, delta: hole.delta })),
    overviewCells: [
      ...buildOverview(scoreToPar, parGroups, doglegGroups),
      { label: 'PLAY TIME', value: playTimeLabel ?? '—', tone: 'white' },
    ],
    playTimeMinutes,
    playTimeLabel,
    strengthCard,
    focusCard,
    shapeStrengthCard,
    shapeFocusCard,
    mostCostlyPattern,
    bestScoringWindowCard,
    targetDistanceCard,
    lieImpactCard,
    puttingCard,
    pinLocationCard,
    nextPracticeFocus,
    patternInsights: buildPatternInsights(rawHoles, parGroups, doglegGroups, lieImpactRows, clubMissRows, teeClubPerformanceRows, distanceBandRows, puttingSummary),
    parGroups,
    doglegGroups,
    lieSummaries,
    clubAverageRows,
    distanceEngineSummary,
    distanceBandRows,
    lieImpactRows,
    clubMissRows,
    teeClubPerformanceRows,
    puttingSummary,
    teeShotTendency,
    dispersionClubs,
    availableDoglegs: doglegGroups.filter((group) => group.holeCount > 0).map((group) => group.key as DoglegType),
  };
}

export { formatDelta, formatScoreDelta, getScoreColor, getClubMeta, getLieColor };
