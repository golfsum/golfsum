import { MAPBOX_PUBLIC_TOKEN } from '../config/mapbox';
import { getCourseDetail } from '../services/golfApiIoService';
import type { GpsShotLog, PendingGpsRoundData } from '../types';

type PoiLike = { POI?: string; Location?: string; Longitude?: number; Latitude?: number };

export type HoleWithPois = { hole?: number; number?: number; pois?: PoiLike[] };

export function findPoi(hole: HoleWithPois | null | undefined, poi: string, location?: string) {
  return (hole?.pois || []).find((p) => p?.POI === poi && (!location || p?.Location === location));
}

/** Tee center POI — matches GpsRoundScreen finish payload. */
export function teePoiFromHole(hole: HoleWithPois | null | undefined): PoiLike | null | undefined {
  return findPoi(hole, 'Tee Back', 'C') || findPoi(hole, 'Tee', 'C') || findPoi(hole, 'Tee Front', 'C');
}

export function greenPoiFromHole(hole: HoleWithPois | null | undefined): PoiLike | null | undefined {
  return findPoi(hole, 'Green', 'C');
}

/**
 * Mapbox static image URL for one hole (satellite + shot pins + path). Used when saving GPS rounds
 * and stored on SavedRound.holeMapUrls — history/review must use these URLs only (no live rebuild).
 */
export function buildStaticHoleMapUrl({
  shots,
  teePoi,
  greenPoi,
  width = 700,
  height = 400,
}: {
  shots: GpsShotLog[] | null | undefined;
  teePoi: PoiLike | null | undefined;
  greenPoi: PoiLike | null | undefined;
  width?: number;
  height?: number;
}): string | null {
  if (!MAPBOX_PUBLIC_TOKEN || !teePoi || !greenPoi) return null;
  const coordinates: [number, number][] = [];
  if (Number.isFinite(teePoi.Longitude) && Number.isFinite(teePoi.Latitude)) {
    coordinates.push([Number(teePoi.Longitude), Number(teePoi.Latitude)]);
  }
  if (Number.isFinite(greenPoi.Longitude) && Number.isFinite(greenPoi.Latitude)) {
    coordinates.push([Number(greenPoi.Longitude), Number(greenPoi.Latitude)]);
  }
  (shots || []).forEach((shot) => {
    const flng = shot?.from?.lng;
    const flat = shot?.from?.lat;
    if (Number.isFinite(flng) && Number.isFinite(flat)) {
      coordinates.push([Number(flng), Number(flat)]);
    }
    const tlng = shot?.to?.lng;
    const tlat = shot?.to?.lat;
    if (Number.isFinite(tlng) && Number.isFinite(tlat)) {
      coordinates.push([Number(tlng), Number(tlat)]);
    }
  });
  if (coordinates.length === 0) return null;

  const lngs = coordinates.map(([lng]) => lng);
  const lats = coordinates.map(([, lat]) => lat);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const lngPad = Math.max((maxLng - minLng) * 0.18, 0.002);
  const latPad = Math.max((maxLat - minLat) * 0.18, 0.0015);

  const markers = (shots || [])
    .filter((shot) => Number.isFinite(shot?.from?.lng) && Number.isFinite(shot?.from?.lat))
    .map((shot, index) => {
      const color = index === 0 ? '60A5FA' : '1ac855';
      const flng = shot.from!.lng;
      const flat = shot.from!.lat;
      return `pin-s-${index + 1}+${color}(${flng},${flat})`;
    });

  const lineCoords: number[][] = [];
  for (const shot of shots || []) {
    if (Number.isFinite(shot?.from?.lng) && Number.isFinite(shot?.from?.lat)) {
      lineCoords.push([shot.from!.lng, shot.from!.lat]);
    }
  }
  if (Number.isFinite(greenPoi.Longitude) && Number.isFinite(greenPoi.Latitude)) {
    lineCoords.push([Number(greenPoi.Longitude), Number(greenPoi.Latitude)]);
  }

  const geojson = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: lineCoords,
        },
        properties: { stroke: '#1ac855', 'stroke-width': 2 },
      },
    ],
  };

  const overlayParts = [`geojson(${encodeURIComponent(JSON.stringify(geojson))})`, ...markers];
  const overlay = overlayParts.filter(Boolean).join(',');

  return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${overlay}/${[minLng - lngPad, minLat - latPad, maxLng + lngPad, maxLat + latPad].join(',')}/${width}x${height}@2x?access_token=${MAPBOX_PUBLIC_TOKEN}&attribution=false`;
}

/** One entry per hole number that has shots and resolvable tee/green POIs. */
export function buildHoleMapUrlsFromCourseHolesAndShots(
  courseHoles: HoleWithPois[],
  shots: GpsShotLog[],
): Record<number, string> {
  const byHole: Record<number, GpsShotLog[]> = {};
  for (const s of shots) {
    const h = s.holeNumber;
    if (!byHole[h]) byHole[h] = [];
    byHole[h].push(s);
  }
  const acc: Record<number, string> = {};
  for (const hole of courseHoles) {
    const num = hole.hole ?? hole.number;
    if (!num) continue;
    const holeShots = byHole[num];
    if (!holeShots?.length) continue;
    const teePoi = teePoiFromHole(hole);
    const greenPoi = greenPoiFromHole(hole);
    const url = buildStaticHoleMapUrl({ shots: holeShots, teePoi, greenPoi });
    if (url) acc[num] = url;
  }
  return acc;
}

/**
 * Per-hole Mapbox URLs saved with the round (history shows these only — no live rebuild).
 * Uses snapshots from the GPS finish payload when present; otherwise gap-fills from course POIs + shots at save time.
 */
export async function resolveHoleMapUrlsForRoundSave(
  gpsRoundData: PendingGpsRoundData | null | undefined,
  courseId: string | undefined,
): Promise<Record<number, string> | undefined> {
  if (!gpsRoundData?.gpsShots?.length) {
    return gpsRoundData?.holeMapUrls;
  }
  const existing = { ...(gpsRoundData.holeMapUrls || {}) };
  const shotHoles = new Set(gpsRoundData.gpsShots.map((s) => s.holeNumber));
  const missing = [...shotHoles].filter((h) => !existing[h]);

  let gapFill: Record<number, string> = {};
  if (missing.length && courseId) {
    try {
      const detail = await getCourseDetail(courseId);
      const holes = detail?.holesData || [];
      if (holes.length) {
        gapFill = buildHoleMapUrlsFromCourseHolesAndShots(holes as HoleWithPois[], gpsRoundData.gpsShots);
      }
    } catch {
      /* keep existing only */
    }
  }
  const merged = { ...gapFill, ...existing };
  return Object.keys(merged).length ? merged : undefined;
}
