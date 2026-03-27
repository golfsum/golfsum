import { Platform } from 'react-native';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import Storage from './storage';
import { db, isFirebaseEnabled } from './firebase';
import { getCurrentUser } from './firebaseAuthService';
import { estimateCarry } from './carryEstimator';
import { isQualifyingShot } from './shotQualityFilter';
import type { GpsShotLog, SavedRound, UserProfile } from '../types';
import { logger } from '../utils/logger';

const CLUB_AVERAGES_KEY = '@GolfSum:ClubAverages';
const MAX_RECENT_SHOTS = 30;
const GPS_PRIMARY_SAMPLE_COUNT = 10;
const GPS_BUILDING_SAMPLE_COUNT = 5;

function distanceBetweenYards(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const meters = R * c;
  return meters * 1.09361;
}

export interface ClubAverageShot {
  totalYards: number;
  carryEstimate: number;
  lie: string | null;
  hole: number;
  roundId: string;
  date: string;
}

export interface ClubAverageRecord {
  club: string;
  manualYards: number | null;
  gpsAvgTotal: number | null;
  gpsAvgCarry: number | null;
  sampleCount: number;
  roundsTracked: number;
  recentShots: ClubAverageShot[];
  lastUpdated?: string | null;
}

export interface ClubDisplayDistance {
  yards: number;
  source: 'gps' | 'manual';
  confidence: 'high' | 'low' | 'manual';
  sampleCount: number;
}

export interface SuggestedClubCandidate {
  club: string;
  displayYards: number;
  diff: number;
  sampleCount: number;
  source: 'gps' | 'manual';
  confidence: 'high' | 'low' | 'manual';
  matchQuality: 'strong' | 'ok' | 'gap';
}

function storageKeyForUser(uid?: string | null): string {
  return `${CLUB_AVERAGES_KEY}:${uid || 'guest'}`;
}

export function normalizeClubKey(value?: string | null): string {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  const compact = raw.replace(/[\s._-]+/g, '');

  const aliases: Record<string, string> = {
    d: 'driver',
    dr: 'driver',
    driver: 'driver',
    '1w': 'driver',
    '3w': '3 wood',
    '4w': '4 wood',
    '5w': '5 wood',
    '7w': '7 wood',
    '2h': '2 hybrid',
    '3h': '3 hybrid',
    '4h': '4 hybrid',
    '5h': '5 hybrid',
    '3i': '3 iron',
    '4i': '4 iron',
    '5i': '5 iron',
    '6i': '6 iron',
    '7i': '7 iron',
    '8i': '8 iron',
    '9i': '9 iron',
    p: 'putter',
    putter: 'putter',
    pw: 'pw',
    aw: 'aw',
    gw: 'gw',
    sw: 'sw',
    lw: 'lw',
  };

  if (aliases[compact]) return aliases[compact];
  return raw.replace(/\s+/g, ' ');
}

export function formatClubLabel(value?: string | null): string {
  const key = normalizeClubKey(value);
  if (!key) return '';
  if (key === 'driver') return 'Driver';
  if (key === 'putter') return 'Putter';
  if (key.endsWith(' wood') || key.endsWith(' hybrid') || key.endsWith(' iron')) {
    return key.replace(/\b\w/g, (char) => char.toUpperCase());
  }
  if (['pw', 'aw', 'gw', 'sw', 'lw'].includes(key)) return key.toUpperCase();
  return key.replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeManualDistances(distances?: Record<string, number> | null): Record<string, number> {
  return Object.fromEntries(
    Object.entries(distances || {})
      .map(([club, yards]) => [normalizeClubKey(club), Number(yards)] as const)
      .filter(([, yards]) => Number.isFinite(yards) && Number(yards) > 0)
  );
}

async function getLocalClubAveragesMap(): Promise<Record<string, ClubAverageRecord>> {
  const uid = getCurrentUser()?.uid ?? null;
  const raw = await Storage.getItem(storageKeyForUser(uid));
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, ClubAverageRecord>;
  } catch {
    return {};
  }
}

async function setLocalClubAveragesMap(map: Record<string, ClubAverageRecord>): Promise<void> {
  const uid = getCurrentUser()?.uid ?? null;
  await Storage.setItem(storageKeyForUser(uid), JSON.stringify(map));
}

export async function getClubAverages(): Promise<Record<string, ClubAverageRecord>> {
  const user = getCurrentUser();
  if (user && db && isFirebaseEnabled) {
    try {
      const snap = await getDocs(collection(db, 'users', user.uid, 'clubAverages'));
      const map = Object.fromEntries(
        snap.docs.map((entry) => [entry.id, { ...entry.data(), club: entry.id } as ClubAverageRecord])
      );
      await setLocalClubAveragesMap(map);
      return map;
    } catch (error) {
      logger.warn('Club averages Firestore read failed, using local cache', error);
    }
  }
  return getLocalClubAveragesMap();
}

async function saveClubAverage(record: ClubAverageRecord): Promise<void> {
  const key = normalizeClubKey(record.club);
  const existing = await getLocalClubAveragesMap();
  const next = { ...existing, [key]: record };
  await setLocalClubAveragesMap(next);

  const user = getCurrentUser();
  if (user && db && isFirebaseEnabled) {
    try {
      await setDoc(
        doc(db, 'users', user.uid, 'clubAverages', key),
        {
          ...record,
          club: key,
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      logger.warn('Club average Firestore write failed, kept local cache only', error);
    }
  }
}

export function getClubDisplayDistance(
  clubAverage?: ClubAverageRecord | null,
  manualYards?: number | null
): ClubDisplayDistance | null {
  if (clubAverage?.gpsAvgTotal && clubAverage.sampleCount >= GPS_PRIMARY_SAMPLE_COUNT) {
    return {
      yards: clubAverage.gpsAvgTotal,
      source: 'gps',
      confidence: 'high',
      sampleCount: clubAverage.sampleCount,
    };
  }
  if (clubAverage?.gpsAvgTotal && clubAverage.sampleCount >= GPS_BUILDING_SAMPLE_COUNT) {
    return {
      yards: clubAverage.gpsAvgTotal,
      source: 'gps',
      confidence: 'low',
      sampleCount: clubAverage.sampleCount,
    };
  }
  if (manualYards && Number.isFinite(manualYards)) {
    return {
      yards: manualYards,
      source: 'manual',
      confidence: 'manual',
      sampleCount: clubAverage?.sampleCount || 0,
    };
  }
  if (clubAverage?.gpsAvgTotal) {
    return {
      yards: clubAverage.gpsAvgTotal,
      source: 'gps',
      confidence: 'low',
      sampleCount: clubAverage.sampleCount,
    };
  }
  return null;
}

export function buildEffectiveClubDistanceMap(
  manualDistances?: Record<string, number> | null,
  clubAverages?: Record<string, ClubAverageRecord> | null
): Record<string, number> {
  const manual = normalizeManualDistances(manualDistances);
  const keys = new Set([...Object.keys(manual), ...Object.keys(clubAverages || {})]);
  const entries: Array<[string, number]> = [];
  keys.forEach((key) => {
    const display = getClubDisplayDistance(clubAverages?.[key], manual[key] ?? null);
    if (display) entries.push([formatClubLabel(key), display.yards]);
  });
  return Object.fromEntries(entries);
}

export function getActiveBagClubs(profile?: UserProfile | null): string[] {
  if (!profile?.bag) return [];
  const clubs: string[] = [];
  if (profile.bag.driver) clubs.push('Driver');
  clubs.push(...(profile.bag.woods || []));
  clubs.push(...(profile.bag.hybrids || []));
  clubs.push(...(profile.bag.irons || []));
  clubs.push(...(profile.bag.wedges || []));
  return clubs.filter((club) => normalizeClubKey(club) !== 'putter');
}

/** Full bag club names for Apple Watch picker (active bag + Putter when enabled in profile). */
export function getWatchClubNamesForBridge(profile?: UserProfile | null): string[] {
  const clubs = getActiveBagClubs(profile);
  if (profile?.bag?.putter) {
    return [...clubs, 'Putter'];
  }
  return clubs;
}

export function getBestClubForPar3(
  gpsDistanceYards: number | null | undefined,
  activeBag: string[],
  clubAverages?: Record<string, ClubAverageRecord> | null,
  manualDistances?: Record<string, number> | null
): SuggestedClubCandidate | null {
  if (!Number.isFinite(gpsDistanceYards)) return null;
  const manual = normalizeManualDistances(manualDistances);
  const candidates = activeBag
    .map((club) => {
      const key = normalizeClubKey(club);
      const avg = clubAverages?.[key];
      const display = getClubDisplayDistance(avg, manual[key] ?? null);
      if (!display) return null;
      const diff = Math.abs(display.yards - Number(gpsDistanceYards));
      return {
        club: formatClubLabel(club),
        displayYards: display.yards,
        diff,
        sampleCount: avg?.sampleCount || 0,
        source: display.source,
        confidence: display.confidence,
        matchQuality: diff <= 5 ? 'strong' : diff <= 15 ? 'ok' : 'gap',
      } as SuggestedClubCandidate;
    })
    .filter((entry): entry is SuggestedClubCandidate => Boolean(entry))
    .sort((left, right) => {
      if (left.diff !== right.diff) return left.diff - right.diff;
      return right.sampleCount - left.sampleCount;
    });

  const withinTolerance = candidates.filter((entry) => entry.diff <= 10);
  return withinTolerance[0] || candidates[0] || null;
}

function getShotDistanceYards(shot: GpsShotLog, nextShot: GpsShotLog): number | null {
  if (!shot.from || !nextShot.from) return null;
  return Math.round(distanceBetweenYards(shot.from.lat, shot.from.lng, nextShot.from.lat, nextShot.from.lng));
}

function getHolePar(round: SavedRound, holeNumber: number): number | null {
  const hole = (round.holes || []).find((entry) => entry.number === holeNumber);
  return typeof hole?.par === 'number' ? hole.par : null;
}

function isHoleDataComplete(round: SavedRound, holeNumber: number): boolean {
  const hole = (round.holes || []).find((entry) => entry.number === holeNumber);
  return hole?.dataComplete !== false;
}

async function updateClubAverage(
  clubKey: string,
  newShots: ClubAverageShot[],
  existing?: ClubAverageRecord | null,
  manualYards?: number | null
): Promise<ClubAverageRecord | null> {
  if (!newShots.length) return existing || null;

  const newTotal = newShots.reduce((sum, shot) => sum + shot.totalYards, 0);
  const newCarry = newShots.reduce((sum, shot) => sum + shot.carryEstimate, 0);
  const newCount = newShots.length;
  const prevCount = existing?.sampleCount || 0;
  const prevTotal = existing?.gpsAvgTotal || manualYards || 0;
  const prevCarry = existing?.gpsAvgCarry || (prevTotal ? Math.round(prevTotal * 0.93) : 0);
  const weight = prevCount >= 10 ? 0.6 : 1.0;

  const nextRecord: ClubAverageRecord = {
    club: clubKey,
    manualYards: manualYards ?? existing?.manualYards ?? null,
    gpsAvgTotal: prevCount === 0
      ? Math.round(newTotal / newCount)
      : Math.round((newTotal / newCount) * weight + prevTotal * (1 - weight)),
    gpsAvgCarry: prevCount === 0
      ? Math.round(newCarry / newCount)
      : Math.round((newCarry / newCount) * weight + prevCarry * (1 - weight)),
    sampleCount: prevCount + newCount,
    roundsTracked: (existing?.roundsTracked || 0) + 1,
    recentShots: [...(existing?.recentShots || []), ...newShots].slice(-MAX_RECENT_SHOTS),
    lastUpdated: new Date().toISOString(),
  };

  await saveClubAverage(nextRecord);
  return nextRecord;
}

export async function processRoundShotDistances(
  round: SavedRound,
  manualDistances?: Record<string, number> | null
): Promise<Record<string, ClubAverageRecord>> {
  const shots = [...(round.gpsShots || [])].sort((left, right) => {
    if (left.holeNumber !== right.holeNumber) return left.holeNumber - right.holeNumber;
    return (left.shotNumber || 0) - (right.shotNumber || 0);
  });
  if (shots.length < 2) return getClubAverages();

  const existing = await getClubAverages();
  const manual = normalizeManualDistances(manualDistances);
  const acceptedByClub = new Map<string, ClubAverageShot[]>();
  const working = { ...existing };

  for (let index = 0; index < shots.length - 1; index += 1) {
    const shot = shots[index];
    const nextShot = shots[index + 1];
    if (shot.holeNumber !== nextShot.holeNumber) continue;
    if (!isHoleDataComplete(round, shot.holeNumber)) continue;
    if (shot.playerConfirmedDistance || shot.addedRetrospectively) continue;

    const clubKey = normalizeClubKey(shot.club);
    if (!clubKey || clubKey === 'putter') continue;

    const totalYards = getShotDistanceYards(shot, nextShot);
    if (totalYards === null || totalYards <= 0) continue;

    const clubState = working[clubKey];
    const sampleCount = clubState?.sampleCount || 0;
    const currentAvg = clubState?.gpsAvgTotal || manual[clubKey] || 0;
    const holePar = getHolePar(round, shot.holeNumber);
    const qualifies = isQualifyingShot(
      {
        club: clubKey,
        lie: shot.lie,
        distanceYards: totalYards,
        isShortPar3TeeShot:
          holePar === 3 &&
          (shot.shotNumber || 0) === 1 &&
          typeof shot.actualYards === 'number' &&
          shot.actualYards <= 30,
      },
      currentAvg,
      sampleCount
    );
    if (!qualifies) continue;

    const acceptedShot: ClubAverageShot = {
      totalYards,
      carryEstimate: estimateCarry(Number(totalYards), clubKey),
      lie: shot.lie ?? null,
      hole: shot.holeNumber,
      roundId: round.id,
      date: round.date instanceof Date ? round.date.toISOString() : new Date(round.date).toISOString(),
    };

    const nextList = [...(acceptedByClub.get(clubKey) || []), acceptedShot];
    acceptedByClub.set(clubKey, nextList);
  }

  for (const [clubKey, clubShots] of acceptedByClub.entries()) {
    const updated = await updateClubAverage(clubKey, clubShots, working[clubKey], manual[clubKey] ?? null);
    if (updated) working[clubKey] = updated;
  }

  return working;
}

export function getClubAveragePromptCandidates(
  manualDistances?: Record<string, number> | null,
  clubAverages?: Record<string, ClubAverageRecord> | null
): Array<{ club: string; gpsYards: number; manualYards: number; diff: number }> {
  const manual = normalizeManualDistances(manualDistances);
  return Object.entries(clubAverages || {})
    .map(([key, average]) => {
      const manualYards = manual[key];
      if (!average?.gpsAvgTotal || !manualYards || average.sampleCount < GPS_PRIMARY_SAMPLE_COUNT) return null;
      const diff = Math.abs(average.gpsAvgTotal - manualYards);
      if (diff < 15) return null;
      return {
        club: formatClubLabel(key),
        gpsYards: average.gpsAvgTotal,
        manualYards,
        diff,
      };
    })
    .filter((entry): entry is { club: string; gpsYards: number; manualYards: number; diff: number } => Boolean(entry))
    .sort((left, right) => right.diff - left.diff);
}

export async function syncManualDistancesToGps(
  profile: UserProfile,
  clubAverages?: Record<string, ClubAverageRecord> | null
): Promise<UserProfile> {
  const next = { ...(profile.clubDistances || {}) };
  Object.entries(clubAverages || {}).forEach(([key, average]) => {
    if (average?.gpsAvgTotal && average.sampleCount >= GPS_PRIMARY_SAMPLE_COUNT) {
      next[formatClubLabel(key)] = average.gpsAvgTotal;
    }
  });
  return {
    ...profile,
    clubDistances: next,
  };
}

export function isClubAveragesFeatureAvailable(): boolean {
  return Platform.OS === 'web' || Platform.OS === 'ios' || Platform.OS === 'android';
}
