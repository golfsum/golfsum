import type { CourseSnapshot, RoundHole, SavedRound } from '../types';

export type DoglegType = 'right' | 'left' | 'straight';

export type AnalysisTab = 'coaching' | 'holes' | 'averages' | 'dispersion';

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
}

export interface AnalysisShot {
  id: string;
  holeNumber: number;
  club: string;
  clubLabel: string;
  lie: string | null;
  dist: number | null;
  adj: number | null;
  sx: number | null;
  sy: number | null;
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
  patternInsights: InsightCard[];
  parGroups: GroupCard[];
  doglegGroups: GroupCard[];
  lieSummaries: LieSummary[];
  clubAverageRows: ClubAverageRow[];
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
  'Left Rough': '#A3E635',
  'Right Rough': '#A3E635',
  Sand: '#FBBF24',
  'Tee Box': '#60A5FA',
  Tee: '#60A5FA',
  Green: '#34D399',
  Trees: '#86EFAC',
  Water: '#60A5FA',
};

const avg = (values: number[]) => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null);

const normalizeDogleg = (value: unknown): DoglegType => {
  if (typeof value !== 'string') return 'straight';
  const lower = value.trim().toLowerCase();
  if (lower === 'left') return 'left';
  if (lower === 'right') return 'right';
  return 'straight';
};

const getSnapshotHole = (snapshot: CourseSnapshot | undefined, holeNumber: number) =>
  snapshot?.holes?.find((hole) => hole.number === holeNumber);

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

const createFallbackShots = (holes: AnalysisHole[]) => {
  const shots: AnalysisShot[] = [];
  holes.forEach((hole) => {
    if (hole.par >= 4 && hole.teeClub) {
      const meta = getClubMeta(hole.teeClub);
      shots.push({
        id: `${hole.number}-tee`,
        holeNumber: hole.number,
        club: meta.key,
        clubLabel: meta.label,
        lie: 'Tee Box',
        dist: null,
        adj: null,
        sx: null,
        sy: null,
      });
    }
    if (hole.approachClub) {
      const meta = getClubMeta(hole.approachClub);
      shots.push({
        id: `${hole.number}-app`,
        holeNumber: hole.number,
        club: meta.key,
        clubLabel: meta.label,
        lie: hole.greenSideBunker ? 'Sand' : hole.greenHit === true ? 'Fairway' : null,
        dist: null,
        adj: null,
        sx: null,
        sy: null,
      });
    }
  });
  return shots;
};

const extractShots = (round: SavedRound, holes: AnalysisHole[]) => {
  const anyRound = round as SavedRound & {
    shots?: unknown[];
    shotHistory?: unknown[];
    loggedShotsByHole?: Record<string, unknown[]>;
  };
  const fromRoundShots = Array.isArray(anyRound.shots) ? anyRound.shots : [];
  const fromShotHistory = Array.isArray(anyRound.shotHistory) ? anyRound.shotHistory : [];
  const fromLoggedByHole = anyRound.loggedShotsByHole
    ? Object.entries(anyRound.loggedShotsByHole).flatMap(([holeNumber, entries]) =>
        Array.isArray(entries)
          ? entries.map((entry) => ({ ...(entry as Record<string, unknown>), holeNumber: Number(holeNumber) + 1 }))
          : []
      )
    : [];
  const holeShots = (round.holes ?? []).flatMap((hole) => {
    const anyHole = hole as RoundHole & { shots?: unknown[] };
    return Array.isArray(anyHole.shots)
      ? anyHole.shots.map((shot) => ({ ...(shot as Record<string, unknown>), holeNumber: hole.number }))
      : [];
  });

  const rawShots = [...fromRoundShots, ...fromShotHistory, ...fromLoggedByHole, ...holeShots];
  if (!rawShots.length) return createFallbackShots(holes);

  return rawShots
    .map((shot, index) => {
      const anyShot = shot as Record<string, unknown>;
      const meta = getClubMeta(typeof anyShot.club === 'string' ? anyShot.club : null);
      const holeNumber = typeof anyShot.holeNumber === 'number'
        ? anyShot.holeNumber
        : typeof anyShot.hole === 'number'
          ? anyShot.hole
          : index + 1;
      return {
        id: String(anyShot.id ?? `${holeNumber}-${index}`),
        holeNumber,
        club: meta.key,
        clubLabel: meta.label,
        lie: typeof anyShot.lie === 'string' ? anyShot.lie : null,
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

const buildPatternInsights = (holes: AnalysisHole[], parGroups: GroupCard[], doglegGroups: GroupCard[]) => {
  const insights: InsightCard[] = [];
  const par3 = parGroups.find((group) => group.key === 'par-3');
  const par5 = parGroups.find((group) => group.key === 'par-5');
  const doglegRight = doglegGroups.find((group) => group.key === 'right');
  const doglegLeft = doglegGroups.find((group) => group.key === 'left');

  const teeHoles = holes.filter((hole) => hole.par >= 4);
  const leftRough = teeHoles.filter((hole) => isLeftMiss(hole.fairwayHit)).length;
  const rightRough = teeHoles.filter((hole) => isRightMiss(hole.fairwayHit)).length;
  const sandShots = holes.filter((hole) => hole.fairwayBunker || hole.greenSideBunker).length;

  if ((par3?.avgDelta ?? 0) > 0.5) {
    insights.push({
      badge: '3',
      title: 'Par 3 scoring',
      tone: 'red',
      note: 'Focus on a precise target, trust the yardage, and make a committed swing instead of chasing the flag.',
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
    });
  }
  if ((doglegRight?.avgDelta ?? 0) > 1) {
    insights.push({
      badge: 'R',
      title: 'Dogleg right',
      tone: 'red',
      note: 'Play to the corner instead of trying to cut too much off. A smaller club can widen the landing window.',
    });
  }
  if ((doglegLeft?.avgDelta ?? 0) > 1) {
    insights.push({
      badge: 'L',
      title: 'Dogleg left',
      tone: 'red',
      note: 'Aim to the outside edge of the corner and maximize landing zone width before chasing angle.',
    });
  }
  if (rightRough >= 2 && rightRough > leftRough) {
    insights.push({
      badge: 'T',
      title: 'Tee miss right',
      tone: 'amber',
      note: 'Favor the left half of the fairway or close the face slightly. Your dominant miss is leaking right.',
    });
  }
  if (leftRough >= 2 && leftRough > rightRough) {
    insights.push({
      badge: 'T',
      title: 'Tee miss left',
      tone: 'amber',
      note: 'Favor the right half of the fairway and make sure alignment does not start too far left.',
    });
  }
  if (sandShots >= 2) {
    insights.push({
      badge: 'S',
      title: 'Sand play',
      tone: 'amber',
      note: 'Open the face, enter the sand a couple of inches behind the ball, and keep the speed through impact.',
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
              : 'Your landing pattern stayed centered. Keep using the same target discipline.';
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
  const rawHoles = (round.holes ?? [])
    .filter((hole) => (hole.isSaved ?? hole.score > 0))
    .map((hole) => {
      const snapshotHole = getSnapshotHole(round.courseSnapshot, hole.number);
      const dogleg = normalizeDogleg((hole as RoundHole & { dogleg?: string }).dogleg ?? (snapshotHole as { dogleg?: string } | undefined)?.dogleg);
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
  const dispersionClubs = buildDispersion(shots);
  const teeHoles = rawHoles.filter((hole) => hole.par >= 4);
  const fairwayTracked = teeHoles.filter((hole) => hole.fairwayHit !== null && hole.fairwayHit !== undefined);
  const leftCount = teeHoles.filter((hole) => isLeftMiss(hole.fairwayHit)).length;
  const rightCount = teeHoles.filter((hole) => isRightMiss(hole.fairwayHit)).length;

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
    patternInsights: buildPatternInsights(rawHoles, parGroups, doglegGroups),
    parGroups,
    doglegGroups,
    lieSummaries,
    clubAverageRows,
    teeShotTendency: {
      fairwayPct: fairwayTracked.length ? Math.round((fairwayTracked.filter((hole) => isFairwayHit(hole.fairwayHit)).length / fairwayTracked.length) * 100) : null,
      leftCount,
      rightCount,
      label: rightCount >= 2 && rightCount > leftCount
        ? 'Missing right'
        : leftCount >= 2 && leftCount > rightCount
          ? 'Missing left'
          : null,
    },
    dispersionClubs,
    availableDoglegs: doglegGroups.filter((group) => group.holeCount > 0).map((group) => group.key as DoglegType),
  };
}

export { formatDelta, formatScoreDelta, getScoreColor, getClubMeta, getLieColor };
