import { SavedRound, RoundStats, AverageStats, RoundHole, StatState, CourseSource, GpsShotLog } from '../types';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getCurrentUser } from './firebaseAuthService';
import { 
  saveRoundToFirestore, 
  getRoundsFromFirestore, 
  deleteRoundFromFirestore,
  updateRoundInFirestore,
  saveAverageStats,
  getAverageStatsFromFirestore,
  getUserProfile,
} from './userService';
import { 
  uploadScorecardImage, 
  uploadThumbnail, 
  deleteScorecardImage,
  compressImage,
  createThumbnail,
} from './storageService';
import { 
  calculateHandicapIndex as calculateWHSHandicapIndex,
  calculateScoreDifferential,
  updateRoundWithWHSCalculations,
  isRoundAcceptableForHandicap,
  getHandicapCalculationDetails,
} from './whsCalculations';
import { calculateRoundRating, getRoundCoursePar } from './playerRatingService';
import { getElevationFeet } from './weatherService';
import { logger } from '../utils/logger';
import { incrementTrialRound } from './trialService';
import { getMockGpsCourse } from './gpsMockCourses';
import { processRoundShotDistances } from './clubDistanceService';
import { MAPBOX_PUBLIC_TOKEN } from '../config/mapbox';

const STORAGE_KEY = 'golf_rounds';
const SAMPLE_ROUND_KEY = '@GolfSum:SampleRound';
const SAMPLE_DISMISSED_KEY = '@GolfSum:SampleRoundDismissed';
export const SAMPLE_ROUND_ID = 'sample_round_1';
const PEBBLE_BEACH_COURSE_ID = '141520658891108829';
const HAVEN_COURSE_ID = 'haven_golf_course_green_valley_az';
const HANDICAP_WINDOW = 20; // Last 20 rounds (WHS standard)
const HANDICAP_BEST = 8; // Best 8 of 20 (WHS standard)

const CLUB_DISTANCES: Record<string, number> = {
  Driver: 255,
  '3w': 232,
  '5w': 214,
  '4i': 198,
  '5i': 186,
  '6i': 176,
  '7i': 165,
  '8i': 152,
  '9i': 138,
  PW: 124,
  GW: 110,
  SW: 95,
};

type PebbleHoleSeed = {
  score: number;
  putts: number;
  fairwayHit?: RoundHole['fairwayHit'];
  greenHit?: RoundHole['greenHit'];
  teeClub: string;
  approachClub?: string | null;
  approachDistance?: RoundHole['approachDistance'];
  upDown?: boolean | null;
  fairwayBunker?: boolean;
  greenSideBunker?: boolean;
  notes?: string;
};

const PEBBLE_ROUND_SEEDS: PebbleHoleSeed[][] = [
  [
    { score: 4, putts: 2, fairwayHit: true, greenHit: true, teeClub: '3w', approachClub: '9i', approachDistance: '125-150' },
    { score: 5, putts: 2, fairwayHit: true, greenHit: true, teeClub: 'Driver', approachClub: 'SW', approachDistance: '75-100' },
    { score: 5, putts: 2, greenHit: 'right', teeClub: '6i', approachClub: '6i', approachDistance: '175-200', upDown: false },
    { score: 5, putts: 2, fairwayHit: 'right', greenHit: 'short', teeClub: 'Driver', approachClub: 'PW', approachDistance: '100-125', upDown: false },
    { score: 3, putts: 1, greenHit: true, teeClub: '8i', approachClub: '8i', approachDistance: '150-175' },
    { score: 7, putts: 2, fairwayHit: true, greenHit: 'left', teeClub: 'Driver', approachClub: 'GW', approachDistance: '100-125', upDown: false, fairwayBunker: true },
    { score: 3, putts: 2, greenHit: false, teeClub: '9i', approachClub: '9i', approachDistance: '100-125', upDown: true },
    { score: 4, putts: 2, fairwayHit: true, greenHit: true, teeClub: '3w', approachClub: 'PW', approachDistance: '100-125' },
    { score: 4, putts: 2, fairwayHit: true, greenHit: true, teeClub: '3w', approachClub: '7i', approachDistance: '150-175' },
    { score: 5, putts: 2, fairwayHit: 'left', greenHit: 'short', teeClub: 'Driver', approachClub: '8i', approachDistance: '125-150', upDown: true },
    { score: 4, putts: 2, fairwayHit: true, greenHit: true, teeClub: '3w', approachClub: '9i', approachDistance: '125-150' },
    { score: 3, putts: 2, greenHit: true, teeClub: '7i', approachClub: '7i', approachDistance: '175-200' },
    { score: 4, putts: 2, fairwayHit: true, greenHit: true, teeClub: '3w', approachClub: '8i', approachDistance: '125-150' },
    { score: 5, putts: 2, fairwayHit: true, greenHit: true, teeClub: 'Driver', approachClub: 'GW', approachDistance: '100-125' },
    { score: 4, putts: 2, fairwayHit: true, greenHit: 'right', teeClub: '3w', approachClub: '9i', approachDistance: '125-150', upDown: false },
    { score: 5, putts: 2, fairwayHit: 'right', greenHit: 'short', teeClub: 'Driver', approachClub: 'PW', approachDistance: '100-125', upDown: false },
    { score: 3, putts: 2, greenHit: true, teeClub: '7i', approachClub: '7i', approachDistance: '175-200' },
    { score: 5, putts: 2, fairwayHit: true, greenHit: true, teeClub: 'Driver', approachClub: 'SW', approachDistance: '75-100' },
  ],
  [
    { score: 4, putts: 2, fairwayHit: true, greenHit: true, teeClub: '3w', approachClub: '8i', approachDistance: '125-150' },
    { score: 6, putts: 2, fairwayHit: true, greenHit: 'short', teeClub: 'Driver', approachClub: 'SW', approachDistance: '75-100', upDown: true },
    { score: 4, putts: 2, greenHit: true, teeClub: '6i', approachClub: '6i', approachDistance: '175-200' },
    { score: 5, putts: 2, fairwayHit: true, greenHit: false, teeClub: 'Driver', approachClub: 'PW', approachDistance: '100-125', upDown: true },
    { score: 3, putts: 2, greenHit: true, teeClub: '8i', approachClub: '8i', approachDistance: '150-175' },
    { score: 6, putts: 2, fairwayHit: true, greenHit: true, teeClub: 'Driver', approachClub: 'GW', approachDistance: '100-125' },
    { score: 4, putts: 2, greenHit: false, teeClub: '9i', approachClub: '9i', approachDistance: '100-125', upDown: false },
    { score: 5, putts: 2, fairwayHit: 'right', greenHit: true, teeClub: '3w', approachClub: '9i', approachDistance: '125-150' },
    { score: 4, putts: 2, fairwayHit: true, greenHit: true, teeClub: '3w', approachClub: '7i', approachDistance: '150-175' },
    { score: 4, putts: 2, fairwayHit: true, greenHit: true, teeClub: 'Driver', approachClub: '9i', approachDistance: '100-125' },
    { score: 5, putts: 2, fairwayHit: true, greenHit: 'left', teeClub: '3w', approachClub: '8i', approachDistance: '125-150', upDown: true },
    { score: 3, putts: 2, greenHit: true, teeClub: '7i', approachClub: '7i', approachDistance: '175-200' },
    { score: 5, putts: 2, fairwayHit: 'right', greenHit: 'short', teeClub: 'Driver', approachClub: '8i', approachDistance: '150-175', upDown: false },
    { score: 5, putts: 2, fairwayHit: true, greenHit: true, teeClub: 'Driver', approachClub: 'GW', approachDistance: '100-125' },
    { score: 4, putts: 2, fairwayHit: true, greenHit: true, teeClub: '3w', approachClub: 'PW', approachDistance: '100-125' },
    { score: 4, putts: 2, fairwayHit: true, greenHit: true, teeClub: 'Driver', approachClub: '9i', approachDistance: '125-150' },
    { score: 4, putts: 2, greenHit: true, teeClub: '7i', approachClub: '7i', approachDistance: '175-200' },
    { score: 6, putts: 2, fairwayHit: 'left', greenHit: 'right', teeClub: 'Driver', approachClub: 'SW', approachDistance: '75-100', upDown: false },
  ],
  [
    { score: 4, putts: 2, fairwayHit: true, greenHit: true, teeClub: '3w', approachClub: '9i', approachDistance: '125-150' },
    { score: 5, putts: 2, fairwayHit: true, greenHit: true, teeClub: 'Driver', approachClub: 'SW', approachDistance: '75-100' },
    { score: 4, putts: 2, greenHit: true, teeClub: '6i', approachClub: '6i', approachDistance: '175-200' },
    { score: 4, putts: 1, fairwayHit: true, greenHit: true, teeClub: 'Driver', approachClub: 'PW', approachDistance: '100-125' },
    { score: 4, putts: 2, greenHit: 'short', teeClub: '8i', approachClub: '8i', approachDistance: '150-175', upDown: false },
    { score: 6, putts: 2, fairwayHit: true, greenHit: true, teeClub: 'Driver', approachClub: 'GW', approachDistance: '100-125' },
    { score: 4, putts: 2, greenHit: false, teeClub: '9i', approachClub: '9i', approachDistance: '100-125', upDown: false },
    { score: 4, putts: 2, fairwayHit: true, greenHit: true, teeClub: '3w', approachClub: 'PW', approachDistance: '100-125' },
    { score: 5, putts: 2, fairwayHit: 'right', greenHit: false, teeClub: '3w', approachClub: '7i', approachDistance: '150-175', upDown: true },
    { score: 5, putts: 2, fairwayHit: true, greenHit: 'right', teeClub: 'Driver', approachClub: '9i', approachDistance: '100-125', upDown: false },
    { score: 4, putts: 2, fairwayHit: true, greenHit: true, teeClub: '3w', approachClub: '9i', approachDistance: '125-150' },
    { score: 3, putts: 2, greenHit: true, teeClub: '7i', approachClub: '7i', approachDistance: '175-200' },
    { score: 5, putts: 2, fairwayHit: 'left', greenHit: 'right', teeClub: 'Driver', approachClub: '8i', approachDistance: '125-150', upDown: false },
    { score: 5, putts: 2, fairwayHit: true, greenHit: true, teeClub: 'Driver', approachClub: 'GW', approachDistance: '100-125' },
    { score: 4, putts: 2, fairwayHit: true, greenHit: true, teeClub: '3w', approachClub: 'PW', approachDistance: '100-125' },
    { score: 5, putts: 2, fairwayHit: 'right', greenHit: false, teeClub: 'Driver', approachClub: '9i', approachDistance: '125-150', upDown: true },
    { score: 3, putts: 2, greenHit: true, teeClub: '7i', approachClub: '7i', approachDistance: '175-200' },
    { score: 5, putts: 2, fairwayHit: true, greenHit: true, teeClub: 'Driver', approachClub: 'SW', approachDistance: '75-100' },
  ],
];

function getBandMidpoint(distance?: RoundHole['approachDistance']): number | null {
  const mids: Partial<Record<NonNullable<RoundHole['approachDistance']>, number>> = {
    '<50': 40,
    '50-100': 75,
    '100-150': 125,
    '150-200': 175,
    '200+': 215,
    '<75': 60,
    '75-100': 88,
    '100-125': 112,
    '125-150': 138,
    '150-175': 163,
    '175-200': 188,
    '200-225': 213,
    '225-250': 238,
    '250+': 260,
  };
  return distance ? mids[distance] ?? null : null;
}

function getClubDistance(club?: string | null): number | null {
  if (!club) return null;
  return CLUB_DISTANCES[club] ?? null;
}

function buildPebbleShotLog(
  holeNumber: number,
  teeClub: string,
  teeShotYards: number,
  approachClub?: string | null,
  approachDistance?: RoundHole['approachDistance'],
  dateIso?: string
): GpsShotLog[] {
  const shots: GpsShotLog[] = [
    {
      id: `seed_${holeNumber}_1_${Math.random().toString(36).slice(2, 8)}`,
      holeNumber,
      shotNumber: 1,
      club: teeClub,
      lie: 'Tee Box',
      actualYards: teeShotYards,
      playingYards: teeShotYards,
      loggedAt: dateIso,
    },
  ];

  const approachYards = getBandMidpoint(approachDistance);
  if (approachClub && approachYards) {
    shots.push({
      id: `seed_${holeNumber}_2_${Math.random().toString(36).slice(2, 8)}`,
      holeNumber,
      shotNumber: 2,
      club: approachClub,
      lie: 'Fairway',
      actualYards: approachYards,
      playingYards: approachYards,
      loggedAt: dateIso,
    });
  }

  return shots;
}

function buildSyntheticShotPoint(
  origin: { lat: number; lng: number },
  bearingDeg: number,
  distanceYards: number,
  lateralYards = 0,
): { lat: number; lng: number } {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const yardsPerDegreeLat = 121440;
  const forwardLat = Math.cos(toRad(bearingDeg)) * distanceYards;
  const forwardLng = Math.sin(toRad(bearingDeg)) * distanceYards;
  const lateralBearing = bearingDeg + 90;
  const lateralLat = Math.cos(toRad(lateralBearing)) * lateralYards;
  const lateralLng = Math.sin(toRad(lateralBearing)) * lateralYards;
  return {
    lat: origin.lat + ((forwardLat + lateralLat) / yardsPerDegreeLat),
    lng: origin.lng + ((forwardLng + lateralLng) / (yardsPerDegreeLat * Math.cos(toRad(origin.lat)))),
  };
}

function buildSeedStaticMapUrl(shots: GpsShotLog[], width = 700, height = 400): string | null {
  if (!MAPBOX_PUBLIC_TOKEN) return null;
  const coords = shots.flatMap((shot) => {
    const pts: Array<[number, number]> = [];
    const from = shot?.from;
    const to = shot?.to;
    if (from && Number.isFinite(from.lng) && Number.isFinite(from.lat)) pts.push([from.lng, from.lat]);
    if (to && Number.isFinite(to.lng) && Number.isFinite(to.lat)) pts.push([to.lng, to.lat]);
    return pts;
  });
  if (coords.length === 0) return null;
  const lngs = coords.map(([lng]) => lng);
  const lats = coords.map(([, lat]) => lat);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const padLng = Math.max((maxLng - minLng) * 0.18, 0.0012);
  const padLat = Math.max((maxLat - minLat) * 0.18, 0.001);
  const markers = shots
    .filter((shot): shot is GpsShotLog & { from: NonNullable<GpsShotLog['from']> } => !!shot?.from && Number.isFinite(shot.from.lng) && Number.isFinite(shot.from.lat))
    .map((shot, index) => {
      const from = shot.from;
      return `pin-s-${index + 1}+${index === 0 ? '60A5FA' : '1ac855'}(${from.lng},${from.lat})`;
    })
    .join(',');
  const staticPath = markers.length > 0
    ? `${markers}/${minLng - padLng},${minLat - padLat},${maxLng + padLng},${maxLat + padLat}`
    : `${minLng - padLng},${minLat - padLat},${maxLng + padLng},${maxLat + padLat}`;
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${staticPath}/${width}x${height}@2x?access_token=${MAPBOX_PUBLIC_TOKEN}&attribution=false`;
}

const HAVEN_LAYOUT_BEARINGS = [74, 258, 121, 198, 28, 342, 86, 147, 276, 214, 319, 58, 176, 104, 241, 167, 308, 34];
const HAVEN_HOLE_HANDICAPS = [1, 3, 15, 5, 11, 7, 17, 9, 13, 2, 4, 16, 6, 8, 18, 10, 12, 14];

function buildHavenTeeOrigin(holeNumber: number): { lat: number; lng: number } {
  const holeRow = Math.floor((holeNumber - 1) / 6);
  const holeCol = (holeNumber - 1) % 6;
  return {
    lat: 31.8718 + (holeRow * 0.00042) + ((holeCol - 2.5) * 0.00019),
    lng: -111.0024 + (holeCol * 0.00042) + ((holeRow - 1) * 0.00017),
  };
}

function getHavenBearing(holeNumber: number): number {
  return HAVEN_LAYOUT_BEARINGS[holeNumber - 1] ?? ((38 + (holeNumber * 17)) % 360);
}

function getShotDistanceForClub(club: string | null | undefined): number {
  return CLUB_DISTANCES[club || ''] ?? 150;
}

function getMissLateral(
  miss: RoundHole['fairwayHit'] | RoundHole['greenHit'] | null | undefined,
  roundIndex: number,
  bias = 0,
): number {
  switch (miss) {
    case true:
      return [2, -3, 4][roundIndex % 3] + bias;
    case 'right':
      return [22, 30, 18][roundIndex % 3] + bias;
    case 'double-right':
      return [34, 42, 28][roundIndex % 3] + bias;
    case 'left':
      return [-14, -18, -10][roundIndex % 3] + bias;
    case 'double-left':
      return [-26, -30, -20][roundIndex % 3] + bias;
    case 'short':
      return [6, 4, 2][roundIndex % 3] + bias;
    case 'long':
      return [-4, -2, -6][roundIndex % 3] + bias;
    default:
      return bias;
  }
}

function buildPuttShots(
  holeNumber: number,
  start: { lat: number; lng: number },
  greenCenter: { lat: number; lng: number },
  bearing: number,
  putts: number,
  startingShotNumber: number,
  dateIso?: string,
): GpsShotLog[] {
  if (!putts || putts < 1) return [];
  if (putts === 1) {
    return [{
      id: `haven_${holeNumber}_putt_1_${Math.random().toString(36).slice(2, 8)}`,
      holeNumber,
      shotNumber: startingShotNumber,
      club: 'Putter',
      shotType: 'putt',
      lie: 'Green',
      actualYards: null,
      playingYards: null,
      from: start,
      to: greenCenter,
      loggedAt: dateIso,
    }];
  }

  const firstLag = buildSyntheticShotPoint(start, bearing, Math.max(5, 10 - putts), 0);
  const secondLag = buildSyntheticShotPoint(greenCenter, (bearing + 180) % 360, 2, 0);
  const puttShots: GpsShotLog[] = [
    {
      id: `haven_${holeNumber}_putt_1_${Math.random().toString(36).slice(2, 8)}`,
      holeNumber,
      shotNumber: startingShotNumber,
      club: 'Putter',
      shotType: 'putt',
      lie: 'Green',
      actualYards: null,
      playingYards: null,
      from: start,
      to: putts > 2 ? firstLag : secondLag,
      loggedAt: dateIso,
    },
  ];

  if (putts > 2) {
    puttShots.push({
      id: `haven_${holeNumber}_putt_2_${Math.random().toString(36).slice(2, 8)}`,
      holeNumber,
      shotNumber: startingShotNumber + 1,
      club: 'Putter',
      shotType: 'putt',
      lie: 'Green',
      actualYards: null,
      playingYards: null,
      from: firstLag,
      to: secondLag,
      loggedAt: dateIso,
    });
  }

  puttShots.push({
    id: `haven_${holeNumber}_putt_final_${Math.random().toString(36).slice(2, 8)}`,
    holeNumber,
    shotNumber: startingShotNumber + (putts > 2 ? 2 : 1),
    club: 'Putter',
    shotType: 'putt',
    lie: 'Green',
    actualYards: null,
    playingYards: null,
    from: putts > 2 ? secondLag : secondLag,
    to: greenCenter,
    loggedAt: dateIso,
  });

  return puttShots;
}

function buildHavenShotLog(
  holeNumber: number,
  holePlan: {
    par: number;
    score: number;
    putts: number;
    fairwayHit?: RoundHole['fairwayHit'];
    greenHit?: RoundHole['greenHit'];
    teeClub: string;
    approachClub?: string | null;
    upDown?: boolean | null;
  },
  holeYardage: number,
  roundIndex: number,
  dateIso?: string,
): GpsShotLog[] {
  const tee = buildHavenTeeOrigin(holeNumber);
  const bearing = getHavenBearing(holeNumber);
  const greenCenter = buildSyntheticShotPoint(tee, bearing, holeYardage, 0);
  const shots: GpsShotLog[] = [];
  let shotNumber = 1;

  const pushShot = (
    club: string,
    lie: string,
    yards: number | null,
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
    extras?: Partial<GpsShotLog>,
  ) => {
    shots.push({
      id: `haven_${holeNumber}_${shotNumber}_${Math.random().toString(36).slice(2, 8)}`,
      holeNumber,
      shotNumber,
      club,
      lie,
      actualYards: yards,
      playingYards: yards,
      from,
      to,
      loggedAt: dateIso,
      ...extras,
    });
    shotNumber += 1;
  };

  const teeBias = holePlan.fairwayHit === 'right' ? 6 : 0;
  const teeBaseline = holePlan.par === 3
    ? Math.max(holeYardage - 18, 110)
    : Math.min(
        Math.max(175, getShotDistanceForClub(holePlan.teeClub) + [-6, 8, 0][roundIndex % 3]),
        holeYardage - (holePlan.par === 5 ? 185 : 105),
      );
  const teeLateral = holePlan.par === 3 ? 0 : getMissLateral(holePlan.fairwayHit, roundIndex, teeBias);
  const teeLanding = buildSyntheticShotPoint(tee, bearing, teeBaseline, teeLateral);
  pushShot(holePlan.teeClub, 'Tee Box', teeBaseline, tee, teeLanding);

  let currentPoint = teeLanding;
  let remaining = Math.max(12, holeYardage - teeBaseline);

  if (holePlan.par === 5 && remaining > 120) {
    const layupClub = remaining > 230 ? '5w' : '6i';
    const layupTarget = Math.max(80, remaining - (holePlan.approachClub ? getShotDistanceForClub(holePlan.approachClub) : 105));
    const layupDistance = Math.max(70, Math.min(getShotDistanceForClub(layupClub) + [-8, 4, 10][roundIndex % 3], remaining - layupTarget));
    const layupLateral = getMissLateral(
      holePlan.fairwayHit === 'right' ? 'right' : true,
      roundIndex,
      holePlan.fairwayHit === 'right' ? 8 : 2,
    );
    const layupLanding = buildSyntheticShotPoint(currentPoint, bearing, layupDistance, layupLateral);
    pushShot(layupClub, holePlan.fairwayHit === 'right' ? 'Right Rough' : 'Fairway', layupDistance, currentPoint, layupLanding);
    currentPoint = layupLanding;
    remaining = Math.max(10, remaining - layupDistance);
  }

  const approachClub = holePlan.approachClub || (remaining > 185 ? '6i' : remaining > 155 ? '7i' : remaining > 130 ? '8i' : remaining > 115 ? '9i' : remaining > 95 ? 'PW' : 'GW');
  const approachDistance = Math.max(12, Math.min(getShotDistanceForClub(approachClub) + [-5, 0, 6][roundIndex % 3], remaining));
  let approachLanding = buildSyntheticShotPoint(currentPoint, bearing, approachDistance, 0);

  if (holePlan.greenHit === true) {
    const shortLeave = Math.max(4, (holePlan.putts === 1 ? 4 : 10) + (roundIndex % 3));
    approachLanding = buildSyntheticShotPoint(greenCenter, (bearing + 180) % 360, shortLeave, [2, -1, 1][roundIndex % 3]);
    pushShot(approachClub, holePlan.par === 3 ? 'Tee Box' : (holePlan.fairwayHit === 'right' ? 'Right Rough' : 'Fairway'), Math.max(approachDistance, Math.max(20, remaining - shortLeave)), currentPoint, approachLanding);
    shots.push(...buildPuttShots(holeNumber, approachLanding, greenCenter, bearing, holePlan.putts, shotNumber, dateIso));
    return shots;
  }

  const greenMiss = holePlan.greenHit ?? 'short';
  const missForward = greenMiss === 'short'
    ? Math.max(remaining - [12, 18, 10][roundIndex % 3], Math.max(20, remaining - 30))
    : greenMiss === 'long'
      ? Math.min(remaining + [9, 14, 8][roundIndex % 3], remaining + 18)
      : remaining;
  const missLateral = getMissLateral(greenMiss, roundIndex, holePlan.fairwayHit === 'right' ? 4 : 0);
  approachLanding = buildSyntheticShotPoint(currentPoint, bearing, missForward, missLateral);
  pushShot(
    approachClub,
    holePlan.par === 3 ? 'Tee Box' : (holePlan.fairwayHit === 'right' ? 'Right Rough' : 'Fairway'),
    Math.max(20, Math.min(approachDistance, missForward)),
    currentPoint,
    approachLanding,
  );

  const chipDistance = holePlan.upDown ? [16, 22, 12][roundIndex % 3] : [24, 30, 18][roundIndex % 3];
  const chipLanding = buildSyntheticShotPoint(greenCenter, (bearing + 180) % 360, holePlan.putts === 1 ? 2 : 6, [1, -1, 2][roundIndex % 3]);
  pushShot(
    chipDistance <= 18 ? 'SW' : 'GW',
    greenMiss === 'right' ? 'Right Rough' : greenMiss === 'left' ? 'Left Rough' : 'Fringe',
    chipDistance,
    approachLanding,
    chipLanding,
  );
  shots.push(...buildPuttShots(holeNumber, chipLanding, greenCenter, bearing, holePlan.putts, shotNumber, dateIso));
  return shots;
}

function summarizeRoundStats(holes: RoundHole[]): RoundStats {
  const fairwayTracked = holes.filter((hole) => hole.par > 3 && hole.fairwayHit !== null && hole.fairwayHit !== undefined);
  const fairways = fairwayTracked.filter((hole) => hole.fairwayHit === true).length;
  const greenTracked = holes.filter((hole) => hole.greenHit !== null && hole.greenHit !== undefined);
  const greens = greenTracked.filter((hole) => hole.greenHit === true).length;
  const upDownTracked = holes.filter((hole) => hole.upDown !== null && hole.upDown !== undefined);
  const upDownMade = upDownTracked.filter((hole) => hole.upDown === true).length;

  return {
    score: holes.reduce((sum, hole) => sum + hole.score, 0),
    putts: holes.reduce((sum, hole) => sum + (hole.putts || 0), 0),
    fairways,
    fairwaysPossible: fairwayTracked.length,
    greens,
    greensPossible: greenTracked.length,
    upDownMade,
    upDownAttempts: upDownTracked.length,
    teeBox: 'Blue',
    courseRating: 74.9,
    slopeRating: 144,
    totalPar: 72,
    coursePar: 72,
  };
}

function buildPebbleSeedRounds(): Omit<SavedRound, 'id'>[] {
  const pebble = getMockGpsCourse(PEBBLE_BEACH_COURSE_ID);
  if (!pebble) {
    throw new Error('Pebble Beach mock course is not available.');
  }

  return PEBBLE_ROUND_SEEDS.map((roundSeed, roundIndex) => {
    const date = new Date();
    date.setDate(date.getDate() - (roundSeed.length + 2 - roundIndex));
    date.setHours(8 + roundIndex, 20, 0, 0);

    const holes: RoundHole[] = pebble.holes.map((hole, holeIndex) => {
      const seed = roundSeed[holeIndex];
      return {
        number: hole.hole,
        par: hole.par,
        handicapIndex: hole.handicap,
        score: seed.score,
        putts: seed.putts,
        fairwayHit: hole.par === 3 ? null : (seed.fairwayHit ?? null),
        greenHit: seed.greenHit ?? null,
        approachDistance: seed.approachDistance ?? null,
        teeClub: seed.teeClub,
        approachClub: seed.approachClub ?? null,
        upDown: seed.upDown ?? null,
        fairwayBunker: seed.fairwayBunker,
        greenSideBunker: seed.greenSideBunker,
        isSaved: true,
      };
    });

    const gpsShots = pebble.holes.flatMap((hole, holeIndex) => {
      const seed = roundSeed[holeIndex];
      const teeYards = getClubDistance(seed.teeClub) ?? Math.max((hole.tees[0]?.yards || 380) - (getBandMidpoint(seed.approachDistance) || 130), 160);
      return buildPebbleShotLog(
        hole.hole,
        seed.teeClub,
        teeYards,
        seed.approachClub ?? null,
        seed.approachDistance ?? null,
        date.toISOString()
      );
    });
    const holeMapUrls = pebble.holes.reduce((acc, hole, holeIndex) => {
      const shots = gpsShots.filter((shot) => shot.holeNumber === hole.hole);
      const staticUrl = buildSeedStaticMapUrl(shots);
      if (staticUrl) acc[hole.hole] = staticUrl;
      return acc;
    }, {} as Record<number, string>);

    const stats = summarizeRoundStats(holes);
    const startedAt = date.getTime() - 4 * 60 * 60 * 1000;
    const endedAt = date.getTime();

    return {
      date,
      courseName: pebble.courseName,
      score: stats.score,
      stats,
      html: '',
      imageUri: '',
      courseId: pebble.courseId,
      courseSource: CourseSource.API,
      teeName: 'Blue',
      tee: 'Blue',
      holeCount: 18,
      plannedHoles: 18,
      holesPlayed: holes.map((hole) => hole.number),
      roundLength: '18',
      roundSource: 'manual',
      entryMode: 'advanced',
      roundStartedAt: startedAt,
      roundEndedAt: endedAt,
      roundDurationMinutes: 240,
      gpsShots,
      gpsShotCount: gpsShots.length,
      holeMapUrls,
      holes,
      weather: {
        temp: '58F',
        conditions: 'Marine Layer',
        wind: '9 mph',
      },
      notes: `Pebble seed round ${roundIndex + 1}`,
      isSeededTestRound: true,
      courseSnapshot: {
        courseId: pebble.courseId,
        name: pebble.courseName,
        location: {
          city: 'Pebble Beach',
          state: 'CA',
          country: 'USA',
          latitude: 36.5681,
          longitude: -121.9500,
        },
        holesCount: pebble.holes.length,
        tee: {
          name: 'Blue',
          rating: 74.9,
          slope: 144,
          yardageTotal: pebble.holes.reduce((sum, hole) => sum + (hole.tees[0]?.yards || 0), 0),
        },
        holes: pebble.holes.map((hole) => ({
          number: hole.hole,
          par: hole.par,
          yardage: hole.tees[0]?.yards || undefined,
          handicapIndex: hole.handicap,
        })),
        source: pebble.source,
        version: 1,
        lastVerifiedAt: Date.now(),
      },
    };
  });
}

function buildHavenSeedRounds(): Omit<SavedRound, 'id'>[] {
  const courseName = 'Haven Golf Course';
  const courseId = HAVEN_COURSE_ID;
  const baseDate = new Date();
  const holeTemplates: Array<{
    par: number;
    score: number;
    putts: number;
    fairwayHit?: RoundHole['fairwayHit'];
    greenHit?: RoundHole['greenHit'];
    teeClub: string;
    approachClub?: string | null;
    approachDistance?: RoundHole['approachDistance'];
    upDown?: boolean | null;
  }> = [
    // Base distribution across 14 par-4/5 holes: 9 fairways / 4 right misses / 1 left
    // ≈ 64% / 29% / 7%. Matches "slight right miss tendency" player profile.
    // Per-round overrides in `fairwayAdjustments` below create round-to-round variation.
    { par: 4, score: 4, putts: 2, fairwayHit: true, greenHit: true, teeClub: 'Driver', approachClub: '9i', approachDistance: '125-150' },            // H1  fairway
    { par: 4, score: 5, putts: 2, fairwayHit: 'right', greenHit: 'short', teeClub: 'Driver', approachClub: '8i', approachDistance: '125-150', upDown: true }, // H2  right
    { par: 3, score: 3, putts: 1, greenHit: 'right', teeClub: '8i', approachClub: 'SW', approachDistance: '125-150', upDown: true },                 // H3  par 3
    { par: 5, score: 6, putts: 2, fairwayHit: true, greenHit: 'short', teeClub: 'Driver', approachClub: '5i', approachDistance: '175-200', upDown: false }, // H4  fairway (was right)
    { par: 4, score: 4, putts: 2, fairwayHit: true, greenHit: true, teeClub: '3w', approachClub: 'PW', approachDistance: '100-125' },                // H5  fairway
    { par: 4, score: 5, putts: 2, fairwayHit: 'right', greenHit: 'right', teeClub: 'Driver', approachClub: '9i', approachDistance: '100-125', upDown: false }, // H6 right
    { par: 3, score: 4, putts: 2, greenHit: 'short', teeClub: '9i', approachClub: '9i', approachDistance: '100-125', upDown: true },                 // H7  par 3
    { par: 5, score: 5, putts: 2, fairwayHit: true, greenHit: true, teeClub: 'Driver', approachClub: '7i', approachDistance: '150-175' },           // H8  fairway
    { par: 4, score: 4, putts: 2, fairwayHit: true, greenHit: true, teeClub: '3w', approachClub: '8i', approachDistance: '125-150' },                // H9  fairway
    { par: 4, score: 5, putts: 2, fairwayHit: 'right', greenHit: 'short', teeClub: 'Driver', approachClub: 'PW', approachDistance: '100-125', upDown: true }, // H10 right
    { par: 5, score: 6, putts: 2, fairwayHit: true, greenHit: 'left', teeClub: 'Driver', approachClub: '6i', approachDistance: '175-200', upDown: false }, // H11 fairway (was right)
    { par: 3, score: 3, putts: 1, greenHit: true, teeClub: '9i', approachClub: '9i', approachDistance: '100-125' },                                   // H12 par 3
    { par: 4, score: 4, putts: 2, fairwayHit: true, greenHit: true, teeClub: 'Driver', approachClub: '8i', approachDistance: '125-150' },            // H13 fairway
    { par: 4, score: 5, putts: 2, fairwayHit: 'left', greenHit: 'right', teeClub: 'Driver', approachClub: '7i', approachDistance: '150-175', upDown: false }, // H14 LEFT (rare)
    { par: 3, score: 3, putts: 1, greenHit: 'short', teeClub: '8i', approachClub: 'SW', approachDistance: '125-150', upDown: true },                 // H15 par 3
    { par: 5, score: 6, putts: 2, fairwayHit: true, greenHit: 'short', teeClub: 'Driver', approachClub: '5i', approachDistance: '175-200', upDown: true }, // H16 fairway
    { par: 4, score: 4, putts: 2, fairwayHit: 'right', greenHit: true, teeClub: '3w', approachClub: 'PW', approachDistance: '100-125' },             // H17 right
    { par: 4, score: 4, putts: 2, fairwayHit: true, greenHit: true, teeClub: 'Driver', approachClub: '9i', approachDistance: '125-150' },            // H18 fairway
  ];

  const yardages = [382, 394, 162, 518, 408, 386, 171, 542, 401, 410, 509, 167, 414, 389, 160, 533, 404, 398];
  // Tee-shot distribution across the 3 rounds is tuned to ~60% fairway / 30% right /
  // 10% left on average — representative of an 80-shooter with a slight slice tendency.
  // Per-round counts below match the fairwayAdjustments overrides.
  // Seed-round notes written in a coach voice: no em-dashes, no filler
  // ("solid", "typical"), concrete observations plus a drill when warranted.
  const rounds = [
    { daysAgo: 6, score: 80, putts: 31, fairways: 8, greens: 8, upDownMade: 4, upDownAttempts: 8, notes: 'Driver was on line today. One stray right off the tee, but you held it together. Keep the tempo you had on the back nine.' },
    { daysAgo: 3, score: 81, putts: 32, fairways: 7, greens: 8, upDownMade: 3, upDownAttempts: 8, notes: 'The right miss showed up more today. Check your grip pressure on the tee and trust the full turn. Wedges bailed you out.' },
    { daysAgo: 1, score: 79, putts: 30, fairways: 9, greens: 10, upDownMade: 5, upDownAttempts: 7, notes: 'Sharp round. The right miss was quieter and your wedges were dialed. Repeat whatever you did before the round next time.' },
  ];
  const scoreAdjustments: Array<Record<number, number>> = [
    {},
    { 6: 1 },
    { 14: -1 },
  ];
  // Per-round tee-shot adjustments so each round feels distinct while averaging
  // to ~60/30/10 fairway/right/left across the three rounds.
  // Round 0 (6d, 80): 8T / 5R / 1L = 57% fairway — one stray right.
  // Round 1 (3d, 81): 7T / 6R / 1L = 50% fairway — slice showed up twice.
  // Round 2 (1d, 79): 9T / 4R / 1L = 64% fairway — best day, base template.
  // Hole numbers are 1-indexed. Values replace the base template's fairwayHit.
  type FairwayOutcome = true | 'right' | 'left';
  const fairwayAdjustments: Array<Record<number, FairwayOutcome>> = [
    { 9: 'right' },                             // round 0: 1 extra right miss
    { 9: 'right', 16: 'right' },                // round 1: 2 extra right misses
    {},                                         // round 2: best day, use base template
  ];

  return rounds.map((roundSeed, roundIndex) => {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() - roundSeed.daysAgo);
    date.setHours(8 + roundIndex, 15, 0, 0);

    const fairwayOverride = fairwayAdjustments[roundIndex] || {};
    const holes: RoundHole[] = holeTemplates.map((hole, holeIndex) => {
      const holeNumber = holeIndex + 1;
      const baseFairway = hole.par === 3 ? null : hole.fairwayHit ?? null;
      const adjustedFairway = hole.par === 3 ? null : (fairwayOverride[holeNumber] ?? baseFairway);
      return {
        number: holeNumber,
        par: hole.par,
        handicapIndex: HAVEN_HOLE_HANDICAPS[holeIndex] ?? holeNumber,
        score: hole.score + (scoreAdjustments[roundIndex]?.[holeNumber] ?? 0),
        putts: hole.putts,
        fairwayHit: adjustedFairway,
        greenHit: hole.greenHit ?? null,
        approachDistance: hole.approachDistance ?? null,
        teeClub: hole.teeClub,
        approachClub: hole.approachClub ?? null,
        upDown: hole.upDown ?? null,
        isSaved: true,
      };
    });

    const stats = summarizeRoundStats(holes);
    const adjustedScore = roundSeed.score;
    const gpsShots = holeTemplates.flatMap((hole, holeIndex) =>
      buildHavenShotLog(
        holeIndex + 1,
        {
          ...hole,
          score: holes[holeIndex].score,
          putts: holes[holeIndex].putts || 0,
          fairwayHit: holes[holeIndex].fairwayHit,
          greenHit: holes[holeIndex].greenHit,
          teeClub: holes[holeIndex].teeClub || hole.teeClub,
          approachClub: holes[holeIndex].approachClub ?? hole.approachClub ?? null,
          upDown: holes[holeIndex].upDown ?? hole.upDown ?? null,
        },
        yardages[holeIndex],
        roundIndex,
        date.toISOString(),
      )
    );
    const holeMapUrls = holes.reduce((acc, hole, holeIndex) => {
      const shots = gpsShots.filter((shot) => shot.holeNumber === hole.number);
      const staticUrl = buildSeedStaticMapUrl(shots);
      if (staticUrl) acc[hole.number] = staticUrl;
      return acc;
    }, {} as Record<number, string>);

    return {
      date,
      courseName,
      score: roundSeed.score,
      stats: {
        ...stats,
        score: roundSeed.score,
        putts: roundSeed.putts,
        fairways: roundSeed.fairways,
        greens: roundSeed.greens,
        upDownMade: roundSeed.upDownMade,
        upDownAttempts: roundSeed.upDownAttempts,
        teeBox: 'Blue',
      },
      html: '',
      imageUri: '',
      courseId,
      courseSource: CourseSource.API,
      teeName: 'Blue',
      tee: 'Blue',
      holeCount: 18,
      plannedHoles: 18,
      holesPlayed: holes.map((hole) => hole.number),
      roundLength: '18',
      roundSource: 'manual',
      entryMode: 'advanced',
      roundStartedAt: date.getTime() - 4 * 60 * 60 * 1000,
      roundEndedAt: date.getTime(),
      roundDurationMinutes: 235,
      gpsShots,
      gpsShotCount: gpsShots.length,
      holeMapUrls,
      holes,
      weather: {
        temp: '74F',
        conditions: 'Clear',
        wind: roundIndex === 1 ? '10 mph' : '8 mph',
      },
      notes: roundSeed.notes,
      isSeededTestRound: true,
      courseSnapshot: {
        courseId,
        name: courseName,
        location: {
          city: 'Green Valley',
          state: 'AZ',
          country: 'USA',
          latitude: 31.872,
          longitude: -111.001,
        },
        holesCount: 18,
        tee: {
          name: 'Blue',
          rating: 71.6,
          slope: 128,
          yardageTotal: yardages.reduce((sum, yards) => sum + yards, 0),
        },
        holes: holes.map((hole, idx) => ({
          number: hole.number,
          par: hole.par,
          yardage: yardages[idx],
          handicapIndex: HAVEN_HOLE_HANDICAPS[idx] ?? idx + 1,
        })),
        source: CourseSource.API,
        version: 1,
        lastVerifiedAt: Date.now(),
      },
      adjustedGrossScore: adjustedScore,
    };
  });
}

const getErrorMessage = (error: unknown): string => {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message?: unknown }).message;
    return typeof msg === 'string' ? msg : '';
  }
  return '';
};

function shouldCountAsAdvancedTrialRound(round: SavedRound): boolean {
  if (round.isSample || round.isSeededTestRound) return false;
  const inferredSource: 'manual' | 'import' =
    round.roundSource ?? (round.imageUri ? 'import' : 'manual');
  const hasSavedHole =
    (round.holes?.some(h => h.isSaved || (h.score ?? 0) > 0) ?? false) || round.score > 0;
  return inferredSource === 'manual' && round.entryMode === 'advanced' && hasSavedHole;
}

async function getLocalStoredRounds(): Promise<SavedRound[]> {
  const data = await getLocalRoundsRaw();
  if (!data) return [];
  try {
    const rounds = JSON.parse(data) as SavedRound[];
    return rounds.map((round) => ({
      ...round,
      date: new Date(round.date),
    }));
  } catch (error) {
    logger.error(`❌ Error parsing ${getStorageLabel()} rounds:`, error);
    return [];
  }
}

// Track Firestore availability to reduce error spam
let firestoreAvailable = true;
let firestoreWarningShown = false;

// ── Async mutex for local storage writes ────────────────────────────────────
// Prevents race conditions when concurrent operations (e.g., save + handicap
// flag update) read-then-write the same rounds array.
let _storageLock: Promise<void> = Promise.resolve();

function withStorageLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = _storageLock;
  let releaseLock: () => void;
  _storageLock = new Promise<void>(resolve => { releaseLock = resolve; });

  return prev.then(async () => {
    try {
      return await fn();
    } finally {
      releaseLock!();
    }
  });
}

const buildSampleRounds = (): SavedRound[] => {
  const havenRounds = buildHavenSeedRounds();
  return havenRounds.map((round, index) => ({
    ...round,
    id: index === 0 ? SAMPLE_ROUND_ID : `sample_round_${index + 1}`,
    isAcceptableForHandicap: false,
    handicapStatus: 'Sample data',
    notes: `Sample data • ${round.notes || 'Haven Golf Course'}`,
    isSample: true,
    isSeededTestRound: false,
  } as SavedRound));
};

export async function loadSampleRound(): Promise<SavedRound> {
  const samples = buildSampleRounds();
  await setSampleRoundRaw(JSON.stringify(samples));
  await setSampleDismissedFlag(false);
  return samples[0];
}

export async function loadSampleRounds(): Promise<SavedRound[]> {
  const samples = buildSampleRounds();
  await setSampleRoundRaw(JSON.stringify(samples));
  await setSampleDismissedFlag(false);
  return samples;
}

export async function seedPebbleHistoryRounds(): Promise<SavedRound[]> {
  const seedRounds = buildPebbleSeedRounds();
  const saved: SavedRound[] = [];

  for (const round of seedRounds) {
    const savedRound = await saveRound(round);
    saved.push(savedRound);
  }

  await syncLocalDataToFirestore().catch((error) => {
    logger.warn('Pebble seed sync to Firestore failed, kept local cache only', error);
  });

  return saved;
}

export async function seedHavenHistoryRounds(): Promise<SavedRound[]> {
  const existingRounds = await getRounds();
  const staleHavenRounds = existingRounds.filter(
    (round) => round.courseId === HAVEN_COURSE_ID && round.courseName === 'Haven Golf Course' && round.isSeededTestRound,
  );
  for (const round of staleHavenRounds) {
    await deleteRound(round.id);
  }

  const seedRounds = buildHavenSeedRounds();
  const saved: SavedRound[] = [];

  for (const round of seedRounds) {
    const savedRound = await saveRound(round);
    saved.push(savedRound);
  }

  await syncLocalDataToFirestore().catch((error) => {
    logger.warn('Haven seed sync to Firestore failed, kept local cache only', error);
  });

  return saved;
}

export async function dismissSampleRound(): Promise<void> {
  await removeSampleRoundRaw();
  await setSampleDismissedFlag(true);
}

export async function getSampleRound(): Promise<SavedRound | null> {
  const rounds = await getSampleRounds();
  return rounds[0] ?? null;
}

export async function getSampleRounds(): Promise<SavedRound[]> {
  const dismissed = await getSampleDismissedFlag();
  if (dismissed) return [];
  const raw = await getSampleRoundRaw();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SavedRound | SavedRound[];
    const asArray = Array.isArray(parsed) ? parsed : [parsed];
    return asArray.map((round) => ({ ...round, date: new Date(round.date) }));
  } catch (error) {
    logger.error('Failed to parse sample round:', error);
    return [];
  }
}

// Reset Firestore availability (call after fixing Firebase rules)
export function resetFirestoreConnection() {
  logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  logger.debug('🔄 RESETTING FIRESTORE CONNECTION');
  logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  firestoreAvailable = true;
  firestoreWarningShown = false;
  logger.debug('✅ Firestore connection reset.');
  logger.debug(`   Authenticated: ${isAuthenticated()}`);
  logger.debug('   Try saving a round now.');
  logger.debug('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

// Check if user is authenticated
function isAuthenticated(): boolean {
  return getCurrentUser() !== null;
}

// Show Firestore warning once
function showFirestoreWarning() {
  if (!firestoreWarningShown) {
    logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.warn('⚠️  FIRESTORE PERMISSION DENIED (403)');
    logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.warn('✅ Your rounds ARE being saved locally on this device');
    logger.warn('❌ Cloud sync is disabled until you fix Firebase rules');
    logger.warn('');
    logger.warn('📋 TO FIX:');
    logger.warn('   1. Go to Firebase Console → Firestore → Rules');
    logger.warn('   2. Update security rules (see FIRESTORE_PERMISSION_FIX.md)');
    logger.warn('   3. Click "Publish"');
    logger.warn('   4. Refresh this app');
    logger.warn('');
    logger.warn('📖 See FIRESTORE_PERMISSION_FIX.md for full instructions');
    logger.warn('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    firestoreWarningShown = true;
    firestoreAvailable = false;
  }
}

// Platform-safe local storage helpers
async function getLocalRoundsRaw(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(STORAGE_KEY);
  }
  return await AsyncStorage.getItem(STORAGE_KEY);
}

async function setLocalRoundsRaw(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(STORAGE_KEY, value);
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEY, value);
}

export async function clearLocalRounds(): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SAMPLE_ROUND_KEY);
    localStorage.removeItem(SAMPLE_DISMISSED_KEY);
    return;
  }
  await AsyncStorage.multiRemove([STORAGE_KEY, SAMPLE_ROUND_KEY, SAMPLE_DISMISSED_KEY]);
}

async function getSampleRoundRaw(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(SAMPLE_ROUND_KEY);
  }
  return await AsyncStorage.getItem(SAMPLE_ROUND_KEY);
}

async function setSampleRoundRaw(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(SAMPLE_ROUND_KEY, value);
    return;
  }
  await AsyncStorage.setItem(SAMPLE_ROUND_KEY, value);
}

async function removeSampleRoundRaw(): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(SAMPLE_ROUND_KEY);
    return;
  }
  await AsyncStorage.removeItem(SAMPLE_ROUND_KEY);
}

async function getSampleDismissedFlag(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(SAMPLE_DISMISSED_KEY) === 'true';
  }
  return (await AsyncStorage.getItem(SAMPLE_DISMISSED_KEY)) === 'true';
}

async function setSampleDismissedFlag(value: boolean): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(SAMPLE_DISMISSED_KEY, value ? 'true' : 'false');
    return;
  }
  await AsyncStorage.setItem(SAMPLE_DISMISSED_KEY, value ? 'true' : 'false');
}

function getStorageLabel(): string {
  return Platform.OS === 'web' ? 'localStorage' : 'AsyncStorage';
}

// Get all saved rounds (from Firestore if authenticated, AsyncStorage/localStorage otherwise)
/**
 * Migrates old rounds to include WHS data if missing
 */
async function migrateRoundsToWHS(rounds: SavedRound[]): Promise<SavedRound[]> {
  let needsMigration = false;
  const roundsNeedingRemoteUpdate: SavedRound[] = [];
  
  const normalizedRounds = rounds.map(round => {
    let normalizedRound = round;

    const inferredHoleCount = normalizedRound.holeCount
      || normalizedRound.holes?.length
      || (normalizedRound.isNineHoleRound ? 9 : normalizedRound.courseSnapshot?.holesCount)
      || undefined;
    if (!normalizedRound.holeCount && inferredHoleCount) {
      normalizedRound = { ...normalizedRound, holeCount: inferredHoleCount };
      needsMigration = true;
    }

    const canRecalcEligibility =
      getRoundCoursePar(normalizedRound) !== null &&
      (normalizedRound.holeCount || normalizedRound.holes?.length);

    // Check if round needs migration
    if (
      (normalizedRound.differential === undefined ||
        normalizedRound.isAcceptableForHandicap === undefined ||
        normalizedRound.adjustedGrossScore === undefined ||
        (normalizedRound.isAcceptableForHandicap === false && canRecalcEligibility)) &&
      getRoundCoursePar(normalizedRound) !== null
    ) {
      needsMigration = true;
      
      // Create holes array if missing (assume par 4 for all holes if we don't have data)
      const holes = normalizedRound.holes || Array.from({ length: 18 }, (_, i) => ({
        number: i + 1,
        par: 4, // Default assumption
        score: Math.round(normalizedRound.score / 18), // Distribute score evenly
      }));
      
      // Apply WHS calculations
      const updatedRound = { ...normalizedRound, holes };
      return updateRoundWithWHSCalculations(updatedRound, 0); // Pass 0 handicap for initial calculation
    }
    
    return normalizedRound;
  });

  const elevationKeyForRound = (round: SavedRound): string | null => {
    const location = round.courseSnapshot?.location;
    if (location?.latitude === undefined || location?.longitude === undefined) return null;
    return `${location.latitude},${location.longitude}`;
  };

  const elevationLookups = new Map<string, { lat: number; lon: number }>();
  normalizedRounds.forEach(round => {
    const location = round.courseSnapshot?.location;
    if (!location || location.elevationFt !== undefined) return;
    if (location.latitude === undefined || location.longitude === undefined) return;
    const key = elevationKeyForRound(round);
    if (key && !elevationLookups.has(key)) {
      elevationLookups.set(key, { lat: location.latitude, lon: location.longitude });
    }
  });

  const elevationCache = new Map<string, number | null>();
  if (elevationLookups.size > 0) {
    await Promise.all(
      Array.from(elevationLookups.entries()).map(async ([key, coords]) => {
        const elevation = await getElevationFeet(coords.lat, coords.lon);
        elevationCache.set(key, elevation);
      })
    );
  }

  const migratedRounds = normalizedRounds.map(round => {
    const key = elevationKeyForRound(round);
    if (!key) return round;
    const location = round.courseSnapshot?.location;
    if (!location || location.elevationFt !== undefined) return round;
    const elevation = elevationCache.get(key);
    if (typeof elevation !== 'number') return round;
    needsMigration = true;
    const updatedRound = {
      ...round,
      courseSnapshot: {
        ...round.courseSnapshot!,
        location: {
          ...location,
          elevationFt: elevation,
        },
      },
    };
    roundsNeedingRemoteUpdate.push(updatedRound);
    return updatedRound;
  });
  
  if (needsMigration) {
    logger.debug('🔄 Migrated rounds to WHS format or course metadata');
    // Save the migrated rounds
    try {
      await setLocalRoundsRaw(JSON.stringify(migratedRounds));
    } catch (error) {
      logger.error('Error saving migrated rounds:', error);
    }

    if (roundsNeedingRemoteUpdate.length > 0 && isAuthenticated() && firestoreAvailable) {
      try {
        await Promise.all(
          roundsNeedingRemoteUpdate.map(round =>
            updateRoundInFirestore(round.id, {
              courseSnapshot: round.courseSnapshot,
            })
          )
        );
        logger.debug(`✅ Backfilled elevation for ${roundsNeedingRemoteUpdate.length} rounds in Firestore`);
      } catch (error) {
        logger.error('Error backfilling elevation to Firestore:', error);
      }
    }
  }
  
  return migratedRounds;
}

export async function getRounds(): Promise<SavedRound[]> {
  // Try Firestore first if authenticated and it's available
  if (isAuthenticated() && firestoreAvailable) {
    try {
      const firestoreRounds = await getRoundsFromFirestore();
      logger.debug(`✓ Loaded ${firestoreRounds.length} rounds from Firestore`);
      const localRounds = await getLocalStoredRounds();
      const mergedRounds = [...firestoreRounds];
      const existingIds = new Set(firestoreRounds.map((round) => round.id));
      localRounds.forEach((round) => {
        if (!existingIds.has(round.id)) {
          mergedRounds.push(round);
        }
      });
      const migrated = await migrateRoundsToWHS(mergedRounds);
      const sorted = migrated.sort((a, b) => b.date.getTime() - a.date.getTime());
      const sampleRounds = await getSampleRounds();
      if (sampleRounds.length > 0 && sorted.length === 0) {
        return sampleRounds;
      }
      if (sampleRounds.length > 0 && sorted.length > 0) {
        await dismissSampleRound();
      }
      return sorted;
  } catch (error: unknown) {
      const message = getErrorMessage(error);
      if (message.includes('403') || message.includes('permission') || message.includes('Failed to fetch')) {
        showFirestoreWarning();
      } else {
        logger.debug('ℹ️ Firestore not available, using local storage');
      }
    }
  }
  
  // Fallback to AsyncStorage (native) or localStorage (web)
  try {
    const data = await getLocalRoundsRaw();
    logger.debug(`📂 Checking ${getStorageLabel()} for key: ${STORAGE_KEY}`);
    if (data) {
      logger.debug(`📂 Found ${getStorageLabel()} data, length: ${data.length} characters`);
    } else {
      logger.debug(`📂 No data found in ${getStorageLabel()}`);
    }
    
    if (!data) {
      logger.debug('📂 No saved rounds found');
      const sampleRounds = await getSampleRounds();
      if (sampleRounds.length > 0) {
        return sampleRounds;
      }
      return [];
    }
    
    const rounds = JSON.parse(data) as SavedRound[];
    logger.debug(`✅ Loaded ${rounds.length} rounds from ${getStorageLabel()}`);
    
    // Convert date strings back to Date objects
    const roundsWithDates = rounds.map(r => ({
      ...r,
      date: new Date(r.date)
    }));
    
    // Migrate rounds to WHS if needed
    const migrated = await migrateRoundsToWHS(roundsWithDates);
    const sorted = migrated.sort((a, b) => b.date.getTime() - a.date.getTime());
    const sampleRounds = await getSampleRounds();
    if (sampleRounds.length > 0 && sorted.length === 0) {
      return sampleRounds;
    }
    if (sampleRounds.length > 0 && sorted.length > 0) {
      await dismissSampleRound();
    }
    return sorted;
  } catch (error) {
    logger.error('❌ Error loading rounds:', error);
    logger.error(`❌ This could mean corrupted data in ${getStorageLabel()}`);
    return [];
  }
}

// Save a new round (to Firestore + Storage if authenticated, AsyncStorage/localStorage otherwise)
export function saveRound(round: Omit<SavedRound, 'id'>): Promise<SavedRound> {
  return withStorageLock(() => _saveRound(round));
}

async function _saveRound(round: Omit<SavedRound, 'id'>): Promise<SavedRound> {
  const existingSample = await getSampleRound();
  if (existingSample) {
    await dismissSampleRound();
  }
  let newRound: SavedRound = {
    ...round,
    id: `round_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  };
  
  // WHS Compliance: Calculate differential and acceptability
  const currentHandicap = await calculateHandicapIndex();
  newRound = updateRoundWithWHSCalculations(newRound, currentHandicap);
  
  logger.debug('📊 WHS Calculations:', {
    acceptable: newRound.isAcceptableForHandicap,
    differential: newRound.differential,
    adjusted: newRound.adjustedGrossScore
  });
  
  try {
    const profileSnapshot = await getUserProfile().catch(() => null);

    // If authenticated and Firestore is available, save to Firestore + Storage
    if (isAuthenticated() && firestoreAvailable) {
      logger.debug('💾 Attempting to save round to Firestore...');
      
      // Upload images to Firebase Storage (skip if no image)
      let cloudImageUri = newRound.imageUri;
      let cloudThumbnailUri = newRound.thumbnailUri;
      
      if (newRound.imageUri && newRound.imageUri.trim() !== '') {
        try {
          // Compress and upload main image
          const compressedImage = await compressImage(newRound.imageUri, 1600, 0.85);
          cloudImageUri = await uploadScorecardImage(compressedImage, newRound.id);
          logger.debug('✓ Scorecard image uploaded');
          
          // Create and upload thumbnail
          if (!newRound.thumbnailUri) {
            const thumbnail = await createThumbnail(newRound.imageUri, 200);
            cloudThumbnailUri = await uploadThumbnail(thumbnail, newRound.id);
            logger.debug('✓ Thumbnail uploaded');
          } else {
            cloudThumbnailUri = await uploadThumbnail(newRound.thumbnailUri, newRound.id);
          }
        } catch (error) {
          logger.error('Image upload error (continuing with save):', error);
        }
      } else {
        logger.debug('ℹ️ No scorecard image to upload (manual entry)');
      }
      
      // Save round with cloud image URLs
      const cloudRound: SavedRound = {
        ...newRound,
        imageUri: cloudImageUri,
        thumbnailUri: cloudThumbnailUri,
      };
      
      try {
        await saveRoundToFirestore(cloudRound);
        logger.debug('✅ SUCCESS! Round saved to Firestore');
        logger.debug('   Round ID:', cloudRound.id);
        logger.debug('   Course:', cloudRound.courseName);
        logger.debug('   Score:', cloudRound.score);
        
        // Also save to local cache
        const rounds = await getLocalStoredRounds();
        rounds.unshift(cloudRound);
        await setLocalRoundsRaw(JSON.stringify(rounds));
        
        await _updateHandicapFlags();
        if (shouldCountAsAdvancedTrialRound(cloudRound)) {
          // Count one trial round once the first hole has been saved in advanced mode.
          await incrementTrialRound();
        }
        processRoundShotDistances(cloudRound, profileSnapshot?.clubDistances ?? null)
          .catch((error) => logger.warn('Club distance processing failed after cloud save', error));
        return cloudRound;
      } catch (firestoreError: unknown) {
        if (getErrorMessage(firestoreError).includes('403')) {
          showFirestoreWarning();
        } else {
          logger.debug('ℹ Firestore save failed, falling back to local storage only');
        }
        // Continue to local storage fallback below
      }
    } else {
      // Log why we're not attempting Firestore
      if (!isAuthenticated()) {
        logger.debug('ℹ️ Skipping Firestore (not authenticated)');
      } else if (!firestoreAvailable) {
        logger.debug('⚠️ Skipping Firestore (connection disabled due to previous errors)');
        logger.debug('💡 Run window.resetFirestore() in console to re-enable after fixing Firebase rules');
      }
    }
    
    // Fallback: save to AsyncStorage (native) or localStorage (web)
    const rounds = await getLocalStoredRounds();
    rounds.unshift(newRound);
    
    const serialized = JSON.stringify(rounds);
    
    await setLocalRoundsRaw(serialized);
    
    await _updateHandicapFlags();
    if (shouldCountAsAdvancedTrialRound(newRound)) {
      // Count one trial round once the first hole has been saved in advanced mode.
      await incrementTrialRound();
    }
    processRoundShotDistances(newRound, profileSnapshot?.clubDistances ?? null)
      .catch((error) => logger.warn('Club distance processing failed after local save', error));
    
    logger.debug(`✅ Round saved to ${getStorageLabel()}:`, newRound.id);
    return newRound;
  } catch (error) {
    logger.error('❌ Error saving round:', error);
    throw error;
  }
}

// Delete a round (from Firestore + Storage if authenticated, AsyncStorage/localStorage otherwise)
export function deleteRound(roundId: string): Promise<void> {
  return withStorageLock(() => _deleteRound(roundId));
}

async function _deleteRound(roundId: string): Promise<void> {
  try {
    if (roundId.startsWith('sample_round')) {
      await dismissSampleRound();
      logger.debug('✅ Sample round dismissed');
      return;
    }
    // Delete from Firestore + Storage if authenticated and available
    if (isAuthenticated() && firestoreAvailable) {
      await deleteRoundFromFirestore(roundId);
      await deleteScorecardImage(roundId);
      logger.debug('✓ Round deleted from cloud');
    }
    
    // Delete from AsyncStorage/localStorage
    const rounds = await getRounds();
    const filtered = rounds.filter(r => r.id !== roundId);
    
    const serialized = JSON.stringify(filtered);
    
    await setLocalRoundsRaw(serialized);
    
    // Recalculate handicap after deleting
    await _updateHandicapFlags();
    
    logger.debug('✅ Round deleted:', roundId);
  } catch (error) {
    logger.error('❌ Error deleting round:', error);
    throw error;
  }
}

// Get a single round by ID
export async function getRound(roundId: string): Promise<SavedRound | null> {
  const rounds = await getRounds();
  return rounds.find(r => r.id === roundId) || null;
}

// Update an existing round (in Firestore if authenticated, AsyncStorage/localStorage otherwise)
export function updateRound(roundId: string, updates: Partial<SavedRound>): Promise<SavedRound | null> {
  return withStorageLock(() => _updateRound(roundId, updates));
}

async function _updateRound(roundId: string, updates: Partial<SavedRound>): Promise<SavedRound | null> {
  try {
    const rounds = await getRounds();
    const index = rounds.findIndex(r => r.id === roundId);
    
    if (index === -1) {
      logger.error('Round not found:', roundId);
      return null;
    }
    
    // Merge updates
    const updatedRound = {
      ...rounds[index],
      ...updates,
      // Preserve ID and date
      id: rounds[index].id,
      date: rounds[index].date,
    };
    
    // Update in Firestore if authenticated and available
    if (isAuthenticated() && firestoreAvailable) {
      await updateRoundInFirestore(roundId, updates);
      logger.debug('✓ Round updated in Firestore');
    }
    
    // Update in AsyncStorage/localStorage
    rounds[index] = updatedRound;
    
    const serialized = JSON.stringify(rounds);
    
    await setLocalRoundsRaw(serialized);
    
    // Recalculate handicap flags after update
    await _updateHandicapFlags();
    
    logger.debug('✅ Round updated:', roundId);
    return updatedRound;
  } catch (error) {
    logger.error('❌ Error updating round:', error);
    throw error;
  }
}

// Calculate round rating (legacy function name preserved)
export function calculateDifferential(score: number, coursePar: number = 72, _legacySlopeRating: number = 113): number {
  return calculateRoundRating(score, coursePar);
}

// Calculate handicap index using WHS-compliant calculations
export async function calculateHandicapIndex(): Promise<number | null> {
  const rounds = await getRounds();
  
  if (rounds.length === 0) return null;
  
  // Use WHS calculation (includes fallback table for fewer than 20 rounds)
  return calculateWHSHandicapIndex(rounds);
}

// Update which rounds are used for handicap
export function updateHandicapFlags(): Promise<void> {
  return withStorageLock(() => _updateHandicapFlags());
}

async function _updateHandicapFlags(): Promise<void> {
  try {
    const rounds = await getRounds();
    
    if (rounds.length === 0) return;
    
    const details = getHandicapCalculationDetails(rounds);
    const bestIds = new Set(details.roundIdsUsed);

    const updatedRounds = rounds.map(r => {
      const adjustedScore = r.adjustedGrossScore ?? r.score;
      const coursePar = getRoundCoursePar(r);
      const differential = r.isNineHoleRound
        ? undefined
        : coursePar == null
        ? undefined
        : calculateScoreDifferential(
            adjustedScore,
            coursePar,
            113
          ) || undefined;
      return {
        ...r,
        usedForHandicap: bestIds.has(r.id),
        differential,
      };
    });
    
    const serialized = JSON.stringify(updatedRounds);
    
    await setLocalRoundsRaw(serialized);
    
    logger.debug(`✅ Updated handicap flags for ${updatedRounds.length} rounds`);
  } catch (error) {
    logger.error('❌ Error updating handicap flags:', error);
  }
}

// Get average stats from best 8 of last 20 rounds
export async function getAverageStats(): Promise<AverageStats | null> {
  const rounds = await getRounds();
  
  if (rounds.length === 0) return null;
  
  // Get rounds used for handicap
  const handicapRounds = rounds.filter(r => r.usedForHandicap);
  
  if (handicapRounds.length === 0) {
    // If no flags set, use best 8 of available
    const sortedByScore = [...rounds].sort((a, b) => a.score - b.score);
    const best = sortedByScore.slice(0, Math.min(HANDICAP_BEST, sortedByScore.length));
    const averages = calculateAverages(best, rounds.length);
    
    // Save to Firestore if authenticated
    if (isAuthenticated()) {
      await saveAverageStats(averages);
    }
    
    return averages;
  }
  
  const averages = calculateAverages(handicapRounds, rounds.length);
  
  // Save to Firestore if authenticated
  if (isAuthenticated()) {
    await saveAverageStats(averages);
  }
  
  return averages;
}

function calculateAverages(rounds: SavedRound[], totalRounds: number): AverageStats {
  const count = rounds.length;
  
  const sumScore = rounds.reduce((sum, r) => sum + r.score, 0);
  const sumPutts = rounds.reduce((sum, r) => sum + (r.stats.putts || 0), 0);
  const sumFairways = rounds.reduce((sum, r) => sum + (r.stats.fairways || 0), 0);
  const sumGreens = rounds.reduce((sum, r) => sum + (r.stats.greens || 0), 0);
  
  // Calculate scrambling: total up-downs made / total attempts
  let totalUpDownMade = 0;
  let totalUpDownAttempts = 0;
  let totalMissedGreens = 0;
  
  rounds.forEach(r => {
    if (r.stats.upDownMade !== undefined && r.stats.upDownAttempts) {
      totalUpDownMade += r.stats.upDownMade;
      totalUpDownAttempts += r.stats.upDownAttempts;
    }
    // Track missed greens for fallback calculation
    const missedGreens = (r.stats.greensPossible || 18) - (r.stats.greens || 0);
    totalMissedGreens += missedGreens;
  });
  
  // Calculate scrambling percentage properly
  let scramblePercentage = 0;
  if (totalUpDownAttempts > 0) {
    // Use actual up-down data
    scramblePercentage = Math.round((totalUpDownMade / totalUpDownAttempts) * 100);
  } else if (totalMissedGreens > 0) {
    // Fallback: estimate based on score vs GIR correlation
    // Players with lower handicaps typically have higher scrambling
    // Estimate ~45-55% for average players
    const avgHandicap = rounds.reduce((sum, r) => sum + (r.differential || 10), 0) / count;
    if (avgHandicap <= 5) {
      scramblePercentage = 58;
    } else if (avgHandicap <= 10) {
      scramblePercentage = 50;
    } else if (avgHandicap <= 15) {
      scramblePercentage = 42;
    } else {
      scramblePercentage = 35;
    }
  }
  
  // Calculate handicap index (average of best 8 differentials)
  const avgDifferential = rounds.reduce((sum, r) => {
    const coursePar = getRoundCoursePar(r) ?? 72;
    const diff = r.differential || calculateDifferential(r.score, coursePar, 113);
    return sum + diff;
  }, 0) / count;

  const safeAvgScore = Math.round((sumScore / count) * 10) / 10;
  const safeAvgPutts = Math.round((sumPutts / count) * 10) / 10;
  const fairwaysPossible = rounds.reduce((sum, r) => sum + (r.stats.fairwaysPossible || 0), 0);
  const greensPossible = rounds.reduce((sum, r) => sum + (r.stats.greensPossible || 0), 0);
  const fairwaysPct = fairwaysPossible > 0 ? Math.round((sumFairways / fairwaysPossible) * 1000) / 10 : 0;
  const greensPct = greensPossible > 0 ? Math.round((sumGreens / greensPossible) * 1000) / 10 : 0;
  const seasonRounds = rounds.filter(r => new Date(r.date).getFullYear() === new Date().getFullYear());
  const recentRounds = rounds.slice(0, Math.min(5, rounds.length));
  const seasonAvg = seasonRounds.length
    ? Math.round((seasonRounds.reduce((sum, r) => sum + r.score, 0) / seasonRounds.length) * 10) / 10
    : safeAvgScore;
  const recentAvg = recentRounds.length
    ? Math.round((recentRounds.reduce((sum, r) => sum + r.score, 0) / recentRounds.length) * 10) / 10
    : safeAvgScore;
  const parsByRound = rounds.map(r => (r.holes?.length ? r.holes.reduce((sum, h) => sum + (h.par || 0), 0) : 72));
  const scoresVsPar = rounds.map((r, idx) => r.score - (parsByRound[idx] || 72));
  const minScore = Math.min(...rounds.map(r => r.score));
  const maxScore = Math.max(...rounds.map(r => r.score));
  const minVsPar = Math.min(...scoresVsPar);
  const maxVsPar = Math.max(...scoresVsPar);

  const allHoles = rounds.flatMap(r => r.holes || []);
  const byPar = (par: number) => allHoles.filter(h => h.par === par);
  const par3Holes = byPar(3);
  const par4Holes = byPar(4);
  const par5Holes = byPar(5);
  const holeAvg = (holes: RoundHole[], fallbackPar: number) => holes.length
    ? Math.round((holes.reduce((sum, h) => sum + h.score, 0) / holes.length) * 100) / 100
    : fallbackPar;
  const par3Avg = holeAvg(par3Holes, 3);
  const par4Avg = holeAvg(par4Holes, 4);
  const par5Avg = holeAvg(par5Holes, 5);
  const totalHoles = allHoles.length || 1;
  const birdieOrBetter = allHoles.filter(h => h.score <= h.par - 1).length;
  const bogeyPlus = allHoles.filter(h => h.score >= h.par + 1).length;

  const mkTracked = (value: number | string) => ({
    value,
    state: StatState.TRACKED as const,
    roundsUsed: count,
  });

  return {
    typicalScore: {
      typical: safeAvgScore,
      mean: safeAvgScore,
      range: { min: minScore, max: maxScore },
    },
    typicalScoreVsPar: {
      typical: Math.round((scoresVsPar.reduce((sum, v) => sum + v, 0) / scoresVsPar.length) * 100) / 100,
      mean: Math.round((scoresVsPar.reduce((sum, v) => sum + v, 0) / scoresVsPar.length) * 100) / 100,
      range: { min: minVsPar, max: maxVsPar },
    },
    rollingScore: {
      recent: recentAvg,
      season: seasonAvg,
      career: safeAvgScore,
    },
    avgPutts: mkTracked(safeAvgPutts),
    avgFairways: mkTracked(fairwaysPct),
    avgGreens: mkTracked(greensPct),
    avgScrambling: mkTracked(scramblePercentage),
    avgUpDown: mkTracked(scramblePercentage),
    par3Avg,
    par4Avg,
    par5Avg,
    birdieRate: Math.round((birdieOrBetter / totalHoles) * 1000) / 10,
    bogeyPlusRate: Math.round((bogeyPlus / totalHoles) * 1000) / 10,
    roundsUsed: count,
    totalRounds,
    handicapIndex: Math.round(avgDifferential * 10) / 10,
  };
}

// Parse HTML table to extract stats
// Debug logger that works on mobile
let debugLogger: ((level: 'info' | 'success' | 'warning' | 'error', message: string, details?: unknown) => void) | null = null;

export function setDebugLogger(logger: typeof debugLogger) {
  debugLogger = logger;
}

export function parseHtmlForStats(html: string): Partial<RoundStats> {
  const stats: Partial<RoundStats> = {};
  
  debugLogger?.('info', '📊 Starting stats parsing...');
  debugLogger?.('info', `HTML length: ${html.length} chars`);
  
  // Log first 500 chars of HTML to see structure
  if (html.length > 0) {
    const preview = html.substring(0, 500).replace(/\s+/g, ' ');
    debugLogger?.('info', `HTML preview: ${preview}...`);
  } else {
    debugLogger?.('error', '❌ HTML is empty!');
    return stats;
  }
  
  try {
    // Create a temporary DOM element to parse HTML
    if (typeof document !== 'undefined') {
      const div = document.createElement('div');
      div.innerHTML = html;
      
      const rows = div.querySelectorAll('tr');
      debugLogger?.('info', `Found ${rows.length} rows in HTML`);
      
      if (rows.length === 0) {
        debugLogger?.('error', '❌ No <tr> rows found! HTML may be malformed.');
        return stats;
      }
      
      // Log all row labels so we can see what's available
      const allLabels: string[] = [];
      rows.forEach(row => {
        const cells = row.querySelectorAll('td, th');
        if (cells.length > 0) {
          const label = cells[0].textContent?.trim().toUpperCase() || '';
          if (label) allLabels.push(label);
        }
      });
      
      if (allLabels.length > 0) {
        debugLogger?.('info', `📋 Found ${allLabels.length} row labels:`, allLabels.join(', '));
      } else {
        debugLogger?.('error', '❌ No row labels found in HTML!');
      }
      
      rows.forEach(row => {
        const cells = row.querySelectorAll('td, th');
        if (cells.length < 2) return;
        
        const label = cells[0].textContent?.trim().toUpperCase() || '';
        
        // Skip header row and rows with no label
        if (!label || label === 'HOLE') return;
        
        // TOT column should be the LAST column (index 22 in 23-column layout)
        const totColumnIndex = cells.length - 1;
        const totCell = cells[totColumnIndex];
        const totValue = totCell?.textContent?.trim() || '';
        
        logger.debug(`🔍 Parsing row "${label}": ${cells.length} cells, TOT column = "${totValue}"`);
        
        // Helper: Get numeric value from cell
        const getNumeric = (cell: Element | null | undefined): number | null => {
          const text = cell?.textContent?.trim();
          if (!text) return null;
          const num = parseInt(text);
          return isNaN(num) ? null : num;
        };
        
        // Helper: Get fraction from cell (like "5/7")
        const getFraction = (cell: Element | null | undefined): { made: number; attempts: number } | null => {
          const text = cell?.textContent?.trim();
          const match = text?.match(/(\d+)\/(\d+)/);
          if (match) {
            return {
              made: parseInt(match[1]),
              attempts: parseInt(match[2])
            };
          }
          return null;
        };
        
        // Parse SCORE row (player's total score)
        const isScoreRow = !label.includes('PAR') && 
                          !label.includes('HANDICAP') && 
                          !label.includes('BLACK') && 
                          !label.includes('WHITE') && 
                          !label.includes('GRAY') && 
                          !label.includes('GREEN') &&
                          !label.includes('BLUE') &&
                          !label.includes('GOLD') &&
                          !label.includes('RED') &&
                          !label.includes('CHAMPION') &&
                          !label.includes('WINTER') && // Added WINTERUSH
                          !label.includes('PUTT') && 
                          !label.includes('FAIRWAY') &&
                          !label.includes('GIR') && 
                          !label.includes('HOLE') &&
                          !label.includes('APPROACH') && 
                          !label.includes('CHIP') &&
                          !label.includes('TEE') && 
                          !label.includes('UP') && 
                          !label.includes('DOWN') &&
                          !label.includes('SAVE') && 
                          !label.includes('DIST') &&
                          !label.includes('ATTEST') &&
                          label !== 'P' && 
                          label !== 'F' && 
                          label !== 'G';
        
        if (isScoreRow && !stats.score) {
          const score = getNumeric(totCell);
          logger.debug(`   → Checking "${label}" as SCORE row: TOT="${totValue}", parsed=${score}`);
          debugLogger?.('info', `🎯 Checking "${label}" as score row`, `TOT value: "${totValue}", Parsed: ${score}`);
          if (score && score >= 60 && score <= 130) {
            stats.score = score;
            logger.debug(`   ✅ Found SCORE: ${score}`);
            debugLogger?.('success', `✅ Score: ${score}`, `From row "${label}"`);
          } else if (score) {
            debugLogger?.('warning', `⚠️ Score ${score} out of range (60-130)`, `From row "${label}"`);
          } else {
            debugLogger?.('warning', `⚠️ No valid score in TOT column`, `Row "${label}", TOT="${totValue}"`);
          }
        } else if (!isScoreRow) {
          logger.debug(`   → Skipping "${label}" (not a score row)`);
        }
        
        // Parse PUTTS row
        if ((label.includes('PUTT') || label === 'P') && !stats.putts) {
          const putts = getNumeric(totCell);
          logger.debug(`   → Checking as PUTTS row: ${putts}`);
          debugLogger?.('info', `🏌️ Checking "${label}" as putts row`, `TOT value: "${totValue}", Parsed: ${putts}`);
          if (putts && putts >= 10 && putts <= 60) {
            stats.putts = putts;
            logger.debug(`   ✅ Found PUTTS: ${putts}`);
            debugLogger?.('success', `✅ Putts: ${putts}`, `From row "${label}"`);
          } else if (putts) {
            debugLogger?.('warning', `⚠️ Putts ${putts} out of range (10-60)`, `From row "${label}"`);
          } else {
            debugLogger?.('warning', `⚠️ No valid putts in TOT column`, `Row "${label}", TOT="${totValue}"`);
          }
        }
        
        // Parse FAIRWAYS row (can be number or fraction)
        if ((label.includes('FAIRWAY') || label === 'F' || label === 'FIR') && !stats.fairways) {
          debugLogger?.('info', `⛳ Checking "${label}" as fairways row`, `TOT value: "${totValue}"`);
          // Try fraction first (like "5/7")
          const fraction = getFraction(totCell);
          if (fraction) {
            stats.fairways = fraction.made;
            stats.fairwaysPossible = fraction.attempts;
            logger.debug(`   ✅ Found FAIRWAYS: ${fraction.made}/${fraction.attempts}`);
            debugLogger?.('success', `✅ Fairways: ${fraction.made}/${fraction.attempts}`, `From row "${label}"`);
          } else {
            // Try plain number
            const fairways = getNumeric(totCell);
            if (fairways !== null && fairways >= 0 && fairways <= 14) {
              stats.fairways = fairways;
              stats.fairwaysPossible = 14;
              logger.debug(`   ✅ Found FAIRWAYS: ${fairways}`);
              debugLogger?.('success', `✅ Fairways: ${fairways}/14`, `From row "${label}"`);
            } else {
              debugLogger?.('warning', `⚠️ No valid fairways data`, `Row "${label}", TOT="${totValue}"`);
            }
          }
        }
        
        // Parse GREENS row (can be number or fraction)
        if ((label.includes('GREEN') || label === 'G' || label === 'GIR') && !stats.greens) {
          debugLogger?.('info', `🎯 Checking "${label}" as greens row`, `TOT value: "${totValue}"`);
          // Try fraction first
          const fraction = getFraction(totCell);
          if (fraction) {
            stats.greens = fraction.made;
            stats.greensPossible = fraction.attempts;
            logger.debug(`   ✅ Found GREENS: ${fraction.made}/${fraction.attempts}`);
            debugLogger?.('success', `✅ Greens: ${fraction.made}/${fraction.attempts}`, `From row "${label}"`);
          } else {
            // Try plain number
            const greens = getNumeric(totCell);
            if (greens !== null && greens >= 0 && greens <= 18) {
              stats.greens = greens;
              stats.greensPossible = 18;
              logger.debug(`   ✅ Found GREENS: ${greens}`);
              debugLogger?.('success', `✅ Greens: ${greens}/18`, `From row "${label}"`);
            } else {
              debugLogger?.('warning', `⚠️ No valid greens data`, `Row "${label}", TOT="${totValue}"`);
            }
          }
        }
        
        // Parse UP/DOWN row (always a fraction)
        if ((label.includes('UP') || label.includes('DOWN') || label.includes('SAVE')) && !stats.upDownMade) {
          const fraction = getFraction(totCell);
          if (fraction) {
            stats.upDownMade = fraction.made;
            stats.upDownAttempts = fraction.attempts;
            logger.debug(`   ✅ Found UP/DOWN: ${fraction.made}/${fraction.attempts}`);
          } else {
            // Fallback: count checkmarks if no fraction in TOT column
            let checks = 0;
            let attempts = 0;
            Array.from(cells).forEach((cell, idx) => {
              if (idx > 0 && idx < cells.length - 3) { // Skip label and summary columns
                const text = cell.textContent?.trim() || '';
                if (text === '✓' || text === 'Y') checks++;
                if (text === '✓' || text === 'X' || text === 'Y' || text === 'N') attempts++;
              }
            });
            if (attempts > 0) {
              stats.upDownMade = checks;
              stats.upDownAttempts = attempts;
              logger.debug(`   ✅ Counted UP/DOWN from marks: ${checks}/${attempts}`);
            }
          }
        }
        
        // Ignore course rating/slope style values for compliance.
      });
      
      // Summary of what was found
      debugLogger?.('info', '📋 Parsing complete:', 
        `Score: ${stats.score || 'NOT FOUND'}\n` +
        `Putts: ${stats.putts || 'NOT FOUND'}\n` +
        `Fairways: ${stats.fairways}/${stats.fairwaysPossible || 'NOT FOUND'}\n` +
        `Greens: ${stats.greens}/${stats.greensPossible || 'NOT FOUND'}\n` +
        `Up/Down: ${stats.upDownMade}/${stats.upDownAttempts || 'NOT FOUND'}`
      );
    }
  } catch (error) {
    logger.error('Error parsing HTML for stats:', error);
    debugLogger?.('error', 'Failed to parse stats', error instanceof Error ? error.message : String(error));
  }
  
  return stats;
}

// Sync local data to Firestore (call this after sign-in)
export async function syncLocalDataToFirestore(): Promise<void> {
  if (!isAuthenticated() || !firestoreAvailable) return;
  
  try {
    logger.debug('🔄 Syncing local data to Firestore...');
    
    // Get all rounds from local storage (web or native)
    const localData = await getLocalRoundsRaw();
    if (!localData) {
      logger.debug('No local data to sync');
      return;
    }
    
    const localRounds = JSON.parse(localData) as SavedRound[];
    
    // Get existing rounds from Firestore
    const firestoreRounds = await getRoundsFromFirestore();
    const existingIds = new Set(firestoreRounds.map(r => r.id));
    
    // Upload only new rounds
    const newRounds = localRounds.filter(r => !existingIds.has(r.id) && !r.isSample);
    
    if (newRounds.length === 0) {
      logger.debug('✓ All data already synced');
      return;
    }
    
    logger.debug(`Uploading ${newRounds.length} new rounds...`);
    
    // Upload each new round
    for (const round of newRounds) {
      try {
        // Upload images if they exist and are not empty
        let cloudImageUri = round.imageUri;
        let cloudThumbnailUri = round.thumbnailUri;
        
        if (round.imageUri && round.imageUri.trim() !== '' && !round.imageUri.startsWith('http')) {
          try {
            const compressedImage = await compressImage(round.imageUri, 1600, 0.85);
            cloudImageUri = await uploadScorecardImage(compressedImage, round.id);
            
            if (round.thumbnailUri && !round.thumbnailUri.startsWith('http')) {
              cloudThumbnailUri = await uploadThumbnail(round.thumbnailUri, round.id);
            }
            logger.debug(`  ✓ Images uploaded for ${round.courseName}`);
          } catch (imgError) {
            logger.debug(`  ℹ️ Skipping image upload (manual entry)`);
          }
        }
        
        // Save round to Firestore
        const cloudRound: SavedRound = {
          ...round,
          imageUri: cloudImageUri || '',
          thumbnailUri: cloudThumbnailUri || '',
        };
        
        await saveRoundToFirestore(cloudRound);
        logger.debug(`  ✅ Synced: ${round.courseName} (${round.score})`);
      } catch (error) {
        logger.error(`  ❌ Error syncing ${round.courseName}:`, error);
      }
    }
    
    logger.debug(`✓ Sync complete: ${newRounds.length} rounds uploaded`);
  } catch (error) {
    logger.error('Sync error:', error);
  }
}
