import type { GpsShotLog, SavedRound } from '../types';

export type DispersionMode = 'tee' | 'approach';

export interface DispersionShot {
  lat: number;
  lng: number;
  club: string;
  lie: string;
  yards: number | null;
  roundId: string;
  shotNumber: number;
  mode: DispersionMode;
  lateralAngle?: number | null;
}

export interface BuildHoleDispersionArgs {
  courseId?: string | null;
  courseName?: string | null;
  holeNumber: number;
  mode: DispersionMode;
  teeCoords?: { lat: number; lng: number } | null;
  greenCoords?: { lat: number; lng: number } | null;
}

function isValidCoord(value: unknown): value is { lat: number; lng: number } {
  return Boolean(
    value
    && typeof value === 'object'
    && Number.isFinite((value as { lat?: number }).lat)
    && Number.isFinite((value as { lng?: number }).lng)
  );
}

function getShotPoint(shot: GpsShotLog): { lat: number; lng: number } | null {
  if (isValidCoord(shot.from)) return shot.from;
  if (isValidCoord(shot.to)) return shot.to;
  return null;
}

function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const toDeg = (value: number) => (value * 180) / Math.PI;
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2))
    - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return ((toDeg(Math.atan2(y, x)) % 360) + 360) % 360;
}

function normalizeSignedAngle(value: number): number {
  return ((value + 540) % 360) - 180;
}

export function analyzeShot(
  teeCoords: { lat: number; lng: number } | null | undefined,
  shotTo: { lat: number; lng: number } | null | undefined,
  greenCoords: { lat: number; lng: number } | null | undefined,
) {
  if (!teeCoords || !shotTo || !greenCoords) return null;
  const targetBearing = bearingDeg(teeCoords.lat, teeCoords.lng, greenCoords.lat, greenCoords.lng);
  const actualBearing = bearingDeg(teeCoords.lat, teeCoords.lng, shotTo.lat, shotTo.lng);
  return {
    lateralAngle: normalizeSignedAngle(actualBearing - targetBearing),
  };
}

function normalizeLie(lie: string | null | undefined): string {
  return String(lie || '').trim().toLowerCase();
}

function buildShotRecord(round: SavedRound, shot: GpsShotLog, mode: DispersionMode): DispersionShot | null {
  const point = getShotPoint(shot);
  if (!point) return null;
  return {
    lat: point.lat,
    lng: point.lng,
    club: String(shot.club || '').trim(),
    lie: String(shot.lie || 'Unknown'),
    yards: Number.isFinite(shot.playingYards as number)
      ? Number(shot.playingYards)
      : Number.isFinite(shot.actualYards as number)
        ? Number(shot.actualYards)
        : null,
    roundId: String(round.id || ''),
    shotNumber: Number(shot.shotNumber || 0),
    mode,
    lateralAngle: null,
  };
}

function pickApproachShot(holeShots: GpsShotLog[]): GpsShotLog | null {
  if (!holeShots.length) return null;
  const greenIndex = holeShots.findIndex((shot) => normalizeLie(shot.lie) === 'green');
  if (greenIndex > 0) return holeShots[greenIndex - 1] || null;
  if (greenIndex === 0) return holeShots[0] || null;
  return holeShots[holeShots.length - 1] || null;
}

export function buildHoleDispersion(rounds: SavedRound[], args: BuildHoleDispersionArgs): DispersionShot[] | null {
  const holeNumber = Number(args.holeNumber);
  if (!Number.isFinite(holeNumber)) return null;

  const dots: DispersionShot[] = [];

  for (const round of rounds || []) {
    if (args.courseId && round.courseId && round.courseId !== args.courseId) continue;
    if (!args.courseId && args.courseName && round.courseName && round.courseName !== args.courseName) continue;

    const holeShots = (round.gpsShots || [])
      .filter((shot) => Number(shot.holeNumber) === holeNumber)
      .filter((shot) => getShotPoint(shot))
      .sort((a, b) => (Number(a.shotNumber || 0) - Number(b.shotNumber || 0)) || String(a.loggedAt || '').localeCompare(String(b.loggedAt || '')));

    if (!holeShots.length) continue;

    if (args.mode === 'tee') {
      const teeShot = holeShots.find((shot) => Number(shot.shotNumber || 0) === 1) || holeShots[0] || null;
      const record = teeShot ? buildShotRecord(round, teeShot, args.mode) : null;
      if (record && args.teeCoords && args.greenCoords && isValidCoord(teeShot?.to)) {
        const analysis = analyzeShot(args.teeCoords, teeShot?.to, args.greenCoords);
        record.lateralAngle = analysis?.lateralAngle ?? null;
      }
      if (record) dots.push(record);
      continue;
    }

    const approachShot = pickApproachShot(holeShots);
    const record = approachShot ? buildShotRecord(round, approachShot, args.mode) : null;
    if (record && args.teeCoords && args.greenCoords && isValidCoord(approachShot?.to)) {
      const analysis = analyzeShot(args.teeCoords, approachShot?.to, args.greenCoords);
      record.lateralAngle = analysis?.lateralAngle ?? null;
    }
    if (record) dots.push(record);
  }

  return dots.length >= 2 ? dots : null;
}

export function getDispersionMode(currentHoleShotsCount: number): DispersionMode {
  return currentHoleShotsCount > 0 ? 'approach' : 'tee';
}

export function dispersionLieColor(lie: string): string {
  const normalized = String(lie || '').trim().toLowerCase();
  if (normalized === 'fairway') return '#1ac855';
  if (normalized === 'left rough' || normalized === 'right rough') return '#facc15';
  if (normalized === 'sand') return '#fb923c';
  if (normalized === 'green') return '#38bdf8';
  if (normalized === 'tee box') return '#60a5fa';
  if (normalized === 'water') return '#60a5fa';
  return '#f87171';
}

export function buildLiveDispersionInsight(shots: DispersionShot[], mode: DispersionMode): string {
  const count = shots.length;
  if (count < 2) return '';

  const fairwayCount = shots.filter((shot) => normalizeLie(shot.lie) === 'fairway').length;
  const greenCount = shots.filter((shot) => normalizeLie(shot.lie) === 'green').length;
  const fairwayPct = Math.round((fairwayCount / count) * 100);
  const greenPct = Math.round((greenCount / count) * 100);
  const angleSamples = shots.map((shot) => shot.lateralAngle).filter((value): value is number => Number.isFinite(value));
  const avgAngle = angleSamples.length
    ? angleSamples.reduce((sum, value) => sum + value, 0) / angleSamples.length
    : 0;
  const variance = angleSamples.length
    ? angleSamples.reduce((sum, value) => sum + ((value - avgAngle) ** 2), 0) / angleSamples.length
    : 0;
  const stdDev = Math.sqrt(variance);
  const isConsistent = stdDev < 15;
  const missSide = avgAngle < -3 ? 'left' : avgAngle > 3 ? 'right' : 'center';
  const isSevere = Math.abs(avgAngle) > 8;

  if (mode === 'tee') {
    if (fairwayPct >= 70) {
      return `You find this fairway ${fairwayPct}% of the time. Trust the line and swing.`;
    }
    if (isConsistent && isSevere && missSide === 'left') {
      return `Your miss here is left. Tee it up on the left side of the box. That opens the right half of the fairway.`;
    }
    if (isConsistent && isSevere && missSide === 'right') {
      return `You've been leaking it right here. Tee it up on the right side and use the left center of the fairway.`;
    }
    if (isConsistent && !isSevere && missSide === 'left') {
      return `Slight miss left here. Use the left side of the box and take the right center of the fairway.`;
    }
    if (isConsistent && !isSevere && missSide === 'right') {
      return `Small drift right here. Set up on the right side of the box and keep the left half open.`;
    }
    if (!isConsistent && fairwayPct < 45) {
      return `The misses are scattered here. Pick the club you control best and take the trouble out.`;
    }
    if (fairwayPct < 40) {
      return `Only ${fairwayPct}% fairways here. Take the safer club and keep the big miss out.`;
    }
    return `${count} rounds here. Pick your line and commit.`;
  }

  if (greenPct >= 60) {
    return `You hit this green ${greenPct}% of the time. Trust the middle and make your par.`;
  }
  if (isConsistent && isSevere && missSide === 'left') {
    return `Your approach miss is left. Favor the right half of the green and keep the big number off the card.`;
  }
  if (isConsistent && isSevere && missSide === 'right') {
    return `You've been leaking approaches right. Use the left half of the green and take the safer side.`;
  }
  if (!isConsistent && greenPct < 45) {
    return `The approach pattern is scattered here. Take the safer shot and lean on the putter.`;
  }
  if (greenPct < 40) {
    return `Only ${greenPct}% greens here. Keep the miss short and safe.`;
  }
  return `${count} rounds here. Middle of the green is the play.`;
}
