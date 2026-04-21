import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, Animated, AppState, Modal, Platform, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { loadGpsRoundSetup } from '../services/gpsRoundSetup';
import { requestGpsPermission, watchUserPosition, classifyGpsQuality } from '../services/gps';
import { haversineYards, projectPointYards } from '../services/haversine';
import { rs } from '../utils/responsive';
import { MAPBOX_PUBLIC_TOKEN } from '../config/mapbox';
import { buildStaticHoleMapUrl, greenPoiFromHole, teePoiFromHole } from '../utils/gpsHoleMapSnapshot';
import GpsOverlay from '../components/gps/GpsOverlay';
import GpsRoundHud from '../components/gps/GpsRoundHud';
import GpsGlassChrome from '../components/gps/GpsGlassChrome';
import { getUserProfile } from '../services/userService';
import { getNativeHoleCameraConfig, getHoleBearing } from '../services/mapFraming';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { getSelectedTeeCoordinates } from '../utils/holeUtils';
import { elevationDiffToYardageAdjustment, getElevationDifferenceFeet } from '../services/weatherService';
import { endLiveActivity, isLiveActivitySupported, upsertLiveActivity } from '../services/liveActivityService';
import { getRounds } from '../services/roundsService';
import { buildInRoundNudge, buildInRoundNudgeContext } from '../services/inRoundNudgeService';
import { getSuggestion } from '../services/courseStatsService';
import {
  buildEffectiveClubDistanceMap,
  buildManualYardageDisplayMap,
  dedupeActiveBagClubs,
  formatClubLabel,
  getActiveBagClubs,
  getBestClubForPar3,
  getClubAverages,
  getClubDisplayDistance,
  getWatchClubNamesForBridge,
  lookupYardsInClubMap,
  normalizeClubKey,
} from '../services/clubDistanceService';
import { checkDistanceJump, checkShotCount, getMidpoint } from '../services/missedShotDetector';
import { buildHazardCarryModel, buildHoleStrategyModel, getPreferredLeaveYards } from '../services/holeStrategyModel';
import ReportModal from '../components/ReportModal';
import ScorecardSheet from '../components/gps/ScorecardSheet';
import HoleReviewModal from '../components/gps/HoleReviewModal';
import MissedShotNudge from '../components/gps/MissedShotNudge';
import PreSaveReview from '../components/gps/PreSaveReview';
import CoachingInsightCard from '../components/gps/CoachingInsightCard';
import ScoreEntrySheet from '../components/gps/ScoreEntrySheet';
import { isGpsDistanceSuspect, isTeeMarkerSuspect } from '../services/reportDetection';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { formatAccuracy, formatYardage, yardsToDisplay, unitSuffix } from '../utils/units';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  GPS_ABOVE_BAR,
  GPS_BAR,
  GPS_COACHING,
  GPS_MAPBOX,
  GPS_MAP_OVERLAY,
  GPS_RIGHT_STACK,
  GPS_VIEWPORT,
  GPS_Z,
  getGpsCompactToastBottom,
} from '../constants/gpsLayout';
import { loadPlan } from '../services/CoursePlanningService';
import { getCurrentUser } from '../services/firebaseAuthService';
import { buildHoleDispersion, buildLiveDispersionInsight, dispersionLieColor, getDispersionMode } from '../services/shotDispersionService';
import { deriveGreenSummary, formatPuttDistances } from '../services/greenSummaryService';
import { calculateFinalTiming, createPauseEvent } from '../services/roundTimingService';
import {
  saveGpsInProgressRound,
  clearGpsInProgressRound,
} from '../services/inProgressRoundService';
import { setWatchGpsCommandHandler, updateWatchGpsContext } from '../services/watchBridgeService';
import Storage from '../services/storage';

let MapboxGL = null;
try {
  // eslint-disable-next-line global-require
  MapboxGL = require('@rnmapbox/maps');
} catch {
  MapboxGL = null;
}

function findPoi(hole, poi, location) {
  return (hole?.pois || []).find((p) => p?.POI === poi && (!location || p?.Location === location));
}

function extractHazardFlags(hole) {
  const pois = hole?.pois || [];
  return {
    water: pois.some((p) => p.POI === 'Water'),
    fairwayBunker: pois.some((p) => p.POI === 'Fairway Bunker'),
    greenBunker: pois.some((p) => p.POI === 'Green Bunker'),
    dogleg: pois.some((p) => p.POI === 'Dogleg'),
  };
}

const LIVE_LIE_DEFAULT = {
  lie: 'Locating',
  color: null,
  showDot: false,
};

function yardageToWatchInt(yd) {
  if (typeof yd === 'number' && Number.isFinite(yd)) return Math.round(yd);
  if (yd === '--' || yd == null || yd === '') return 0;
  const n = Number(String(yd).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Live yards to a green POI. Never store `0` — `0 ?? '--'` is still `0`, which renders as three zeros everywhere. */
function liveYardsToGreenPoi(userPos, poi) {
  if (!userPos?.lat || !userPos?.lng || !poi) return '--';
  const h = haversineYards(userPos.lat, userPos.lng, poi.Latitude, poi.Longitude);
  if (h == null || !Number.isFinite(h) || h <= 0) return '--';
  return h;
}

/** When profile bag is empty, Watch still gets a usable club picker. */
const DEFAULT_WATCH_CLUBS = ['Driver', '3W', '5i', '7i', '9i', 'PW', 'SW', 'Putter'];

function coalesceYardageWithStatic(live, slot, staticY) {
  if (live !== '--') return live;
  const sc = staticY?.center;
  if (!Number.isFinite(sc) || sc <= 0) return '--';
  if (slot === 'center') return sc;
  if (slot === 'front') {
    const sf = staticY?.front;
    return sf != null && sf > 0 ? sf : sc;
  }
  const sb = staticY?.back;
  return sb != null && sb > 0 ? sb : sc;
}

function clubAbbr(club) {
  if (!club) return '?';
  const c = club.toLowerCase();
  if (c.includes('driver') || c === 'dr') return 'DR';
  if (c.includes('putter') || c === 'pt') return 'PT';
  const m = c.match(/^(\d+)\s*(wood|w|iron|i|hybrid|h|hy)$/i);
  if (m) {
    const num = m[1];
    const type = m[2].toLowerCase();
    if (type === 'wood' || type === 'w') return `${num}W`;
    if (type === 'iron' || type === 'i') return `${num}i`;
    if (type === 'hybrid' || type === 'h' || type === 'hy') return `${num}H`;
  }
  const wedge = c.match(/(pw|sw|lw|gw|aw|lob|sand|gap|pitch)/i);
  if (wedge) return wedge[1].toUpperCase().slice(0, 2);
  const degMatch = c.match(/(\d+)\s*°/);
  if (degMatch) return `${degMatch[1]}°`;
  return club.slice(0, 3).toUpperCase();
}

function yardsToMeters(yards) {
  return Number.isFinite(yards) ? yards * 0.9144 : Number.POSITIVE_INFINITY;
}

function distanceToPoiMeters(userPos, poi) {
  if (!userPos || !poi) return Number.POSITIVE_INFINITY;
  return yardsToMeters(haversineYards(userPos.lat, userPos.lng, poi.Latitude, poi.Longitude));
}

function projectMeters(origin, point) {
  const latScale = 111_320;
  const lngScale = Math.cos((origin.lat * Math.PI) / 180) * 111_320;
  return {
    x: (point.lng - origin.lng) * lngScale,
    y: (point.lat - origin.lat) * latScale,
  };
}

function getSegmentMetrics(userPos, teePoi, greenPoi) {
  if (!userPos || !teePoi || !greenPoi) return null;
  const origin = { lat: teePoi.Latitude, lng: teePoi.Longitude };
  const a = { x: 0, y: 0 };
  const b = projectMeters(origin, { lat: greenPoi.Latitude, lng: greenPoi.Longitude });
  const p = projectMeters(origin, userPos);
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const ab2 = (abx * abx) + (aby * aby);
  if (ab2 === 0) return null;
  const t = Math.max(0, Math.min(1, ((apx * abx) + (apy * aby)) / ab2));
  const proj = { x: a.x + (abx * t), y: a.y + (aby * t) };
  const dx = p.x - proj.x;
  const dy = p.y - proj.y;
  const cross = (abx * apy) - (aby * apx);
  return {
    corridorDistance: Math.sqrt((dx * dx) + (dy * dy)),
    alongTrackRatio: t,
    side: cross >= 0 ? 'Left Rough' : 'Right Rough',
  };
}

function getGreenMissMetrics(userPos, teePoi, greenFront, greenCenter, greenBack) {
  if (!userPos || !teePoi || !greenFront || !greenCenter || !greenBack) return null;
  const origin = { lat: teePoi.Latitude, lng: teePoi.Longitude };
  const front = projectMeters(origin, { lat: greenFront.Latitude, lng: greenFront.Longitude });
  const back = projectMeters(origin, { lat: greenBack.Latitude, lng: greenBack.Longitude });
  const center = projectMeters(origin, { lat: greenCenter.Latitude, lng: greenCenter.Longitude });
  const point = projectMeters(origin, userPos);
  const axis2 = (center.x * center.x) + (center.y * center.y);
  if (axis2 === 0) return null;

  const projectT = (value) => ((value.x * center.x) + (value.y * center.y)) / axis2;
  const frontT = projectT(front);
  const backT = projectT(back);
  const pointT = projectT(point);
  const proj = { x: center.x * pointT, y: center.y * pointT };
  const dx = point.x - proj.x;
  const dy = point.y - proj.y;
  const cross = (center.x * point.y) - (center.y * point.x);

  return {
    pointT,
    minT: Math.min(frontT, backT),
    maxT: Math.max(frontT, backT),
    lateralMeters: Math.sqrt((dx * dx) + (dy * dy)),
    side: cross >= 0 ? 'Left Green' : 'Right Green',
    distanceToCenterYards: haversineYards(userPos.lat, userPos.lng, greenCenter.Latitude, greenCenter.Longitude),
  };
}

function getHazardTags(hole) {
  const pois = hole?.pois || [];
  const tags = [];
  if (pois.some((poi) => poi.POI === 'Fairway Bunker')) tags.push('FW Bunker');
  if (pois.some((poi) => poi.POI === 'Green Bunker')) tags.push('Green Bunker');
  if (pois.some((poi) => poi.POI === 'Water')) tags.push('Water');
  const dogleg = pois.find((poi) => poi.POI === 'Dogleg');
  if (dogleg) {
    const side = String(dogleg.SideOfFairway || '').toUpperCase();
    tags.push(side === 'L' || side === 'R' ? `Dogleg ${side}` : 'Dogleg');
  }
  return tags;
}

function detectLiveLie(userPos, hole, teePoi, greenPoi, greenFrontPoi = null, greenBackPoi = null) {
  if (!userPos || !hole) return LIVE_LIE_DEFAULT;

  const pois = hole?.pois || [];
  const nearestPoiDistance = pois.reduce((closest, poi) => {
    const distance = distanceToPoiMeters(userPos, poi);
    return Math.min(closest, distance);
  }, Number.POSITIVE_INFINITY);
  const teePois = pois.filter((poi) => poi.POI === 'Tee Back' || poi.POI === 'Tee Middle' || poi.POI === 'Tee Front');
  const bunkerPois = pois.filter((poi) => poi.POI === 'Fairway Bunker' || poi.POI === 'Green Bunker');
  const waterPois = pois.filter((poi) => poi.POI === 'Water');
  const treePois = pois.filter((poi) => poi.POI === 'Trees');
  const metrics = getSegmentMetrics(userPos, teePoi, greenPoi);

  if (nearestPoiDistance > 220 && (!metrics || metrics.corridorDistance > 40)) {
    return { lie: 'Off Course', color: '#94A3B8', showDot: false };
  }

  if (teePois.some((poi) => distanceToPoiMeters(userPos, poi) <= 15)) {
    return { lie: 'Tee Box', color: '#60A5FA', showDot: true };
  }
  if (greenPoi && distanceToPoiMeters(userPos, greenPoi) <= 20) {
    return { lie: 'Green', color: '#34D399', showDot: true };
  }
  if (bunkerPois.some((poi) => distanceToPoiMeters(userPos, poi) <= 12)) {
    return { lie: 'Sand', color: '#FBBF24', showDot: true };
  }
  if (waterPois.some((poi) => distanceToPoiMeters(userPos, poi) <= 8)) {
    return { lie: 'Water', color: '#60A5FA', showDot: true };
  }
  if (treePois.some((poi) => distanceToPoiMeters(userPos, poi) <= 10)) {
    return { lie: 'Trees', color: '#86EFAC', showDot: true };
  }

  const greenMiss = getGreenMissMetrics(userPos, teePoi, greenFrontPoi, greenPoi, greenBackPoi);
  if (greenMiss && Number.isFinite(greenMiss.distanceToCenterYards) && greenMiss.distanceToCenterYards <= 45) {
    if (greenMiss.pointT < greenMiss.minT - 0.04) {
      return { lie: 'Short Green', color: '#FBBF24', showDot: true };
    }
    if (greenMiss.pointT > greenMiss.maxT + 0.04) {
      return { lie: 'Long Green', color: '#FBBF24', showDot: true };
    }
    if (greenMiss.lateralMeters >= 10) {
      return { lie: greenMiss.side, color: '#A3E635', showDot: true };
    }
  }

  if (metrics && metrics.alongTrackRatio >= 0 && metrics.alongTrackRatio <= 1 && metrics.corridorDistance <= 15) {
    return { lie: 'Fairway', color: '#4CAF7D', showDot: true };
  }
  if (metrics) {
    return { lie: metrics.side, color: '#A3E635', showDot: true };
  }

  return LIVE_LIE_DEFAULT;
}

const AIM_HINT_COUNT_KEY = '@GolfSum:aimModeHintCount';

function isAimSnapPoi(poi) {
  const type = String(poi?.POI || '').toLowerCase();
  return type.includes('bunker') || type.includes('water') || type.includes('hazard');
}

function getAimPoiTag(poi) {
  const type = String(poi?.POI || '').toLowerCase();
  if (type.includes('bunker')) return 'Snapped to Bunker';
  if (type.includes('water')) return 'Snapped to Water';
  if (type.includes('hazard')) return 'Snapped to Hazard';
  return 'Snapped to POI';
}

function getAimPoiLabel(poi) {
  const side = String(poi?.SideOfFairway || '').toUpperCase();
  const sideLabel = side === 'L' ? 'Left ' : side === 'R' ? 'Right ' : '';
  const raw = String(poi?.POI || '').toLowerCase();
  if (raw.includes('bunker')) return `Carry ${sideLabel}Bunker`.trim();
  if (raw.includes('water')) return `Carry ${sideLabel}Water`.trim();
  if (raw.includes('hazard')) return `Carry ${sideLabel}Hazard`.trim();
  return String(poi?.POI || 'Aim Point');
}

function normalizeTeeName(name) {
  return String(name || '').trim().toLowerCase();
}

function getTeeMarkerColor(value) {
  const tee = normalizeTeeName(value);
  if (tee.includes('black')) return '#1A1A1A';
  if (tee.includes('blue')) return '#60A5FA';
  if (tee.includes('white')) return '#FFFFFF';
  if (tee.includes('gold')) return '#F6C90E';
  if (tee.includes('yellow')) return '#FBBF24';
  if (tee.includes('red')) return '#F87171';
  return '#E5E7EB';
}

function normalizeClubLabel(label) {
  return String(label || '').trim().toLowerCase();
}

function getWindText(speed) {
  if (!Number.isFinite(speed)) return 'Wind --';
  return `${Math.round(speed)} mph`;
}

function normalizeDegrees(deg) {
  return ((deg % 360) + 360) % 360;
}

function getWindArrowRotation(degrees) {
  if (!Number.isFinite(degrees)) return '0deg';
  return `${normalizeDegrees(degrees - 180)}deg`;
}

function getRelativeWindToShot(weatherDegrees, shotBearingDeg) {
  if (!Number.isFinite(weatherDegrees) || !Number.isFinite(shotBearingDeg)) return null;
  return normalizeDegrees(weatherDegrees - shotBearingDeg);
}

function getWindArrowRotationForShot(weatherDegrees, shotBearingDeg) {
  const relativeFrom = getRelativeWindToShot(weatherDegrees, shotBearingDeg);
  if (!Number.isFinite(relativeFrom)) return '0deg';
  // Open-Meteo reports the direction the wind is coming from.
  // Our map framing keeps the target toward the top of the screen, so convert
  // the "from" angle into the on-screen "to" angle relative to the shot line.
  return `${normalizeDegrees(relativeFrom + 180)}deg`;
}

function directionDelta(a, b) {
  const delta = Math.abs(normalizeDegrees(a) - normalizeDegrees(b));
  return Math.min(delta, 360 - delta);
}

function getPlayingAdjustment(baseYards, weather, shotBearingDeg) {
  const tempAdj = Number.isFinite(weather?.tempF) ? Math.round((70 - weather.tempF) * 0.35) : 0;
  let windAdj = 0;
  if (Number.isFinite(weather?.windMph) && Number.isFinite(weather?.windDegrees) && Number.isFinite(shotBearingDeg)) {
    const windToShot = directionDelta(weather.windDegrees, shotBearingDeg);
    if (windToShot <= 45) windAdj = Math.round(weather.windMph * 0.6);
    else if (windToShot >= 135) windAdj = Math.round(weather.windMph * -0.45);
    else windAdj = Math.round(weather.windMph * 0.1);
  }
  return {
    adjustedYards: Math.max(0, Math.round(baseYards + tempAdj + windAdj)),
    tempAdj,
    windAdj,
  };
}

async function getGpsWeather(lat, lng) {
  const response = await fetchWithTimeout(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`
  );
  if (!response.ok) throw new Error(`Weather lookup failed (${response.status})`);
  const data = await response.json();
  return {
    tempF: Number(data?.current?.temperature_2m ?? NaN),
    windMph: Number(data?.current?.wind_speed_10m ?? NaN),
    windDegrees: Number(data?.current?.wind_direction_10m ?? NaN),
    humidity: Number(data?.current?.relative_humidity_2m ?? NaN),
  };
}

function toRadians(deg) {
  return deg * (Math.PI / 180);
}

function toDegrees(rad) {
  return rad * (180 / Math.PI);
}

function bearingDeg(lat1, lng1, lat2, lng2) {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const lambda = toRadians(lng2 - lng1);
  const y = Math.sin(lambda) * Math.cos(phi2);
  const x = (Math.cos(phi1) * Math.sin(phi2)) - (Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda));
  return normalizeDegrees(toDegrees(Math.atan2(y, x)));
}

function getPolylineSegments(points) {
  const segments = [];
  let totalYards = 0;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const yards = haversineYards(start.lat, start.lng, end.lat, end.lng);
    if (!Number.isFinite(yards) || yards <= 0) continue;
    segments.push({ start, end, yards });
    totalYards += yards;
  }
  return { segments, totalYards };
}

function interpolateAlongPolylineFromGreen(points, yardsFromGreen) {
  if (!Array.isArray(points) || points.length < 2 || !Number.isFinite(yardsFromGreen) || yardsFromGreen <= 0) {
    return null;
  }
  const reversed = [...points].reverse();
  const { segments, totalYards } = getPolylineSegments(reversed);
  if (!segments.length || yardsFromGreen >= totalYards) return null;

  let remaining = yardsFromGreen;
  for (const segment of segments) {
    if (remaining <= segment.yards) {
      const ratio = remaining / segment.yards;
      return interpolatePoint(segment.start, segment.end, ratio);
    }
    remaining -= segment.yards;
  }
  return null;
}

function getCenteredMarkerGroups(hole) {
  const grouped = new Map();
  (hole?.pois || []).forEach((poi) => {
    const match = String(poi?.POI || '').match(/(\d{2,3})\s*marker/i);
    const yds = match ? Number(match[1]) : NaN;
    if (!Number.isFinite(yds) || !Number.isFinite(poi?.Latitude) || !Number.isFinite(poi?.Longitude)) return;
    const key = String(yds);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(poi);
  });

  return [...grouped.entries()]
    .map(([key, pois]) => {
      const yds = Number(key);
      const centerPoi = pois.find((poi) => String(poi?.SideOfFairway || '').toUpperCase() === 'C');
      if (centerPoi) {
        return {
          yds,
          lat: centerPoi.Latitude,
          lng: centerPoi.Longitude,
        };
      }

      const leftPoi = pois.find((poi) => String(poi?.SideOfFairway || '').toUpperCase() === 'L');
      const rightPoi = pois.find((poi) => String(poi?.SideOfFairway || '').toUpperCase() === 'R');
      if (leftPoi && rightPoi) {
        return {
          yds,
          lat: (leftPoi.Latitude + rightPoi.Latitude) / 2,
          lng: (leftPoi.Longitude + rightPoi.Longitude) / 2,
        };
      }

      return {
        yds,
        lat: pois.reduce((sum, poi) => sum + poi.Latitude, 0) / pois.length,
        lng: pois.reduce((sum, poi) => sum + poi.Longitude, 0) / pois.length,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.yds - a.yds);
}

function getYardageMarkers(hole, teePoi, greenPoi, routePoints = []) {
  if (!hole || !teePoi || !greenPoi || hole.par === 3) return [];
  const colorMap = { 100: '#F87171', 150: '#FFFFFF', 250: '#60A5FA' };
  return [250, 150, 100]
    .map((yds) => {
      const point = interpolateAlongPolylineFromGreen(routePoints, yds);
      if (!point) return null;
      return {
        yds,
        color: colorMap[yds] || '#E5E7EB',
        lat: point.lat,
        lng: point.lng,
        synthetic: true,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.yds - a.yds);
}

function interpolatePoint(start, end, ratio) {
  return {
    lat: start.lat + ((end.lat - start.lat) * ratio),
    lng: start.lng + ((end.lng - start.lng) * ratio),
  };
}

function isRouteWaypointReasonable(tee, green, point) {
  const a = { x: 0, y: 0 };
  const b = projectMeters(tee, green);
  const p = projectMeters(tee, point);
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const ab2 = (abx * abx) + (aby * aby);
  if (ab2 === 0) return false;
  const t = ((apx * abx) + (apy * aby)) / ab2;
  const proj = { x: a.x + (abx * t), y: a.y + (aby * t) };
  const dx = p.x - proj.x;
  const dy = p.y - proj.y;
  const corridorDistance = Math.sqrt((dx * dx) + (dy * dy));
  return t >= 0.15 && t <= 0.9 && corridorDistance <= 45;
}

function getRoutePoints(hole, teePoi, greenPoi) {
  if (!hole || !teePoi || !greenPoi) return [];
  const tee = { lat: teePoi.Latitude, lng: teePoi.Longitude };
  const green = { lat: greenPoi.Latitude, lng: greenPoi.Longitude };
  const doglegs = (hole.pois || [])
    .filter((poi) => poi?.POI === 'Dogleg' && Number.isFinite(poi?.Latitude) && Number.isFinite(poi?.Longitude))
    .sort((a, b) => (
      haversineYards(tee.lat, tee.lng, a.Latitude, a.Longitude) -
      haversineYards(tee.lat, tee.lng, b.Latitude, b.Longitude)
    ))
    .map((poi) => ({ lat: poi.Latitude, lng: poi.Longitude, kind: 'dogleg' }));
  const routeWaypoints = doglegs.filter((point) => isRouteWaypointReasonable(tee, green, point));
  return [
    { ...tee, kind: 'tee' },
    ...routeWaypoints,
    { ...green, kind: 'green' },
  ];
}

function getRouteLabels(routePoints) {
  if (routePoints.length < 3) return [];
  const green = routePoints[routePoints.length - 1];
  return routePoints
    .slice(1, -1)
    .map((point, index) => ({
      id: `route-${index}`,
      lat: point.lat,
      lng: point.lng,
      yardsToGreen: Math.round(haversineYards(point.lat, point.lng, green.lat, green.lng)),
    }));
}

function isUserNearHole(userPos, hole) {
  if (!userPos || !hole) return false;
  const nearestPoiDistance = (hole.pois || []).reduce((closest, poi) => {
    const distance = distanceToPoiMeters(userPos, poi);
    return Math.min(closest, distance);
  }, Number.POSITIVE_INFINITY);
  return nearestPoiDistance <= 880;
}

function getHazardCarries(hole, userPos, weather, shotBearingDeg, elevationYards = 0, centerYards = null) {
  if (!hole || !userPos) return [];
  const pois = hole.pois || [];
  const candidates = [
    ['Fairway Bunker', 'F'],
    ['Green Bunker', 'F'],
    ['Water', null],
  ].map(([poiName, location]) => {
    const matching = pois.filter((poi) => poi.POI === poiName);
    if (!matching.length) return null;
    return matching.find((poi) => (location ? poi.Location === location : true)) || matching[0];
  }).filter(Boolean);

  return candidates.map((poi, index) => {
    const actual = haversineYards(userPos.lat, userPos.lng, poi.Latitude, poi.Longitude);
    const baseAdjustment = getPlayingAdjustment(actual, weather, shotBearingDeg);
    const elevAdj = Number.isFinite(elevationYards) && Number.isFinite(centerYards) && centerYards > 0
      ? Math.round(elevationYards * (actual / centerYards))
      : 0;
    return {
      id: `${poi.POI}-${poi.Latitude}-${poi.Longitude}-${index}`,
      label: poi.POI === 'Water' ? 'Water' : poi.POI === 'Green Bunker' ? 'Green Bkr' : 'FW Bkr',
      lat: poi.Latitude,
      lng: poi.Longitude,
      actual,
      adj: Math.round(actual + (baseAdjustment?.windAdj ?? 0) + (baseAdjustment?.tempAdj ?? 0) + elevAdj),
      color: poi.POI === 'Water' ? '#60A5FA' : '#FBBF24',
    };
  });
}

function getHazardPillOffsetStyle(hazard, index = 0) {
  const sideShift = hazard?.side === 'left' ? -34 : hazard?.side === 'right' ? 34 : 0;
  const rowLift = index % 2 === 1 ? -10 : 0;
  const greenLift = hazard?.kind === 'green-bunker' ? -12 : 0;
  return {
    marginLeft: sideShift,
    marginTop: -24 + rowLift + greenLift,
  };
}

function orderGreenEdgesByTee({ teePoi, centerPoi, edgeA, edgeB }) {
  if (!edgeA || !edgeB) return { front: edgeA || null, back: edgeB || null };
  const tee = teePoi
    ? { lat: teePoi.Latitude, lng: teePoi.Longitude }
    : null;
  if (tee) {
    const da = haversineYards(tee.lat, tee.lng, edgeA.Latitude, edgeA.Longitude);
    const db = haversineYards(tee.lat, tee.lng, edgeB.Latitude, edgeB.Longitude);
    if (Number.isFinite(da) && Number.isFinite(db) && da !== db) {
      return da < db ? { front: edgeA, back: edgeB } : { front: edgeB, back: edgeA };
    }
  }
  // Fallback: assume "front" is the edge closer to the green center.
  if (centerPoi) {
    const ca = haversineYards(centerPoi.Latitude, centerPoi.Longitude, edgeA.Latitude, edgeA.Longitude);
    const cb = haversineYards(centerPoi.Latitude, centerPoi.Longitude, edgeB.Latitude, edgeB.Longitude);
    if (Number.isFinite(ca) && Number.isFinite(cb) && ca !== cb) {
      return ca < cb ? { front: edgeA, back: edgeB } : { front: edgeB, back: edgeA };
    }
  }
  return { front: edgeA, back: edgeB };
}

export function GpsRoundScreen({
  courseId,
  courseName,
  teeColor = 'Blue',
  startingHole = 1,
  endingHole = 18,
  roundLength = '18',
  routeHoleNumbers = undefined,
  routeLabel = '',
  tournamentMode = false,
  onBack,
  onFinishRound,
  resumedRoundData = null,
  watchEndRoundRequest = 0,
  watchGpsCommandRequest = null,
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cached, setCached] = useState(false);
  const [course, setCourse] = useState(null);
  const [currentHoleIndex, setCurrentHoleIndex] = useState(() => (
    resumedRoundData?.currentHoleIndex != null
      ? resumedRoundData.currentHoleIndex
      : 0
  ));
  // userPos is now part of gpsState (batched with accuracy + quality)
  const [yardages, setYardages] = useState({ front: '--', center: '--', back: '--' });
  const cameraRef = useRef(null);
  const locationSubRef = useRef(null);
  const overlayRef = useRef(null);
  const frameBoundsRef = useRef(null);
  const lastMapTapRef = useRef(0);
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const lastHandledWatchEndRoundRef = useRef(0);
  const lastHandledWatchGpsCommandRef = useRef(0);
  /** Watch “end round” fires before this callback exists in source order; keep a ref. */
  const handleEndRoundPressRef = useRef(() => {});
  const watchInvokedEndRoundRef = useRef(false);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);
  const [userClubs, setUserClubs] = useState(null);
  /** Profile-entered carry distances only (picker card display). */
  const [manualClubDisplayYards, setManualClubDisplayYards] = useState({});
  const [userPlayerRating, setUserPlayerRating] = useState(null);
  const [activeBagClubs, setActiveBagClubs] = useState([]);
  const [watchClubList, setWatchClubList] = useState([]);
  const [clubAverages, setClubAverages] = useState({});
  const [liveLie, setLiveLie] = useState(LIVE_LIE_DEFAULT);
  // Batched GPS state — one setState per tick instead of three separate re-renders
  const [gpsState, setGpsState] = useState({ userPos: null, accuracyMeters: null, quality: 'good' });
  const { userPos } = gpsState;
  const gpsAccuracyMeters = gpsState.accuracyMeters;
  const gpsQuality = gpsState.quality;
  const [gpsWarmedUp, setGpsWarmedUp] = useState(false);
  const gpsWarmupTimerRef = useRef(null);
  const shotFlowActiveRef = useRef(false);
  const [distanceUnit, setDistanceUnit] = useState('yards');
  const [manualMode, setManualMode] = useState(false);
  const [manualYardage, setManualYardage] = useState('');
  const noGpsTimerRef = useRef(null);
  const [overlayState, setOverlayState] = useState({ anySheet: false, shotFlow: 'idle', selectedClub: null });
  // Keep ref in sync so GPS callback can check without re-subscribing
  useEffect(() => {
    shotFlowActiveRef.current = overlayState.shotFlow !== 'idle';
  }, [overlayState.shotFlow]);
  const [weather, setWeather] = useState(null);
  const [loggedShotsByHole, setLoggedShotsByHole] = useState(() => (
    resumedRoundData?.loggedShotsByHole && typeof resumedRoundData.loggedShotsByHole === 'object'
      ? { ...resumedRoundData.loggedShotsByHole }
      : {}
  ));
  const loggedShotsByHoleRef = useRef(loggedShotsByHole);
  useEffect(() => {
    loggedShotsByHoleRef.current = loggedShotsByHole;
  }, [loggedShotsByHole]);
  const [holeSummariesByHole, setHoleSummariesByHole] = useState(() => (
    resumedRoundData?.holeSummariesByHole && typeof resumedRoundData.holeSummariesByHole === 'object'
      ? { ...resumedRoundData.holeSummariesByHole }
      : {}
  ));
  const [lieToast, setLieToast] = useState(null);
  const [holeScoresByHole, setHoleScoresByHole] = useState(() => (
    resumedRoundData?.holeScoresByHole && typeof resumedRoundData.holeScoresByHole === 'object'
      ? { ...resumedRoundData.holeScoresByHole }
      : {}
  ));
  const [showScoreSheet, setShowScoreSheet] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showScorecard, setShowScorecard] = useState(false);
  const [reviewHole, setReviewHole] = useState(null);
  const [nudgeDismissed, setNudgeDismissed] = useState(() => new Set());
  const [flaggedHoles, setFlaggedHoles] = useState(() => new Set());
  const [historyHoleIndex, setHistoryHoleIndex] = useState(null);
  const [elevationDiffFt, setElevationDiffFt] = useState(0);
  const [liveActivityEnabled, setLiveActivityEnabled] = useState(false);
  const [coachingEnabled, setCoachingEnabled] = useState(true);
  const effectiveViewportHeight = Math.max(0, windowHeight - insets.top - insets.bottom);
  const compactLayout = effectiveViewportHeight <= GPS_VIEWPORT.COMPACT_MAX_HEIGHT;
  const toastBottom = getGpsCompactToastBottom(effectiveViewportHeight);
  const [showGreenSheet, setShowGreenSheet] = useState(false);
  const [recentRounds, setRecentRounds] = useState([]);
  const [greenMapOnly, setGreenMapOnly] = useState(false);
  const [greenTarget, setGreenTarget] = useState('center'); // 'front' | 'center' | 'back'
  const [showSuggestionModal, setShowSuggestionModal] = useState(false);
  const [suggestionTipExpanded, setSuggestionTipExpanded] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportContext, setReportContext] = useState(null);
  const [holeFlagsByHole, setHoleFlagsByHole] = useState(() => (
    resumedRoundData?.holeFlagsByHole && typeof resumedRoundData.holeFlagsByHole === 'object'
      ? { ...resumedRoundData.holeFlagsByHole }
      : {}
  ));
  const [missedShotBanner, setMissedShotBanner] = useState(null);
  const [missedShotForm, setMissedShotForm] = useState(null);
  const [holeDispersion, setHoleDispersion] = useState(null);
  const [showDispersion, setShowDispersion] = useState(false);
  const [selectedShot, setSelectedShot] = useState(null);       // shot object for action sheet
  const [showShotMenu, setShowShotMenu] = useState(false);      // action sheet visibility
  const [insertAfterShotId, setInsertAfterShotId] = useState(null); // when set, next logged shot inserts after this
  const [editingShot, setEditingShot] = useState(null);          // shot being edited (club change / move)
  const [showClubEditSheet, setShowClubEditSheet] = useState(false);
  const [reportedGpsMismatchHoles, setReportedGpsMismatchHoles] = useState(() => new Set());
  const [showPreSaveReview, setShowPreSaveReview] = useState(false);
  const [pendingRoundPayload, setPendingRoundPayload] = useState(null);
  const [flaggedForPreSave, setFlaggedForPreSave] = useState([]);
  const [coursePlan, setCoursePlan] = useState(null);
  const [showGhostOverlay, setShowGhostOverlay] = useState(true);
  const [aimMode, setAimMode] = useState(false);
  const [showAimHintBanner, setShowAimHintBanner] = useState(false);
  const aimHintTimeoutRef = useRef(null);

  const roundIdRef = useRef(resumedRoundData?.id ?? `gps-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`);
  const fullDataVersionRef = useRef(0);
  const lastSentFullDataSignatureRef = useRef('');
  const createdAtRoundRef = useRef(resumedRoundData?.createdAt ?? new Date().toISOString());
  const [timingState, setTimingState] = useState(() => {
    if (resumedRoundData?.timing) {
      return { ...resumedRoundData.timing, lastActiveAt: Date.now() };
    }
    const t = Date.now();
    return {
      roundStartedAt: t,
      lastActiveAt: t,
      playedMs: 0,
      pauseEvents: [],
      holeTimestamps: {},
    };
  });
  const [currentHolePausedMs, setCurrentHolePausedMs] = useState(0);

  const handleBackPress = useCallback(() => {
    const totalShots = Object.values(loggedShotsByHole)
      .reduce((sum, shots) => sum + shots.length, 0);
    const hasData = totalShots > 0 || Object.keys(holeSummariesByHole).length > 0;
    if (!hasData) {
      onBack?.();
      return;
    }
    Alert.alert(
      'Leave this round?',
      totalShots > 0
        ? `You have logged ${totalShots} shot${totalShots !== 1 ? 's' : ''}. Your round will not be saved.`
        : 'Your round progress will not be saved.',
      [
        { text: 'Keep playing', style: 'cancel' },
        { text: 'Leave round', style: 'destructive', onPress: () => onBack?.() },
      ]
    );
  }, [loggedShotsByHole, holeSummariesByHole, onBack]);

  const lieToastTimeoutRef = useRef(null);
  const mapHeight = Math.max(220, windowHeight + insets.top + insets.bottom);

  const holeWindow = useMemo(() => {
    if (Array.isArray(routeHoleNumbers) && routeHoleNumbers.length > 0) {
      return { startIndex: 0, endIndex: routeHoleNumbers.length - 1, custom: true };
    }
    if (roundLength === 'front9') return { startIndex: 0, endIndex: 8, custom: false };
    if (roundLength === 'back9') return { startIndex: 9, endIndex: 17, custom: false };
    return { startIndex: 0, endIndex: Math.max(0, (course?.holes?.length || 18) - 1), custom: false };
  }, [course?.holes?.length, roundLength, routeHoleNumbers]);
  const visibleHoles = useMemo(
    () => {
      const allHoles = course?.holes || [];
      if (holeWindow.custom) {
        const holeMap = new Map(allHoles.map((hole) => [Number(hole?.hole ?? hole?.number), hole]));
        return routeHoleNumbers.map((holeNumber) => holeMap.get(Number(holeNumber))).filter(Boolean);
      }
      return allHoles.slice(holeWindow.startIndex, holeWindow.endIndex + 1);
    },
    [course?.holes, holeWindow.custom, holeWindow.endIndex, holeWindow.startIndex, routeHoleNumbers]
  );
  const currentHole = visibleHoles[currentHoleIndex] || null;

  useEffect(() => {
    const hNum = visibleHoles[currentHoleIndex]?.hole ?? currentHoleIndex + 1;
    setTimingState((prev) => {
      const existing = prev.holeTimestamps[hNum];
      if (existing?.startedAt) return prev;
      return {
        ...prev,
        holeTimestamps: {
          ...prev.holeTimestamps,
          [hNum]: {
            holeNumber: hNum,
            startedAt: Date.now(),
            teeShotAt: null,
            savedAt: null,
            pausedMs: 0,
            ...existing,
          },
        },
      };
    });
    setCurrentHolePausedMs(0);
  }, [currentHoleIndex, visibleHoles]);

  // Retroactive missed shot nudge: show flagged hole at least 2 holes behind
  const nudgeHole = useMemo(() => {
    const currentNum = currentHole?.hole ?? currentHoleIndex + 1;
    const pending = [...flaggedHoles]
      .filter(h => !nudgeDismissed.has(h))
      .filter(h => h <= currentNum - 2)
      .sort((a, b) => b - a);
    if (pending.length === 0) return null;
    const holeNum = pending[0];
    const shots = loggedShotsByHole[holeNum - 1] || [];
    const holeData = visibleHoles.find(h => (h?.hole ?? h?.number) === holeNum);
    return {
      hole: holeNum,
      par: holeData?.par ?? 4,
      shotCount: shots.length,
      distanceJump: false, // TODO: wire from holeFlagsByHole
    };
  }, [flaggedHoles, nudgeDismissed, currentHole, currentHoleIndex, loggedShotsByHole, visibleHoles]);

  const selectedTee = useMemo(() => {
    const tees = Array.isArray(currentHole?.tees) ? currentHole.tees : [];
    return tees.find((tee) => normalizeTeeName(tee?.name) === normalizeTeeName(teeColor)) || tees[0] || null;
  }, [currentHole, teeColor]);
  const selectedTeeYardage = Number(selectedTee?.yards) || null;
  const teeBack = useMemo(
    () => findPoi(currentHole, 'Tee Back', 'C') || findPoi(currentHole, 'Tee Front', 'C'),
    [currentHole]
  );
  const selectedTeeMarker = useMemo(
    () => (currentHole?.par === 3 ? null : getSelectedTeeCoordinates(currentHole, selectedTee?.name || teeColor)),
    [currentHole, currentHole?.par, selectedTee?.name, teeColor]
  );
  const selectedTeePoi = useMemo(
    () => (selectedTeeMarker
      ? { Latitude: selectedTeeMarker.lat, Longitude: selectedTeeMarker.lng }
      : null),
    [selectedTeeMarker]
  );
  const currentHoleShots = loggedShotsByHole[currentHoleIndex] || [];
  const debouncedGpsRef = useRef(null);
  const [debouncedUserPos, setDebouncedUserPos] = useState(null);

  useEffect(() => {
    if (!userPos?.lat || !userPos?.lng) {
      debouncedGpsRef.current = null;
      setDebouncedUserPos(null);
      return;
    }
    const prev = debouncedGpsRef.current;
    if (!prev) {
      debouncedGpsRef.current = userPos;
      setDebouncedUserPos(userPos);
      return;
    }
    const moved = haversineYards(prev.lat, prev.lng, userPos.lat, userPos.lng);
    if (moved >= 5) {
      debouncedGpsRef.current = userPos;
      setDebouncedUserPos(userPos);
    }
  }, [userPos]);

  useEffect(() => {
    if (!userPos?.lat || !userPos?.lng) return;
    debouncedGpsRef.current = userPos;
    setDebouncedUserPos(userPos);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- snap on hole/shot only, not every GPS tick
  }, [currentHoleIndex, currentHoleShots.length]);

  const distanceMode = useMemo(() => {
    if (userNearHole && userPos) return 'live';
    if (teeBack) return gpsQuality === 'none' ? 'plan' : 'tee';
    return 'plan';
  }, [userNearHole, userPos, teeBack, gpsQuality]);

  /** Ball position for playing yardages: last logged landing (to) when available, else tee / user. */
  const yardageOrigin = useMemo(() => {
    const hasShots = currentHoleShots.length > 0;
    if (hasShots) {
      const lastShot = currentHoleShots[currentHoleShots.length - 1];
      if (lastShot?.to) return { lat: lastShot.to.lat, lng: lastShot.to.lng };
      if (lastShot?.from) return { lat: lastShot.from.lat, lng: lastShot.from.lng };
    }
    if (distanceMode === 'live' && userPos) return { lat: userPos.lat, lng: userPos.lng };
    if (teeBack) return { lat: teeBack.Latitude, lng: teeBack.Longitude };
    return userPos ? { lat: userPos.lat, lng: userPos.lng } : null;
  }, [currentHoleShots, distanceMode, gpsQuality, teeBack, userPos]);

  const lastShotFrom = useMemo(() => {
    if (currentHoleShots.length === 0) return null;
    const lastShot = currentHoleShots[currentHoleShots.length - 1];
    // Use the shot's 'from' position (where the player stood), not 'to' (which may be the green)
    if (lastShot?.from) return { lat: lastShot.from.lat, lng: lastShot.from.lng };
    return yardageOrigin;
  }, [currentHoleShots, yardageOrigin]);
  const greenCenter = useMemo(() => findPoi(currentHole, 'Green', 'C'), [currentHole]);
  const rawGreenFront = useMemo(() => findPoi(currentHole, 'Green', 'F'), [currentHole]);
  const rawGreenBack = useMemo(() => findPoi(currentHole, 'Green', 'B'), [currentHole]);
  const { greenFront, greenBack } = useMemo(() => {
    // Prefer real edge POIs; if mislabeled by API, sort by tee distance so FRT < CTR < BCK.
    const ordered = orderGreenEdgesByTee({
      teePoi: selectedTeePoi || teeBack,
      centerPoi: greenCenter,
      edgeA: rawGreenFront,
      edgeB: rawGreenBack,
    });
    let front = ordered.front;
    let back = ordered.back;

    // If missing edges entirely, fall back to a small projection around center.
    if (!front && !back && greenCenter && (selectedTeePoi || teeBack)) {
      const tee = selectedTeePoi
        ? { lat: selectedTeePoi.Latitude, lng: selectedTeePoi.Longitude }
        : { lat: teeBack.Latitude, lng: teeBack.Longitude };
      const brg = bearingDeg(tee.lat, tee.lng, greenCenter.Latitude, greenCenter.Longitude);
      const frontPt = projectPointYards(greenCenter.Latitude, greenCenter.Longitude, (brg + 180) % 360, 15);
      const backPt = projectPointYards(greenCenter.Latitude, greenCenter.Longitude, brg, 15);
      if (frontPt && backPt) {
        front = { Latitude: frontPt.lat, Longitude: frontPt.lng };
        back = { Latitude: backPt.lat, Longitude: backPt.lng };
      }
    }
    return { greenFront: front || null, greenBack: back || null };
  }, [greenCenter, rawGreenBack, rawGreenFront, selectedTeePoi, teeBack]);
  const staticWatchYardages = useMemo(() => {
    const asNum = (value) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : null;
    };
    const teeLat = asNum((selectedTeePoi || teeBack)?.Latitude);
    const teeLng = asNum((selectedTeePoi || teeBack)?.Longitude);
    const centerLat = asNum(greenCenter?.Latitude);
    const centerLng = asNum(greenCenter?.Longitude);
    if (
      teeLat != null &&
      teeLng != null &&
      centerLat != null &&
      centerLng != null
    ) {
      const center = haversineYards(teeLat, teeLng, centerLat, centerLng);
      const front = greenFront
        ? haversineYards(teeLat, teeLng, Number(greenFront.Latitude), Number(greenFront.Longitude))
        : center;
      const back = greenBack
        ? haversineYards(teeLat, teeLng, Number(greenBack.Latitude), Number(greenBack.Longitude))
        : center;
      return {
        front: Number.isFinite(front) ? Math.round(front) : null,
        center: Number.isFinite(center) ? Math.round(center) : null,
        back: Number.isFinite(back) ? Math.round(back) : null,
      };
    }
    const teeYards = Number(selectedTeeYardage) || Number(currentHole?.yardage) || null;
    if (teeYards && teeYards > 0) {
      const rounded = Math.round(teeYards);
      return { front: rounded, center: rounded, back: rounded };
    }
    return { front: null, center: null, back: null };
  }, [currentHole?.yardage, greenBack, greenCenter, greenFront, selectedTeePoi, selectedTeeYardage, teeBack]);
  const activeGreenPoi = useMemo(() => {
    if (pinCoords) return { Latitude: pinCoords.lat, Longitude: pinCoords.lng };
    if (greenTarget === 'front' && greenFront) return greenFront;
    if (greenTarget === 'back' && greenBack) return greenBack;
    return greenCenter;
  }, [pinCoords, greenTarget, greenFront, greenBack, greenCenter]);
  const shotBearingDeg = useMemo(() => {
    if (!greenCenter || !yardageOrigin) return null;
    return bearingDeg(
      yardageOrigin.lat,
      yardageOrigin.lng,
      greenCenter.Latitude,
      greenCenter.Longitude
    );
  }, [greenCenter, yardageOrigin]);

  /** Tee-to-green bearing — matches the map camera heading (green on top). */
  const holeBearing = useMemo(() => getHoleBearing(currentHole), [currentHole]);

  /** GPS anchor for club suggestion, carry risk, and hazard wind scaling (debounced; snaps on hole / shot). */
  const suggestionAnchorPos = useMemo(() => {
    if (debouncedUserPos && gpsQuality !== 'none') return debouncedUserPos;
    if (userPos && gpsQuality !== 'none') return userPos;
    return yardageOrigin;
  }, [debouncedUserPos, gpsQuality, userPos, yardageOrigin]);

  const suggestionRawYardsToGreenCenter = useMemo(() => {
    if (!suggestionAnchorPos || !greenCenter) return null;
    const y = haversineYards(
      suggestionAnchorPos.lat,
      suggestionAnchorPos.lng,
      greenCenter.Latitude,
      greenCenter.Longitude,
    );
    return Number.isFinite(y) ? y : null;
  }, [greenCenter, suggestionAnchorPos]);

  const suggestionShotBearingDeg = useMemo(() => {
    if (!greenCenter || !suggestionAnchorPos) return null;
    return bearingDeg(
      suggestionAnchorPos.lat,
      suggestionAnchorPos.lng,
      greenCenter.Latitude,
      greenCenter.Longitude,
    );
  }, [greenCenter, suggestionAnchorPos]);

  const suggestionPlayingDistance = useMemo(() => {
    if (tournamentMode || !Number.isFinite(suggestionRawYardsToGreenCenter) || suggestionShotBearingDeg == null) {
      return null;
    }
    const targetYards = Math.round(suggestionRawYardsToGreenCenter);
    const base = getPlayingAdjustment(targetYards, weather, suggestionShotBearingDeg);
    const rawElevAdj = elevationDiffToYardageAdjustment(elevationDiffFt || 0);
    const elevAdj = Math.abs(rawElevAdj) >= 5 ? rawElevAdj : 0;
    return {
      adjustedYards: Math.max(0, Math.round(targetYards + (base?.windAdj ?? 0) + (base?.tempAdj ?? 0) + elevAdj)),
      tempAdj: base?.tempAdj ?? 0,
      windAdj: base?.windAdj ?? 0,
      elevAdj,
    };
  }, [elevationDiffFt, suggestionRawYardsToGreenCenter, suggestionShotBearingDeg, tournamentMode, weather]);

  const centerYards = useMemo(() => {
    const fromPos = yardageOrigin;
    if (!fromPos || !activeGreenPoi) return null;
    const y = haversineYards(fromPos.lat, fromPos.lng, activeGreenPoi.Latitude, activeGreenPoi.Longitude);
    return Number.isFinite(y) ? Math.round(y) : null;
  }, [activeGreenPoi, yardageOrigin]);

  const targetYards = useMemo(() => {
    if (greenTarget === 'center') return centerYards;
    const fromPos = yardageOrigin;
    const targetPoi = greenTarget === 'front' ? greenFront : greenTarget === 'back' ? greenBack : activeGreenPoi;
    if (!fromPos || !targetPoi) return centerYards;
    const y = haversineYards(fromPos.lat, fromPos.lng, targetPoi.Latitude, targetPoi.Longitude);
    return Number.isFinite(y) ? Math.round(y) : centerYards;
  }, [activeGreenPoi, centerYards, greenBack, greenFront, greenTarget, yardageOrigin]);
  const playingDistance = useMemo(() => {
    if (tournamentMode || !Number.isFinite(targetYards) || !Number.isFinite(shotBearingDeg)) return null;
    const base = getPlayingAdjustment(targetYards, weather, shotBearingDeg);
    const rawElevAdj = elevationDiffToYardageAdjustment(elevationDiffFt || 0);
    const elevAdj = Math.abs(rawElevAdj) >= 5 ? rawElevAdj : 0;
    return {
      adjustedYards: Math.max(0, Math.round(targetYards + (base?.windAdj ?? 0) + (base?.tempAdj ?? 0) + elevAdj)),
      tempAdj: base?.tempAdj ?? 0,
      windAdj: base?.windAdj ?? 0,
      elevAdj,
    };
  }, [targetYards, elevationDiffFt, shotBearingDeg, tournamentMode, weather]);
  const weatherIcon = useMemo(() => {
    if (tournamentMode || !Number.isFinite(weather?.windMph) || weather.windMph <= 0.5) return null;
    // Use holeBearing (tee-to-green) so the arrow aligns with the green-on-top map orientation,
    // not shotBearingDeg which shifts when the player moves mid-hole.
    const bearing = Number.isFinite(holeBearing) && holeBearing !== 0 ? holeBearing : shotBearingDeg;
    const rotation = getWindArrowRotationForShot(weather?.windDegrees, bearing);
    return (
      <Ionicons
        name="navigate"
        size={12}
        color="#fff"
        style={{ transform: [{ rotate: rotation }] }}
      />
    );
  }, [holeBearing, shotBearingDeg, tournamentMode, weather?.windDegrees, weather?.windMph]);
  const distanceSuggestedClub = useMemo(
    () => getBestClubForPar3(
      tournamentMode
        ? (Number.isFinite(suggestionRawYardsToGreenCenter) ? Math.round(suggestionRawYardsToGreenCenter) : null)
        : suggestionPlayingDistance?.adjustedYards,
      activeBagClubs,
      clubAverages,
      userClubs,
    ),
    [activeBagClubs, clubAverages, suggestionPlayingDistance?.adjustedYards, suggestionRawYardsToGreenCenter, tournamentMode, userClubs],
  );
  const dispersionMode = useMemo(
    () => getDispersionMode(currentHoleShots.length),
    [currentHoleShots.length]
  );

  // Build scorecard holes array from live round state
  const scorecardHoles = useMemo(() => {
    return visibleHoles.map((h, idx) => {
      const holeNum = h?.hole ?? h?.number ?? idx + 1;
      const shots = loggedShotsByHole[idx] || [];
      const summary = holeSummariesByHole[idx] || {};
      const derived = deriveGreenSummary(shots, summary, h?.par);
      const putts = typeof summary.putts === 'number' ? summary.putts : derived.putts;
      const hasShots = shots.length > 0;
      const hasExplicitScore = typeof summary.score === 'number' && summary.score > 0;
      const isCompleted = hasShots || hasExplicitScore;
      // If putts logged but no shots, assume 1 shot (the unlogged tee shot)
      const shotCount = hasShots ? shots.length : (putts != null ? 1 : 0);
      const penaltyStrokes = shots.reduce((sum, s) => sum + (s.penaltyStrokes || 0), 0);
      const flags = holeFlagsByHole[idx] || {};
      return {
        hole: holeNum,
        par: h?.par ?? 4,
        hcp: h?.hcp ?? h?.handicap ?? 0,
        score: isCompleted ? (summary.score ?? shotCount + (putts || 0) + penaltyStrokes) : null,
        putts: isCompleted ? (putts ?? 0) : null,
        flagged: Boolean(flags.shotCountFlagged || flags.distanceJumpFlagged || flaggedHoles.has(holeNum)),
        // Fallback to derived values so users don't need to explicitly tap
        // a "fairway hit" toggle — we infer it from the second shot's lie.
        fairwayHit: summary.fairwayHit ?? derived.fairwayHit ?? null,
        fairwayMiss: summary.fairwayMiss ?? (
          derived.fairwayHit === 'left' || derived.fairwayHit === 'right'
            ? derived.fairwayHit
            : null
        ),
        girAchieved: summary.girAchieved ?? derived.girAchieved ?? null,
      };
    });
  }, [visibleHoles, loggedShotsByHole, holeSummariesByHole, holeFlagsByHole, flaggedHoles]);

  // Build holeScores record for HoleSelectorBar pill coloring
  // Score = manual override || (shots + putts if > 0) || null
  const holeScoresForSelector = useMemo(() => {
    const result = {};
    visibleHoles.forEach((h, idx) => {
      const manual = holeScoresByHole[idx];
      const shots = (loggedShotsByHole[idx] || []).length;
      const derived = deriveGreenSummary(loggedShotsByHole[idx] || [], holeSummariesByHole[idx] || {});
      const putts = typeof holeSummariesByHole[idx]?.putts === 'number' ? holeSummariesByHole[idx].putts : (derived.putts ?? 0);
      const computed = shots + putts;
      const score = manual ?? (computed > 0 ? computed : null);
      if (score != null) {
        const holeNum = h?.hole ?? h?.number ?? idx + 1;
        result[holeNum] = { score, par: h?.par ?? 4 };
      }
    });
    return result;
  }, [visibleHoles, holeScoresByHole, loggedShotsByHole, holeSummariesByHole]);

  const loggedHoles = useMemo(
    () => Object.keys(loggedShotsByHole).map((value) => Number(value)).filter(Number.isFinite),
    [loggedShotsByHole]
  );
  const visibleLoggedHoles = useMemo(
    () => holeWindow.custom
      ? loggedHoles.filter((index) => index >= 0 && index < visibleHoles.length)
      : loggedHoles
          .filter((index) => index >= holeWindow.startIndex && index <= holeWindow.endIndex)
          .map((index) => index - holeWindow.startIndex),
    [holeWindow.custom, holeWindow.endIndex, holeWindow.startIndex, loggedHoles, visibleHoles.length]
  );
  const currentHoleSummary = holeSummariesByHole[currentHoleIndex] || { firstPuttDistance: null, pinLocation: 'middle', putts: null };
  const derivedGreenSummary = useMemo(
    () => deriveGreenSummary(currentHoleShots, currentHoleSummary),
    [currentHoleShots, currentHoleSummary]
  );
  const currentPutts = typeof currentHoleSummary.putts === 'number'
    ? currentHoleSummary.putts
    : (derivedGreenSummary.putts ?? 0);
  const currentPuttValue = typeof currentHoleSummary.putts === 'number'
    ? currentHoleSummary.putts
    : derivedGreenSummary.putts ?? null;
  const currentFirstPuttDistance = typeof currentHoleSummary.firstPuttDistance === 'number'
    ? currentHoleSummary.firstPuttDistance
    : derivedGreenSummary.firstPuttDistance;
  const currentPuttDistanceSummary = useMemo(() => {
    const chainSummary = formatPuttDistances(derivedGreenSummary.puttDistances);
    if (chainSummary) return chainSummary;
    return currentFirstPuttDistance != null ? `${currentFirstPuttDistance} ft` : null;
  }, [currentFirstPuttDistance, derivedGreenSummary.puttDistances]);
  const puttMarkerPoi = useMemo(() => {
    if (!greenFront || !greenCenter || !greenBack) return greenCenter || greenFront || greenBack || null;
    if (currentHoleSummary.pinLocation === 'front') return greenFront;
    if (currentHoleSummary.pinLocation === 'back') return greenBack;
    return greenCenter;
  }, [currentHoleSummary.pinLocation, greenBack, greenCenter, greenFront]);
  const currentRoundShots = useMemo(
    () => Object.values(loggedShotsByHole).flatMap((shots) => shots || []),
    [loggedShotsByHole]
  );
  const userNearHole = useMemo(() => isUserNearHole(userPos, currentHole), [currentHole, userPos]);
  const overlayStartPoint = useMemo(() => {
    if (currentHoleShots.length > 0 && currentHoleShots[currentHoleShots.length - 1]?.from) {
      return currentHoleShots[currentHoleShots.length - 1].from;
    }
    if (userNearHole && userPos) return userPos;
    if (teeBack) return { lat: teeBack.Latitude, lng: teeBack.Longitude };
    return userPos;
  }, [currentHoleShots, userNearHole, userPos, teeBack]);
  const isOffCourse = liveLie?.lie === 'Off Course' || !userPos
    || (Number.isFinite(yardages.center) && yardages.center > 800);
  const nudgeContext = useMemo(() => buildInRoundNudgeContext(recentRounds), [recentRounds]);
  const holeSuggestion = useMemo(() => getSuggestion(
    recentRounds,
    currentHole?.hole || currentHoleIndex + 1,
    {
      par: currentHole?.par || 4,
      holeLength: selectedTeeYardage || currentHole?.yardage || null,
      gpsDistanceYards: tournamentMode
        ? (Number.isFinite(suggestionRawYardsToGreenCenter) ? Math.round(suggestionRawYardsToGreenCenter) : centerYards)
        : suggestionPlayingDistance?.adjustedYards ?? playingDistance?.adjustedYards ?? centerYards ?? null,
      fallbackClub: distanceSuggestedClub ? {
        club: distanceSuggestedClub.club,
        yards: distanceSuggestedClub.displayYards,
        source: distanceSuggestedClub.source,
        sampleCount: distanceSuggestedClub.sampleCount,
        confidence: distanceSuggestedClub.confidence,
        matchQuality: distanceSuggestedClub.matchQuality,
      } : null,
      clubTotals: userClubs,
      playerRating: userPlayerRating,
    },
  ), [
    centerYards,
    currentHole?.hole,
    currentHole?.par,
    currentHole?.yardage,
    currentHoleIndex,
    distanceSuggestedClub,
    playingDistance?.adjustedYards,
    recentRounds,
    selectedTeeYardage,
    suggestionPlayingDistance?.adjustedYards,
    suggestionRawYardsToGreenCenter,
    tournamentMode,
    userClubs,
    userPlayerRating,
  ]);
  const clubChipSuggestion = useMemo(() => {
    if (holeSuggestion?.state && holeSuggestion.state !== 'no_history') return holeSuggestion;
    const label = distanceSuggestedClub?.club || activeBagClubs[0] || 'Club';
    return {
      state: 'no_history',
      label,
      clubMatchQuality: distanceSuggestedClub?.matchQuality ?? null,
      fallbackYards: distanceSuggestedClub?.displayYards ?? null,
      clubDistanceSource: distanceSuggestedClub?.source,
      clubDistanceSampleCount: distanceSuggestedClub?.sampleCount ?? 0,
    };
  }, [activeBagClubs, distanceSuggestedClub, holeSuggestion]);
  const preferredLeaveYards = useMemo(
    () => getPreferredLeaveYards({ holeSuggestion, bestDistanceBand: nudgeContext?.bestDistanceBand }),
    [holeSuggestion, nudgeContext]
  );
  const maxTeeShotYards = useMemo(() => {
    const values = Object.values(userClubs || {}).map((value) => Number(value)).filter((value) => Number.isFinite(value) && value > 0);
    return values.length ? Math.max(...values) : null;
  }, [userClubs]);
  const likelyTeeShotYards = useMemo(() => {
    const matchedYards = Object.entries(userClubs || {}).find(([club]) => normalizeClubLabel(club) === normalizeClubLabel(holeSuggestion?.label));
    const explicit = matchedYards ? Number(matchedYards[1]) : distanceSuggestedClub?.displayYards ?? null;
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    return maxTeeShotYards ? Math.round(maxTeeShotYards * 0.88) : null;
  }, [distanceSuggestedClub?.displayYards, holeSuggestion?.label, maxTeeShotYards, userClubs]);
  const likelyAdvanceYards = useMemo(() => {
    const values = Object.entries(userClubs || {})
      .filter(([club]) => !normalizeClubLabel(club).includes('driver'))
      .map(([, value]) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .sort((a, b) => b - a);
    return values[0] || (likelyTeeShotYards ? Math.max(150, Math.round(likelyTeeShotYards * 0.8)) : null);
  }, [likelyTeeShotYards, userClubs]);
  const holeMissSide = nudgeContext?.holeMemory?.[currentHole?.hole || currentHoleIndex + 1]?.missSide || null;
  const strategyModel = useMemo(
    () => buildHoleStrategyModel(currentHole, selectedTeePoi, greenCenter, preferredLeaveYards, {
      maxTeeShotYards,
      likelyTeeShotYards,
      likelyAdvanceYards,
      tournamentMode,
      preferredMissSide: holeMissSide,
    }),
    [currentHole, currentHole?.hole, currentHoleIndex, greenCenter, holeMissSide, likelyAdvanceYards, likelyTeeShotYards, maxTeeShotYards, preferredLeaveYards, selectedTeePoi, tournamentMode]
  );
  const routePoints = strategyModel.routePoints;
  const yardageMarkers = strategyModel.yardageMarkers;
  const routeLabels = strategyModel.routeLabels;
  const layupTarget = strategyModel.layupTarget;
  const layupTargets = strategyModel.layupTargets || [];
  const hazardCarries = useMemo(
    () => buildHazardCarryModel({
      hole: currentHole,
      userPos: suggestionAnchorPos,
      weather,
      shotBearingDeg: suggestionShotBearingDeg ?? shotBearingDeg,
      elevationYards: elevationDiffToYardageAdjustment(elevationDiffFt || 0),
      centerYards: Number.isFinite(suggestionRawYardsToGreenCenter) && suggestionRawYardsToGreenCenter > 0
        ? Math.round(suggestionRawYardsToGreenCenter)
        : centerYards,
      routePoints,
    }),
    [
      centerYards,
      currentHole,
      elevationDiffFt,
      routePoints,
      shotBearingDeg,
      suggestionAnchorPos,
      suggestionRawYardsToGreenCenter,
      suggestionShotBearingDeg,
      weather,
    ]
  );
  const teeMarkerLooksWrong = useMemo(
    () => isTeeMarkerSuspect(selectedTeeMarker, greenCenter ? { lat: greenCenter.Latitude, lng: greenCenter.Longitude } : null),
    [greenCenter, selectedTeeMarker]
  );
  const gpsDistanceLooksWrong = useMemo(
    () => isGpsDistanceSuspect(Number(yardages.center), Number(selectedTeeYardage)),
    [selectedTeeYardage, yardages.center]
  );
  const currentHoleNumber = currentHole?.hole || currentHoleIndex + 1;
  const quietReportLinks = useMemo(() => {
    const links = [];
    if (teeMarkerLooksWrong) {
      links.push({
        id: 'wrong-tee-marker',
        text: 'Tee markers look wrong? Report it.',
        onPress: () => {
          setReportContext({
            category: 'wrong_tee_marker',
            source: 'gps_round_screen',
            courseId,
            courseName,
            teeName: selectedTee?.name || teeColor,
            teeOptions: (currentHole?.tees || []).map((tee) => ({
              name: tee?.name,
              color: tee?.color || null,
            })),
            holeNumber: currentHoleNumber,
            holePar: currentHole?.par || null,
            teeYardage: selectedTeeYardage || null,
          });
          setReportModalVisible(true);
        },
      });
    }
    if (gpsDistanceLooksWrong && !reportedGpsMismatchHoles.has(currentHoleNumber)) {
      links.push({
        id: 'wrong-gps-distance',
        text: 'Distance look wrong? Report it.',
        onPress: () => {
          setReportedGpsMismatchHoles((prev) => {
            const next = new Set(prev);
            next.add(currentHoleNumber);
            return next;
          });
          setReportContext({
            category: 'wrong_gps_distance',
            source: 'gps_round_screen',
            courseId,
            courseName,
            teeName: selectedTee?.name || teeColor,
            teeOptions: (currentHole?.tees || []).map((tee) => ({
              name: tee?.name,
              color: tee?.color || null,
            })),
            holeNumber: currentHoleNumber,
            holePar: currentHole?.par || null,
            gpsDistance: Number(yardages.center),
            teeYardage: selectedTeeYardage || null,
          });
          setReportModalVisible(true);
        },
      });
    }
    return links;
  }, [courseId, courseName, currentHole?.par, currentHoleNumber, gpsDistanceLooksWrong, reportedGpsMismatchHoles, selectedTee?.name, selectedTeeYardage, teeColor, teeMarkerLooksWrong, yardages.center]);
  const effectiveSuggestedClub = useMemo(() => {
    const matchedYards = Object.entries(userClubs || {}).find(([club]) => normalizeClubLabel(club) === normalizeClubLabel(holeSuggestion?.label));
    if (holeSuggestion?.label) {
      return {
        club: holeSuggestion.label,
        yards: matchedYards ? Number(matchedYards[1]) : distanceSuggestedClub?.displayYards ?? null,
      };
    }
    return distanceSuggestedClub || null;
  }, [distanceSuggestedClub, holeSuggestion?.label, userClubs]);

  const carryRiskClubYards = useMemo(() => {
    const sel = overlayState.selectedClub;
    if (sel && userClubs) {
      const matched = Object.entries(userClubs).find(([club]) => normalizeClubLabel(club) === normalizeClubLabel(sel));
      if (matched && Number.isFinite(Number(matched[1])) && Number(matched[1]) > 0) return Number(matched[1]);
    }
    return effectiveSuggestedClub?.yards ?? distanceSuggestedClub?.displayYards ?? null;
  }, [distanceSuggestedClub?.displayYards, effectiveSuggestedClub?.yards, overlayState.selectedClub, userClubs]);

  const hazardCarriesFiltered = useMemo(() => {
    if (!hazardCarries.length) return hazardCarries;
    const cap = carryRiskClubYards;
    if (!Number.isFinite(cap) || cap <= 0) return [];
    return hazardCarries.filter((h) => {
      const carry = Number(h.carry);
      if (!Number.isFinite(carry)) return false;
      if (h.kind === 'green-bunker') {
        const ytg = h.yardsToGreen;
        if (Number.isFinite(ytg) && ytg > 120) return false;
        return Math.abs(carry - cap) <= 12;
      }
      return carry <= cap;
    });
  }, [carryRiskClubYards, hazardCarries]);

  const inlineCoachingCard = useMemo(() => {
    if (!holeSuggestion || liveLie?.lie !== 'Tee Box') return null;
    return holeSuggestion.state === 'data_backed' || holeSuggestion.state === 'tied' || holeSuggestion.state === 'building'
      ? holeSuggestion
      : null;
  }, [holeSuggestion, liveLie?.lie]);
  const activeNudge = useMemo(() => {
    if (!coachingEnabled || overlayState.anySheet || overlayState.shotFlow !== 'idle' || showGreenSheet) return null;
    return buildInRoundNudge({
      holeNumber: currentHole?.hole || currentHoleIndex + 1,
      holePar: currentHole?.par || 4,
      liveLie: liveLie?.lie || null,
      selectedClub: overlayState.selectedClub || null,
      suggestedClub: effectiveSuggestedClub?.club || null,
      centerYards,
      playingYards: playingDistance?.adjustedYards ?? null,
      tournamentMode,
      weather,
      hazardCarries: hazardCarriesFiltered,
      currentRoundShots,
      greenSummary: currentHoleSummary,
      context: nudgeContext,
    });
  }, [
    centerYards,
    currentHole?.hole,
    currentHole?.par,
    currentHoleIndex,
    currentHoleSummary,
    currentRoundShots,
    hazardCarriesFiltered,
    liveLie?.lie,
    nudgeContext,
    coachingEnabled,
    overlayState.anySheet,
    overlayState.selectedClub,
    overlayState.shotFlow,
    playingDistance?.adjustedYards,
    effectiveSuggestedClub?.club,
    tournamentMode,
    weather,
    showGreenSheet,
  ]);
  const displayNudge = useMemo(() => {
    if (!activeNudge) return null;
    if (activeNudge.type === 'tee-club') return null;
    if (inlineCoachingCard && activeNudge.title === 'Course note') return null;
    return activeNudge;
  }, [activeNudge, inlineCoachingCard]);

  const holeCoachingTipForSheets = useMemo(() => {
    if (!coachingEnabled || showGreenSheet) return null;
    const n = buildInRoundNudge({
      holeNumber: currentHole?.hole || currentHoleIndex + 1,
      holePar: currentHole?.par || 4,
      liveLie: liveLie?.lie || null,
      selectedClub: overlayState.selectedClub || null,
      suggestedClub: effectiveSuggestedClub?.club || null,
      centerYards,
      playingYards: playingDistance?.adjustedYards ?? null,
      tournamentMode,
      weather,
      hazardCarries: hazardCarriesFiltered,
      currentRoundShots,
      greenSummary: currentHoleSummary,
      context: nudgeContext,
    });
    if (!n || n.type === 'tee-club') return null;
    return n;
  }, [
    centerYards,
    coachingEnabled,
    currentHole?.hole,
    currentHole?.par,
    currentHoleIndex,
    currentHoleSummary,
    currentRoundShots,
    effectiveSuggestedClub?.club,
    hazardCarriesFiltered,
    liveLie?.lie,
    nudgeContext,
    overlayState.selectedClub,
    playingDistance?.adjustedYards,
    showGreenSheet,
    tournamentMode,
    weather,
  ]);

  const clubSheetCaddieText = useMemo(() => {
    const parts = [];
    if (holeCoachingTipForSheets?.body) parts.push(holeCoachingTipForSheets.body);
    if (holeCoachingTipForSheets?.support) parts.push(holeCoachingTipForSheets.support);
    if (parts.length) return parts.join('\n');
    if (holeSuggestion?.state && holeSuggestion.state !== 'no_history' && holeSuggestion.body) {
      return [holeSuggestion.body, holeSuggestion.support].filter(Boolean).join('\n');
    }
    return null;
  }, [holeCoachingTipForSheets, holeSuggestion]);
  // Stack height above home indicator: yardage strip + main bar + device inset.
  const coachingOverlayBottom =
    insets.bottom +
    GPS_BAR.BOTTOM_ACTION +
    GPS_BAR.YARDAGE +
    GPS_COACHING.NUDGE_GAP_ABOVE_BAR;
  const detectLieAtCoordinate = useCallback((coord) => (
    detectLiveLie(coord, currentHole, teeBack, greenCenter, greenFront, greenBack)
  ), [currentHole, greenBack, greenCenter, greenFront, teeBack]);

  const yardsUserToGreenCenterLive = useMemo(() => {
    if (!userPos?.lat || !greenCenter) return null;
    const y = haversineYards(userPos.lat, userPos.lng, greenCenter.Latitude, greenCenter.Longitude);
    return Number.isFinite(y) ? y : null;
  }, [greenCenter, userPos]);

  const showLiveShotPreviewLine = useMemo(() => {
    if (!userPos?.lat || !currentHoleShots.length) return false;
    if (!Number.isFinite(yardsUserToGreenCenterLive)) return false;
    return yardsUserToGreenCenterLive <= 500 || isUserNearHole(userPos, currentHole);
  }, [currentHole, currentHoleShots.length, userPos, yardsUserToGreenCenterLive]);

  const shotPathGeo = useMemo(() => {
    if (!MapboxGL || !currentHoleShots.length) return null;
    const shotCoords = currentHoleShots
      .map((shot) => shot.from)
      .filter((point) => point?.lng && point?.lat)
      .map((point) => [point.lng, point.lat]);
    const features = [];
    if (shotCoords.length >= 2) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: shotCoords,
        },
        properties: { kind: 'shot-track' },
      });
    }
    if (showLiveShotPreviewLine && userPos?.lng && userPos?.lat && shotCoords.length >= 1) {
      const last = shotCoords[shotCoords.length - 1];
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [last, [userPos.lng, userPos.lat]],
        },
        properties: { kind: 'shot-track-live' },
      });
    }
    if (!features.length) return null;
    return {
      type: 'FeatureCollection',
      features,
    };
  }, [currentHoleShots, showLiveShotPreviewLine, userPos]);
  const currentShotDisplay = useMemo(() => {
    const lastShot = currentHoleShots[currentHoleShots.length - 1] || null;
    const lastCompletedShot = [...currentHoleShots]
      .reverse()
      .find((shot) => Number.isFinite(shot.playingYards ?? shot.actualYards)) || null;
    if (overlayState.shotFlow === 'mark' || overlayState.shotFlow === 'edit') {
      return {
        label: overlayState.selectedClub || effectiveSuggestedClub?.club || `Shot ${currentHoleShots.length + 1}`,
        yards: tournamentMode ? centerYards : playingDistance?.adjustedYards ?? centerYards,
        lie: liveLie?.lie || null,
      };
    }
    if (lastCompletedShot) {
      return {
        label: lastCompletedShot.abbr || `Shot ${lastCompletedShot.num}`,
        yards: lastCompletedShot.playingYards ?? lastCompletedShot.actualYards ?? null,
        lie: lastCompletedShot.lie || null,
      };
    }
    if (lastShot) {
      return {
        label: lastShot.abbr || `Shot ${lastShot.num}`,
        yards: null,
        lie: lastShot.lie || null,
      };
    }
    return {
      label: `Shot ${currentHoleShots.length + 1}`,
      yards: tournamentMode ? centerYards : playingDistance?.adjustedYards ?? centerYards,
      lie: liveLie?.lie || null,
    };
  }, [centerYards, currentHoleShots, effectiveSuggestedClub?.club, liveLie?.lie, overlayState.selectedClub, overlayState.shotFlow, playingDistance?.adjustedYards, tournamentMode]);

  useEffect(() => {
    let cancelled = false;
    isLiveActivitySupported()
      .then((supported) => {
        if (!cancelled) setLiveActivityEnabled(supported);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!liveActivityEnabled || !currentHole) return;
    upsertLiveActivity({
      courseName: courseName || course?.courseName || course?.name || 'GolfSum',
      teeLabel: selectedTee?.name || teeColor || 'Tee',
      holeNumber: currentHole.hole || currentHoleIndex + 1,
      frontYards: String(yardages?.front ?? '--'),
      centerYards: String(yardages?.center ?? '--'),
      backYards: String(yardages?.back ?? '--'),
    }).catch(() => undefined);
  }, [
    course?.courseName,
    course?.name,
    courseName,
    currentHole,
    currentHoleIndex,
    liveActivityEnabled,
    selectedTee?.name,
    teeColor,
    yardages?.back,
    yardages?.center,
    yardages?.front,
  ]);

  useEffect(() => () => {
    endLiveActivity().catch(() => undefined);
  }, []);

  const userPosRef = useRef(userPos);
  const userNearHoleRef = useRef(userNearHole);
  useEffect(() => { userPosRef.current = userPos; }, [userPos]);
  useEffect(() => { userNearHoleRef.current = userNearHole; }, [userNearHole]);

  const resetHoleCamera = useCallback((includeUser) => {
    if (!MapboxGL || !currentHole || !cameraRef.current) return;
    const near = userNearHoleRef.current;
    const pos = userPosRef.current;
    const shouldInclude = (includeUser !== undefined ? includeUser : near) && near;
    const frame = getNativeHoleCameraConfig(currentHole, shouldInclude ? pos : null, { includeUser: shouldInclude });
    if (!frame) return;
    frameBoundsRef.current = frame.bounds;
    cameraRef.current?.setCamera({
      bounds: {
        ne: frame.bounds.ne,
        sw: frame.bounds.sw,
      },
      padding: frame.padding,
      heading: frame.heading,
      animationDuration: frame.animationDuration,
      animationMode: frame.animationMode,
    });
  }, [currentHole]);

  const loadCourse = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const setup = await loadGpsRoundSetup(courseId, courseName);
      setCourse(setup?.course || null);
      setCached(!!setup?.cached);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load course. Pre-download courses from Find Course for offline play.');
    } finally {
      setLoading(false);
    }
  }, [courseId, courseName]);

  useEffect(() => {
    loadCourse();
  }, [loadCourse]);

  useEffect(() => {
    if (!watchEndRoundRequest) return;
    if (watchEndRoundRequest === lastHandledWatchEndRoundRef.current) return;
    lastHandledWatchEndRoundRef.current = watchEndRoundRequest;
    // Do not call handleFinishRound directly: it requires GPS shots and appears to “do nothing”.
    watchInvokedEndRoundRef.current = true;
    handleEndRoundPressRef.current();
  }, [watchEndRoundRequest]);

  // Load course plan for ghost overlay
  useEffect(() => {
    const uid = getCurrentUser()?.uid || null;
    loadPlan(uid, courseId, teeColor)
      .then(plan => { if (plan?.holes) setCoursePlan(plan.holes); })
      .catch(() => {});
  }, [courseId, teeColor]);

  useEffect(() => {
    // `currentHoleIndex` is relative to `visibleHoles`, not absolute 1-18.
    const absolute = Math.max(1, Number(startingHole) || 1);
    const offset = holeWindow.custom ? 1 : (holeWindow.startIndex + 1);
    const next = Math.max(0, (absolute - offset));
    setCurrentHoleIndex(Math.max(0, Math.min(visibleHoles.length - 1, next)));
  }, [startingHole, courseId, holeWindow.custom, holeWindow.startIndex, visibleHoles.length]);

  useEffect(() => {
    let active = true;
    Promise.all([getUserProfile(), getClubAverages()])
      .then(([profile, averages]) => {
        if (active) {
          const av = averages || {};
          const effective = buildEffectiveClubDistanceMap(profile?.clubDistances ?? null, av);
          setClubAverages(av);
          setManualClubDisplayYards(buildManualYardageDisplayMap(profile?.clubDistances ?? null));
          const rawBag = getActiveBagClubs(profile);
          setActiveBagClubs(dedupeActiveBagClubs(rawBag, (name) => lookupYardsInClubMap(name, effective)));
          setWatchClubList(getWatchClubNamesForBridge(profile));
          setUserClubs(effective);
          setUserPlayerRating(typeof profile?.playerRating === 'number' ? profile.playerRating : null);
          setDistanceUnit(profile?.distanceUnit ?? 'yards');
        }
      })
      .catch(() => {
        if (active) {
          setClubAverages({});
          setActiveBagClubs([]);
          setWatchClubList([]);
          setUserClubs(null);
          setManualClubDisplayYards({});
          setUserPlayerRating(null);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const normalize = (v) => String(v || '').trim().toLowerCase();
    const targetId = normalize(courseId);
    const targetName = normalize(courseName);
    // Substring match on courseName handles "Haven" vs "Haven Golf Course" — the
    // seeded rounds use the full name while a live round started from the Haven
    // quick-launch uses the short name. Without this, seed-derived per-hole
    // insights never show on the live round.
    const matchesCourse = (round) => {
      const rid = normalize(round.courseId);
      const rname = normalize(round.courseName);
      if (rid && targetId && rid === targetId) return true;
      if (!rname || !targetName) return false;
      if (rname === targetName) return true;
      return rname.includes(targetName) || targetName.includes(rname);
    };
    getRounds()
      .then((rounds) => {
        if (active) {
          const matched = rounds.filter(matchesCourse).slice(0, 12);
          if (__DEV__) {
            console.log(`[GpsRound] recentRounds for course "${courseName}" (${courseId}): ${matched.length} of ${rounds.length}`);
          }
          setRecentRounds(matched);
        }
      })
      .catch(() => {
        if (active) setRecentRounds([]);
      });
    return () => {
      active = false;
    };
  }, [courseId, courseName]);

  useEffect(() => {
    setShowDispersion(false);
    setHoleDispersion(null);
  }, [currentHoleIndex]);

  useEffect(() => {
    if (!currentHole || !courseId) {
      setHoleDispersion(null);
      return;
    }

    let active = true;
    const holeNumber = currentHole?.hole || currentHoleIndex + 1;
    const roundsSource = recentRounds.length > 0 ? recentRounds : null;

    const applyRounds = (rounds) => {
      if (!active) return;
      setHoleDispersion(buildHoleDispersion(rounds, {
        courseId,
        courseName,
        holeNumber,
        mode: dispersionMode,
        teeCoords: teeBack ? { lat: teeBack.Latitude, lng: teeBack.Longitude } : null,
        greenCoords: greenCenter ? { lat: greenCenter.Latitude, lng: greenCenter.Longitude } : null,
      }));
    };

    if (roundsSource) {
      applyRounds(roundsSource);
      return () => {
        active = false;
      };
    }

    getRounds()
      .then((rounds) => applyRounds(rounds.filter((round) => round.courseId === courseId || round.courseName === courseName).slice(0, 12)))
      .catch(() => {
        if (active) setHoleDispersion(null);
      });

    return () => {
      active = false;
    };
  }, [courseId, courseName, currentHole, currentHoleIndex, dispersionMode, recentRounds]);

  useEffect(() => () => {
    if (lieToastTimeoutRef.current) clearTimeout(lieToastTimeoutRef.current);
  }, []);

  useEffect(() => () => {
    if (aimHintTimeoutRef.current) clearTimeout(aimHintTimeoutRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const weatherAnchor = teeBack
      ? { lat: teeBack.Latitude, lng: teeBack.Longitude }
      : userPos
        ? { lat: userPos.lat, lng: userPos.lng }
        : null;
    if (!weatherAnchor || tournamentMode) {
      setWeather(null);
      return undefined;
    }

    const refreshWeather = () => {
      getGpsWeather(weatherAnchor.lat, weatherAnchor.lng)
        .then((next) => {
          if (!cancelled) setWeather(next);
        })
        .catch(() => {
          if (!cancelled) setWeather(null);
        });
    };

    refreshWeather();
    const intervalId = setInterval(refreshWeather, 300000);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [currentHole?.hole, currentHoleIndex, teeBack, tournamentMode]);

  useEffect(() => {
    let cancelled = false;
    const fromPoint = userNearHole && userPos
      ? { lat: userPos.lat, lng: userPos.lng }
      : teeBack
        ? { lat: teeBack.Latitude, lng: teeBack.Longitude }
        : null;
    if (!fromPoint || !greenCenter) {
      setElevationDiffFt(0);
      return undefined;
    }
    getElevationDifferenceFeet(fromPoint.lat, fromPoint.lng, greenCenter.Latitude, greenCenter.Longitude)
      .then((next) => {
        if (!cancelled) setElevationDiffFt(next ?? 0);
      })
      .catch(() => {
        if (!cancelled) setElevationDiffFt(0);
      });
    return () => {
      cancelled = true;
    };
  }, [greenCenter, teeBack, userNearHole, userPos]);

  useEffect(() => {
    let mounted = true;
    const start = async () => {
      const granted = await requestGpsPermission();
      if (!granted) {
        setError('Location permission is required for live yardages.');
        return;
      }
      locationSubRef.current = await watchUserPosition(
        (position) => {
          if (!mounted) return;
          const acc = position.coords.accuracy;
          const accRounded = Number.isFinite(acc) ? Math.round(acc) : null;
          const quality = classifyGpsQuality(acc);

          // Freeze player position during shot flow — player is standing still
          if (shotFlowActiveRef.current) {
            setGpsState((prev) => ({ ...prev, accuracyMeters: accRounded, quality }));
          } else {
            setGpsState({
              userPos: { lat: position.coords.latitude, lng: position.coords.longitude },
              accuracyMeters: accRounded,
              quality,
            });
          }
          // Warmup: consider locked when accuracy ≤ 10m
          if (Number.isFinite(acc) && acc <= 10) {
            setGpsWarmedUp(true);
          }
        },
        () => {
          setGpsState((prev) => ({ ...prev, quality: 'none' }));
          setError('GPS signal unavailable.');
        }
      );
      // Force warm-up after 15s regardless of accuracy
      gpsWarmupTimerRef.current = setTimeout(() => setGpsWarmedUp(true), 15000);
    };

    start().catch(() => setError('Failed to start GPS.'));
    return () => {
      mounted = false;
      locationSubRef.current?.remove?.();
      if (gpsWarmupTimerRef.current) clearTimeout(gpsWarmupTimerRef.current);
    };
  }, []);

  // Foreground-only GPS: pause when backgrounded, resume on foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        locationSubRef.current?.remove?.();
        locationSubRef.current = null;
      } else if (nextState === 'active' && !locationSubRef.current) {
        try {
          locationSubRef.current = await watchUserPosition(
            (position) => {
              const acc = position.coords.accuracy;
              const accRounded = Number.isFinite(acc) ? Math.round(acc) : null;
              const quality = classifyGpsQuality(acc);
              if (shotFlowActiveRef.current) {
                setGpsState((prev) => ({ ...prev, accuracyMeters: accRounded, quality }));
              } else {
                setGpsState({
                  userPos: { lat: position.coords.latitude, lng: position.coords.longitude },
                  accuracyMeters: accRounded,
                  quality,
                });
              }
            },
            () => setGpsState((prev) => ({ ...prev, quality: 'none' })),
          );
        } catch { /* permission may have been revoked */ }
      }
    });
    return () => subscription.remove();
  }, []);

  // Auto-switch to manual mode after 15s of no GPS signal
  useEffect(() => {
    if (gpsQuality === 'none') {
      noGpsTimerRef.current = setTimeout(() => {
        setManualMode(true);
      }, 15000);
      return () => clearTimeout(noGpsTimerRef.current);
    }
    // GPS restored — exit manual mode
    if (noGpsTimerRef.current) clearTimeout(noGpsTimerRef.current);
    if (manualMode && gpsQuality !== 'none') {
      setManualMode(false);
      setManualYardage('');
    }
    return undefined;
  }, [gpsQuality, manualMode]);

  useEffect(() => {
    if (userPos) {
      setYardages({
        front: coalesceYardageWithStatic(liveYardsToGreenPoi(userPos, greenFront), 'front', staticWatchYardages),
        center: coalesceYardageWithStatic(liveYardsToGreenPoi(userPos, greenCenter), 'center', staticWatchYardages),
        back: coalesceYardageWithStatic(liveYardsToGreenPoi(userPos, greenBack), 'back', staticWatchYardages),
      });
      setLiveLie(detectLiveLie(userPos, currentHole, teeBack, greenCenter));
      return;
    }

    // No GPS fix yet (common right after opening the app): show static tee->green values.
    if (Number.isFinite(staticWatchYardages.center) && staticWatchYardages.center > 0) {
      const sc = staticWatchYardages.center;
      const sf = staticWatchYardages.front != null && staticWatchYardages.front > 0 ? staticWatchYardages.front : sc;
      const sb = staticWatchYardages.back != null && staticWatchYardages.back > 0 ? staticWatchYardages.back : sc;
      setYardages({
        front: sf,
        center: sc,
        back: sb,
      });
    } else {
      setYardages({ front: '--', center: '--', back: '--' });
    }
    setLiveLie(LIVE_LIE_DEFAULT);
  }, [currentHole, greenBack, greenCenter, greenFront, staticWatchYardages, teeBack, userPos]);

  useEffect(() => {
    resetHoleCamera(false);
    overlayRef.current?.resetOverlay?.();
    setGreenTarget('center');
  }, [currentHole, resetHoleCamera]);

  useEffect(() => {
    if (!MapboxGL || !MAPBOX_PUBLIC_TOKEN) return;
    MapboxGL.setAccessToken(MAPBOX_PUBLIC_TOKEN);
  }, []);

  const strategyGeo = useMemo(() => {
    if (!strategyModel.strategyLinePoints?.length || strategyModel.strategyLinePoints.length < 2) return null;
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: strategyModel.strategyLinePoints.map((point) => [point.lng, point.lat]),
      },
      properties: {},
    };
  }, [strategyModel]);

  // Ghost overlay: planned shot for current hole
  const ghostHolePlan = useMemo(() => {
    if (!coursePlan || !showGhostOverlay) return null;
    const holeNum = currentHole?.hole ?? currentHole?.number ?? currentHoleIndex + 1;
    return coursePlan[String(holeNum)] || null;
  }, [coursePlan, showGhostOverlay, currentHole, currentHoleIndex]);

  const ghostLineGeo = useMemo(() => {
    if (!ghostHolePlan?.markedShot || !teeBack) return null;
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [teeBack.Longitude, teeBack.Latitude],
          [ghostHolePlan.markedShot.lng, ghostHolePlan.markedShot.lat],
        ],
      },
      properties: {},
    };
  }, [ghostHolePlan, teeBack]);

  const jumpToPoi = useCallback((poi) => {
    if (!poi || !cameraRef.current) return;
    cameraRef.current?.setCamera({
      centerCoordinate: [poi.Longitude, poi.Latitude],
      zoomLevel: 17,
      animationDuration: 800,
      animationMode: 'flyTo',
    });
  }, []);

  const handleGreenViewPress = useCallback(() => {
    if (!cameraRef.current || !greenCenter) return;
    if (greenMapOnly) {
      const nextModeTarget = greenTarget === 'front' ? 'center' : greenTarget === 'center' ? 'back' : 'front';
      setGreenTarget(nextModeTarget);
      const poi =
        nextModeTarget === 'front' && greenFront
          ? greenFront
          : nextModeTarget === 'back' && greenBack
            ? greenBack
            : greenCenter;
      cameraRef.current?.setCamera({
        centerCoordinate: [poi.Longitude, poi.Latitude],
        zoomLevel: 18.5,
        animationDuration: 700,
        animationMode: 'flyTo',
      });
      return;
    }
    const poi = activeGreenPoi || greenCenter;
    cameraRef.current?.setCamera({
      centerCoordinate: [poi.Longitude, poi.Latitude],
      zoomLevel: 18.5,
      animationDuration: 700,
      animationMode: 'flyTo',
    });
    setGreenMapOnly(true);
  }, [activeGreenPoi, greenBack, greenCenter, greenFront, greenMapOnly, greenTarget]);

  const handleMapOverviewPress = useCallback(() => {
    if (!greenMapOnly) return;
    resetHoleCamera(true);
    setGreenMapOnly(false);
  }, [greenMapOnly, resetHoleCamera]);

  const [measurePin, setMeasurePin] = useState(null);
  const [pinCoords, setPinCoords] = useState(null);
  const aimSnapPois = useMemo(
    () => (currentHole?.pois || []).filter((poi) =>
      isAimSnapPoi(poi) &&
      Number.isFinite(poi?.Latitude) &&
      Number.isFinite(poi?.Longitude)
    ),
    [currentHole]
  );
  const showGreenDistancePills = useMemo(
    () => Number.isFinite(centerYards) && centerYards <= 200 && greenFront && greenCenter && greenBack,
    [centerYards, greenBack, greenCenter, greenFront]
  );

  const showAimHint = useCallback(async () => {
    try {
      const raw = await Storage.getItem(AIM_HINT_COUNT_KEY);
      const count = Number.parseInt(raw || '0', 10) || 0;
      if (count >= 3) return;
      await Storage.setItem(AIM_HINT_COUNT_KEY, String(count + 1));
      setShowAimHintBanner(true);
      if (aimHintTimeoutRef.current) clearTimeout(aimHintTimeoutRef.current);
      aimHintTimeoutRef.current = setTimeout(() => setShowAimHintBanner(false), 3200);
    } catch {
      setShowAimHintBanner(true);
      if (aimHintTimeoutRef.current) clearTimeout(aimHintTimeoutRef.current);
      aimHintTimeoutRef.current = setTimeout(() => setShowAimHintBanner(false), 3200);
    }
  }, []);

  const enterAimMode = useCallback(() => {
    setAimMode(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    void showAimHint();
  }, [showAimHint]);

  const exitAimMode = useCallback(() => {
    setAimMode(false);
    setShowAimHintBanner(false);
    if (!measurePin?.locked) {
      setMeasurePin(null);
    }
  }, [measurePin?.locked]);

  const toggleAimMode = useCallback(() => {
    if (aimMode) {
      exitAimMode();
    } else {
      enterAimMode();
    }
  }, [aimMode, enterAimMode, exitAimMode]);

  const handleMapPress = useCallback((event) => {
    const coords = event?.geometry?.coordinates;
    const tapLng = coords?.[0];
    const tapLat = coords?.[1];

    // When zoomed on green, tap moves the pin position
    if (greenMapOnly && Number.isFinite(tapLng) && Number.isFinite(tapLat) && greenCenter) {
      const distToGreen = haversineYards(tapLat, tapLng, greenCenter.Latitude, greenCenter.Longitude);
      if (distToGreen < 60) {
        setSuggestionTipExpanded(false);
        setPinCoords({ lat: tapLat, lng: tapLng });
        return;
      }
    }

    const mapMode = overlayRef.current?.getMapMode?.() || 'gps';
    if (mapMode === 'mark') {
      if (!Number.isFinite(tapLng) || !Number.isFinite(tapLat)) return;
      setMeasurePin(null);
      const handled = overlayRef.current?.handleShotMapTap?.({ latitude: tapLat, longitude: tapLng });
      if (handled) lastMapTapRef.current = Date.now();
      return;
    }
    if (mapMode !== 'gps') return;

    if (!overlayState.anySheet && overlayState.shotFlow === 'idle') {
      setSuggestionTipExpanded(false);
    }

    if (overlayState.anySheet || overlayState.shotFlow !== 'idle') return;

    if (measurePin && Number.isFinite(tapLng) && Number.isFinite(tapLat)) {
      const closeToExisting = haversineYards(tapLat, tapLng, measurePin.lat, measurePin.lng) <= 4;
      if (closeToExisting) {
        setMeasurePin(null);
        return;
      }
    }

    const now = Date.now();
    if (now - lastMapTapRef.current <= 280) {
      resetHoleCamera(true);
      setGreenMapOnly(false);
      setMeasurePin(null);
      lastMapTapRef.current = now;
      return;
    }
    lastMapTapRef.current = now;

    if (!aimMode) {
      setMeasurePin(null);
      return;
    }

    // Tap to aim: current player position → aim point, plus aim point → green.
    if (!Array.isArray(coords) || coords.length < 2 || !activeGreenPoi) {
      setMeasurePin(null);
      return;
    }
    const snappedPoi = aimSnapPois
      .map((poi) => ({
        poi,
        distance: haversineYards(tapLat, tapLng, poi.Latitude, poi.Longitude),
      }))
      .filter((entry) => Number.isFinite(entry.distance) && entry.distance <= 18)
      .sort((left, right) => left.distance - right.distance)[0]?.poi || null;

    const aimLat = snappedPoi?.Latitude ?? tapLat;
    const aimLng = snappedPoi?.Longitude ?? tapLng;
    const toGreen = Math.round(haversineYards(aimLat, aimLng, activeGreenPoi.Latitude, activeGreenPoi.Longitude));
    if (!Number.isFinite(toGreen) || toGreen > 800) {
      setMeasurePin(null);
      return;
    }
    const measureLineFrom = userPos
      ? { lat: userPos.lat, lng: userPos.lng }
      : teeBack
        ? { lat: teeBack.Latitude, lng: teeBack.Longitude }
        : null;
    const fromLabel = userPos ? 'aim point' : teeBack ? 'tee' : 'aim point';

    const rawFrom = measureLineFrom
      ? Math.round(haversineYards(measureLineFrom.lat, measureLineFrom.lng, aimLat, aimLng))
      : null;

    const fromDistance = (rawFrom != null && rawFrom >= 5 && rawFrom < 600) ? rawFrom : null;
    const targetBearing = bearingDeg(
      aimLat,
      aimLng,
      activeGreenPoi.Latitude,
      activeGreenPoi.Longitude,
    );
    const playsLike = !tournamentMode && Number.isFinite(targetBearing)
      ? getPlayingAdjustment(toGreen, weather, targetBearing).adjustedYards
      : toGreen;
    const windRotation = !tournamentMode && Number.isFinite(weather?.windMph) && weather.windMph > 0.5
      ? getWindArrowRotationForShot(weather?.windDegrees, targetBearing)
      : null;

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    setMeasurePin({
      lng: aimLng,
      lat: aimLat,
      toGreen,
      playsLike,
      fromDistance,
      fromLabel,
      measureLineFrom,
      snappedPoi,
      snappedTag: snappedPoi ? getAimPoiTag(snappedPoi) : null,
      snappedLabel: snappedPoi ? getAimPoiLabel(snappedPoi) : null,
      windRotation,
      locked: false,
    });
  }, [activeGreenPoi, aimMode, aimSnapPois, greenCenter, greenMapOnly, measurePin, overlayState.anySheet, overlayState.shotFlow, resetHoleCamera, teeBack, tournamentMode, userPos, weather]);

  useEffect(() => {
    setSuggestionTipExpanded(false);
  }, [currentHoleIndex, overlayState.selectedClub]);

  useEffect(() => {
    setAimMode(false);
    setShowAimHintBanner(false);
    setMeasurePin((prev) => (prev?.locked ? prev : null));
  }, [currentHoleIndex]);

  const handleCameraChanged = useCallback((event) => {
    overlayRef.current?.handleCameraChanged?.(event);
    // Reset green zoom state if user manually zooms out
    const zoom = event?.properties?.zoom;
    if (Number.isFinite(zoom) && zoom < 14 && greenMapOnly) {
      setGreenMapOnly(false);
    }
  }, [greenMapOnly]);

  const markHoleFlag = useCallback((holeIndex, updates) => {
    setHoleFlagsByHole((prev) => {
      const existing = prev[holeIndex] || {
        holeNumber: holeIndex + 1,
        dataComplete: true,
        flags: {},
      };
      return {
        ...prev,
        [holeIndex]: {
          ...existing,
          ...updates,
          flags: {
            ...(existing.flags || {}),
            ...(updates.flags || {}),
          },
        },
      };
    });
  }, []);

  const isReasonableShot = useCallback((coords, holeData) => {
    if (!coords || !holeData) return true;
    const greenCenter = findPoi(holeData, 'Green', 'C');
    const teeBackPoi = findPoi(holeData, 'Tee Back', 'C') || findPoi(holeData, 'Tee', 'C');
    if (!greenCenter || !teeBackPoi) return true;
    const distToGreen = haversineYards(coords.lat, coords.lng, greenCenter.Latitude, greenCenter.Longitude);
    return Number.isFinite(distToGreen) ? distToGreen < 700 : true;
  }, []);

  const commitShotToHole = useCallback((holeIndex, shotInput) => {
    const clubLabel = String(shotInput.club || '');
    const abbr = clubLabel.length <= 3
      ? clubLabel
      : clubLabel.split(/\s+/).map((part) => part[0]).join('').slice(0, 3).toUpperCase();
    const lie = shotInput.lie
      ? { lie: shotInput.lie, color: shotInput.lieColor || detectLieAtCoordinate(shotInput.from || userPos)?.color || '#FFFFFF' }
      : detectLieAtCoordinate(shotInput.from || userPos);

    setLoggedShotsByHole((prev) => {
      const existing = prev[holeIndex] || [];
      const nextFrom = shotInput.from || null;
      const prevShot = existing.length > 0 ? existing[existing.length - 1] : null;
      let updatedExisting = existing;

      if (
        prevShot?.from &&
        nextFrom &&
        !Number.isFinite(prevShot.playingYards ?? prevShot.actualYards)
      ) {
        const actualYards = haversineYards(
          prevShot.from.lat,
          prevShot.from.lng,
          nextFrom.lat,
          nextFrom.lng,
        );
        const segmentBearing = bearingDeg(
          prevShot.from.lat,
          prevShot.from.lng,
          nextFrom.lat,
          nextFrom.lng,
        );
        const playingYards = Number.isFinite(actualYards)
          ? (prevShot.weather
            ? getPlayingAdjustment(actualYards, prevShot.weather, segmentBearing).adjustedYards
            : actualYards)
          : null;

        updatedExisting = [
          ...existing.slice(0, -1),
          {
            ...prevShot,
            to: { ...nextFrom },
            actualYards,
            playingYards,
          },
        ];
      }

      return {
        ...prev,
        [holeIndex]: [
          ...updatedExisting,
          {
            id: shotInput.id
              ? String(shotInput.id)
              : `gps-shot-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
            num: updatedExisting.length + 1,
            club: clubLabel,
            abbr,
            actualYards: shotInput.actualYards,
            playingYards: shotInput.playingYards,
            from: shotInput.from || null,
            to: shotInput.to || null,
            weather: shotInput.weather || null,
            loggedAt: shotInput.loggedAt || null,
            lie: lie.lie,
            playerConfirmedDistance: Boolean(shotInput.playerConfirmedDistance),
            addedRetrospectively: Boolean(shotInput.addedRetrospectively),
            offCourseFlag: !isReasonableShot(shotInput.from || null, visibleHoles[holeIndex] || null),
            lieIcon:
              lie.lie === 'Fairway' ? 'F'
                : lie.lie === 'Sand' ? 'S'
                  : lie.lie === 'Water' ? 'W'
                    : lie.lie === 'Trees' ? 'Tr'
                      : lie.lie === 'Tee Box' ? 'T'
                        : lie.lie === 'Green' ? 'G'
                          : lie.lie === 'Left Rough' ? 'L←'
                            : lie.lie === 'Right Rough' ? 'R→'
                              : null,
            lieColor: lie.color,
            color: lie.color || '#FFFFFF',
            penalty: shotInput.penalty || null,
            penaltyStrokes: shotInput.penaltyStrokes || 0,
            shotKind: shotInput.shotKind || 'full',
          },
            ],
      };
    });
    // Success haptic the moment a shot lands on the hole — fires for
    // on-phone taps, watch-initiated Add Shot, and retrospective adds.
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setLieToast(lie);
    if (lieToastTimeoutRef.current) clearTimeout(lieToastTimeoutRef.current);
    lieToastTimeoutRef.current = setTimeout(() => setLieToast(null), 2500);
  }, [detectLieAtCoordinate, isReasonableShot, userPos, visibleHoles]);

  const handleWatchPutt = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    // Close out any dangling approach shot so its "to" point is set to the green.
    closeLastOpenShotToGreen(currentHoleIndex, greenCenter);
    // Match the native "+PUTTS" button: just increment the summary counter.
    // Do NOT also commit a putt-shaped shot — the hole score is computed as
    // `shots.length + summary.putts`, so doing both bumped the displayed score
    // by 2 per watch tap.
    setHoleSummariesByHole((prev) => {
      const cur = prev[currentHoleIndex] || {};
      const basePutts = typeof cur.putts === 'number' ? cur.putts : 0;
      return {
        ...prev,
        [currentHoleIndex]: { ...cur, putts: basePutts + 1 },
      };
    });
  }, [closeLastOpenShotToGreen, currentHoleIndex, greenCenter]);

  const insertRetrospectiveShot = useCallback((holeIndex, insertAfterNum, shotInput) => {
    setLoggedShotsByHole((prev) => {
      const existing = [...(prev[holeIndex] || [])];
      const nextShot = {
        id: `retro_${Date.now()}`,
        num: insertAfterNum + 1,
        club: shotInput.club,
        abbr: String(shotInput.club || '').length <= 3
          ? String(shotInput.club || '')
          : String(shotInput.club || '').split(/\s+/).map((part) => part[0]).join('').slice(0, 3).toUpperCase(),
        actualYards: shotInput.actualYards ?? null,
        playingYards: shotInput.playingYards ?? null,
        from: shotInput.from || null,
        to: shotInput.to || null,
        weather: shotInput.weather || null,
        loggedAt: shotInput.loggedAt || new Date().toISOString(),
        lie: shotInput.lie || null,
        lieIcon: null,
        lieColor: shotInput.lieColor || '#9CA3AF',
        color: shotInput.lieColor || '#9CA3AF',
        addedRetrospectively: true,
      };
      existing.splice(insertAfterNum, 0, nextShot);
      return {
        ...prev,
        [holeIndex]: existing.map((shot, index) => ({ ...shot, num: index + 1 })),
      };
    });
  }, []);

  const updateShotOnHole = useCallback((holeIndex, shotId, updates) => {
    setLoggedShotsByHole((prev) => ({
      ...prev,
      [holeIndex]: (prev[holeIndex] || []).map((s) =>
        s.id === shotId ? { ...s, ...updates } : s
      ),
    }));
  }, []);

  const closeLastOpenShotToGreen = useCallback((holeIndex, greenPoi, weatherOverride = weather) => {
    if (!greenPoi) return;
    setLoggedShotsByHole((prev) => {
      const existing = prev[holeIndex] || [];
      const lastShot = existing.length > 0 ? existing[existing.length - 1] : null;
      if (!lastShot?.from || Number.isFinite(lastShot.playingYards ?? lastShot.actualYards)) {
        return prev;
      }

      const greenTarget = { lat: greenPoi.Latitude, lng: greenPoi.Longitude };
      const actualYards = haversineYards(
        lastShot.from.lat,
        lastShot.from.lng,
        greenTarget.lat,
        greenTarget.lng,
      );
      const segmentBearing = bearingDeg(
        lastShot.from.lat,
        lastShot.from.lng,
        greenTarget.lat,
        greenTarget.lng,
      );
      const weatherForShot = lastShot.weather || weatherOverride || null;
      const playingYards = Number.isFinite(actualYards)
        ? (weatherForShot
          ? getPlayingAdjustment(actualYards, weatherForShot, segmentBearing).adjustedYards
          : actualYards)
        : null;

      return {
        ...prev,
        [holeIndex]: [
          ...existing.slice(0, -1),
          {
            ...lastShot,
            to: greenTarget,
            actualYards,
            playingYards,
          },
        ],
      };
    });
  }, [weather]);

  const deleteShotFromHole = useCallback((holeIndex, shotId) => {
    setLoggedShotsByHole((prev) => {
      const existing = (prev[holeIndex] || []).filter((s) => s.id !== shotId);
      return {
        ...prev,
        [holeIndex]: existing.map((s, i) => ({ ...s, num: i + 1 })),
      };
    });
  }, []);

  const handleSelectHole = useCallback((nextIndex) => {
    setMeasurePin(null);
    setPinCoords(null);
    if (nextIndex !== currentHoleIndex) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      const currentShots = loggedShotsByHole[currentHoleIndex] || [];
      const currentScore = currentHoleSummary?.putts !== null || currentShots.length > 0
        ? currentShots.length + (currentPutts || 0)
        : 0;
      const shotCountFlag = currentHole && currentScore > 0
        ? checkShotCount(
            {
              number: currentHole.hole || currentHoleIndex + 1,
              par: currentHole.par || 4,
              teeYardage: selectedTeeYardage || currentHole?.yardage || null,
            },
            currentShots.map((shot) => ({ hole: currentHole.hole || currentHoleIndex + 1, club: shot.club || shot.abbr })),
            currentScore,
          )
        : null;

      if (shotCountFlag) {
        if (missedShotBanner?.kind === 'shot_count' && missedShotBanner?.targetHoleIndex === nextIndex) {
          markHoleFlag(currentHoleIndex, {
            dataComplete: false,
            flags: { shotCountFlagged: true },
          });
        } else {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
          setMissedShotBanner({
            kind: 'shot_count',
            targetHoleIndex: nextIndex,
            holeIndex: currentHoleIndex,
            message: `Only ${shotCountFlag.fullSwingsLogged || 0} shot${(shotCountFlag.fullSwingsLogged || 0) === 1 ? '' : 's'} logged on hole ${shotCountFlag.hole}. Did you forget one?`,
          });
          return;
        }
      }
    }

    if (nextIndex !== currentHoleIndex) {
      const prevHoleNum = visibleHoles[currentHoleIndex]?.hole ?? currentHoleIndex + 1;
      setTimingState((prev) => ({
        ...prev,
        holeTimestamps: {
          ...prev.holeTimestamps,
          [prevHoleNum]: {
            ...(prev.holeTimestamps[prevHoleNum] || {
              holeNumber: prevHoleNum,
              startedAt: Date.now(),
              teeShotAt: null,
              savedAt: null,
              pausedMs: 0,
            }),
            savedAt: Date.now(),
            pausedMs: currentHolePausedMs,
          },
        },
      }));
    }

    setCurrentHoleIndex(nextIndex);
    setLiveLie(LIVE_LIE_DEFAULT);
    setShowGreenSheet(false);
    setGreenMapOnly(false);
    setOverlayState({ anySheet: false, shotFlow: 'idle', selectedClub: null });
    setMissedShotBanner(null);
    setMissedShotForm(null);
    overlayRef.current?.resetOverlay?.();
  }, [currentHole, currentHoleIndex, currentHoleSummary?.putts, currentPutts, loggedShotsByHole, markHoleFlag, missedShotBanner?.holeIndex, missedShotBanner?.kind, missedShotBanner?.targetHoleIndex, selectedTeeYardage, visibleHoles, currentHolePausedMs]);

  /** Watch Add-Shot handler: log a shot at the user's current GPS position,
   *  using the club the user picked on the watch. Don't wait for a phone map
   *  tap — the watch is the primary input here, so auto-commit instead of
   *  putting the overlay in mark mode (which required phone interaction). */
  const handleWatchAddShot = useCallback((club) => {
    const clubLabel = (club && String(club).trim()) || 'Shot';
    if (!userPos) {
      // No GPS fix yet; fall back to the overlay's mark-on-map flow so the
      // shot isn't silently lost.
      overlayRef.current?.startShotEntryFromWatch?.(clubLabel);
      return;
    }
    commitShotToHole(currentHoleIndex, {
      id: `watch-shot-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      club: clubLabel,
      from: { lat: userPos.lat, lng: userPos.lng },
      to: null,
      actualYards: null,
      playingYards: null,
      loggedAt: new Date().toISOString(),
    });
  }, [commitShotToHole, currentHoleIndex, userPos]);

  const dispatchWatchGpsCommand = useCallback((msg) => {
    const action = msg?.action;
    if (action === 'addShot') {
      const club = String(msg.club || '');
      handleWatchAddShot(club);
      return;
    }
    if (action === 'addPutt') {
      handleWatchPutt();
      return;
    }
    if (action === 'advanceHole') {
      const h = Number(msg.hole);
      if (!Number.isFinite(h)) return;
      const idx = visibleHoles.findIndex((vh) => (vh.hole ?? vh.number) === h);
      if (idx >= 0) handleSelectHole(idx);
    }
  }, [handleSelectHole, handleWatchAddShot, handleWatchPutt, visibleHoles]);

  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    setWatchGpsCommandHandler(dispatchWatchGpsCommand);
    return () => setWatchGpsCommandHandler(null);
  }, [dispatchWatchGpsCommand]);

  useEffect(() => {
    if (!watchGpsCommandRequest?.id) return;
    if (watchGpsCommandRequest.id === lastHandledWatchGpsCommandRef.current) return;
    lastHandledWatchGpsCommandRef.current = watchGpsCommandRequest.id;
    dispatchWatchGpsCommand(watchGpsCommandRequest.payload || {});
  }, [dispatchWatchGpsCommand, watchGpsCommandRequest]);

  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    const frtVal = yardageToWatchInt(yardages.front) || yardageToWatchInt(staticWatchYardages.front);
    const ctrVal = yardageToWatchInt(yardages.center) || yardageToWatchInt(staticWatchYardages.center);
    const bckVal = yardageToWatchInt(yardages.back) || yardageToWatchInt(staticWatchYardages.back);
    const currentYardage = yardageToWatchInt(
      selectedTeeYardage
        || currentHole?.yardage
        || staticWatchYardages.center
        || yardages.center
    );
    const hasRealCurrentHoleData = !!(
      currentHole
      && (
        currentYardage > 0
        || frtVal > 0
        || ctrVal > 0
        || bckVal > 0
      )
    );
    if (!hasRealCurrentHoleData) {
      console.log('[GpsRound→Watch] skip: no current-hole yardages yet (frt=%d ctr=%d bck=%d curY=%d hole=%o)',
        frtVal, ctrVal, bckVal, currentYardage, currentHole?.hole);
      return undefined;
    }
    const active = true;
    const holeNum = Math.max(
      1,
      Math.round(Number(currentHole?.hole ?? currentHoleIndex + 1)) || 1,
    );
    const fromProfile = (watchClubList || []).filter((c) => typeof c === 'string' && c.length > 0);
    const clubsForWatch = fromProfile.length > 0 ? fromProfile : DEFAULT_WATCH_CLUBS;
    const holesForWatch = (visibleHoles || [])
      .map((hole, index) => {
        const number = Math.max(1, Math.round(Number(hole?.hole ?? index + 1)) || index + 1);
        const par = Math.max(3, Math.round(Number(hole?.par ?? 4)) || 4);
        return { number, par };
      })
      .filter((hole) => Number.isFinite(hole.number) && Number.isFinite(hole.par));
    const currentPar = Math.max(3, Math.round(Number(currentHole?.par ?? 4)) || 4);
    const normalizedSelectedTee = normalizeTeeName(selectedTee?.name || teeColor);
    const payload = {
      active,
      roundActive: active,
      roundID: String(roundIdRef.current || courseId || courseName || 'gps-round'),
      roundId: String(roundIdRef.current || courseId || courseName || 'gps-round'),
      courseId: courseId || null,
      courseName: courseName || null,
      teeName: selectedTee?.name || teeColor || null,
      hole: holeNum,
      currentHole: holeNum,
      par: currentPar,
      yardage: currentYardage,
      frt: frtVal,
      ctr: ctrVal,
      bck: bckVal,
      suggestedClub: effectiveSuggestedClub?.club || null,
      coachingFocus: holeSuggestion?.oneBigFocus || holeSuggestion?.message || null,
      windMph: Number.isFinite(weather?.windMph) ? Math.round(weather.windMph) : 0,
      windDegrees: Number.isFinite(weather?.windDegrees) ? weather.windDegrees : 0,
      windArrowDegrees: (() => {
        if (!Number.isFinite(weather?.windDegrees)) return 0;
        const brg = Number.isFinite(holeBearing) && holeBearing !== 0 ? holeBearing : shotBearingDeg;
        if (!Number.isFinite(brg)) return 0;
        return normalizeDegrees(weather.windDegrees - brg + 180);
      })(),
      clubs: clubsForWatch,
      holes: holesForWatch,
      lastUpdated: Date.now(),
    };
    const fullHolePayload = (visibleHoles || []).map((hole, index) => {
      const number = Math.max(1, Math.round(Number(hole?.hole ?? index + 1)) || index + 1);
      const par = Math.max(3, Math.round(Number(hole?.par ?? 4)) || 4);
      const teesForHole = Array.isArray(hole?.tees) ? hole.tees : [];
      const teeForHole =
        teesForHole.find((tee) => normalizeTeeName(tee?.name) === normalizedSelectedTee)
        || teesForHole.find((tee) => normalizeTeeName(tee?.color) === normalizedSelectedTee)
        || teesForHole[0]
        || null;
      const poisForHole = Array.isArray(hole?.pois) ? hole.pois : [];
      const teeBackPoi = poisForHole.find((poi) => poi?.POI === 'Tee Back');
      const greenFrontPoi = poisForHole.find((poi) => poi?.POI === 'Green' && poi?.Location === 'F');
      const greenCenterPoi = poisForHole.find((poi) => poi?.POI === 'Green' && poi?.Location === 'C');
      const greenBackPoi = poisForHole.find((poi) => poi?.POI === 'Green' && poi?.Location === 'B');
      let holeCtr = yardageToWatchInt(teeForHole?.yards || hole?.yardage);
      let holeFrt = holeCtr;
      let holeBck = holeCtr;
      if (
        teeBackPoi
        && greenFrontPoi && greenCenterPoi && greenBackPoi
        && Number.isFinite(Number(teeBackPoi?.Latitude))
        && Number.isFinite(Number(teeBackPoi?.Longitude))
      ) {
        const hF = Math.round(haversineYards(Number(teeBackPoi.Latitude), Number(teeBackPoi.Longitude), Number(greenFrontPoi.Latitude), Number(greenFrontPoi.Longitude)) ?? 0);
        const hC = Math.round(haversineYards(Number(teeBackPoi.Latitude), Number(teeBackPoi.Longitude), Number(greenCenterPoi.Latitude), Number(greenCenterPoi.Longitude)) ?? 0);
        const hB = Math.round(haversineYards(Number(teeBackPoi.Latitude), Number(teeBackPoi.Longitude), Number(greenBackPoi.Latitude), Number(greenBackPoi.Longitude)) ?? 0);
        // Don't clobber scorecard fallback with zeros on partial/invalid POI data.
        if (hC > 0) {
          holeFrt = hF > 0 ? hF : holeCtr;
          holeCtr = hC;
          holeBck = hB > 0 ? hB : holeCtr;
        }
      }
      return {
        number,
        par,
        yardage: holeCtr,
        frt: holeFrt,
        ctr: holeCtr,
        bck: holeBck,
      };
    });
    const firstHoleYardage = fullHolePayload[0]?.yardage || 0;
    // Do NOT bail when hole-1 yardage is 0 — POIs may be missing for some holes
    // while the user plays others. hasRealCurrentHoleData above already guards
    // against sending an empty current-hole payload.
    const payloadWithFullData = {
      ...payload,
      holes: fullHolePayload,
      currentYardage,
      frtYards: frtVal,
      midYards: ctrVal,
      bckYards: bckVal,
    };
    const signature = JSON.stringify({
      roundID: payloadWithFullData.roundID,
      hole: payloadWithFullData.hole,
      currentYardage: payloadWithFullData.currentYardage,
      frt: payloadWithFullData.frt,
      ctr: payloadWithFullData.ctr,
      bck: payloadWithFullData.bck,
      firstHoleYardage,
      // Include clubs so a late profile-load (which updates watchClubList) triggers
      // a resend instead of being deduped out.
      clubs: clubsForWatch,
    });
    if (signature === lastSentFullDataSignatureRef.current) {
      return undefined;
    }
    lastSentFullDataSignatureRef.current = signature;
    fullDataVersionRef.current += 1;
    payloadWithFullData.fullDataVersion = fullDataVersionRef.current;
    payloadWithFullData.lastUpdated = Date.now();
    console.log(`[GpsRound→Watch] Sending FULL yardage data to Watch – version ${payloadWithFullData.fullDataVersion} – hole1 yardage = ${firstHoleYardage}`);
    console.log('[GpsRound→Watch] FULL payload', JSON.stringify(payloadWithFullData));
    updateWatchGpsContext(payloadWithFullData);
  }, [
    courseId,
    courseName,
    currentHole,
    currentHole?.hole,
    currentHole?.par,
    currentHole?.yardage,
    currentHoleIndex,
    effectiveSuggestedClub?.club,
    holeSuggestion?.message,
    holeSuggestion?.oneBigFocus,
    selectedTee?.name,
    selectedTeeYardage,
    staticWatchYardages.back,
    staticWatchYardages.center,
    staticWatchYardages.front,
    teeColor,
    visibleHoles,
    watchClubList,
    weather?.windDegrees,
    weather?.windMph,
    holeBearing,
    shotBearingDeg,
    yardages.front,
    yardages.center,
    yardages.back,
  ]);

  useEffect(() => {
    if (Platform.OS !== 'ios') return undefined;
    return () => {
      updateWatchGpsContext({
        type: 'roundEnded',
        active: false,
        roundActive: false,
        roundID: String(roundIdRef.current || courseId || courseName || 'gps-round'),
        roundId: String(roundIdRef.current || courseId || courseName || 'gps-round'),
        hole: 0,
        currentHole: 0,
        par: 0,
        yardage: 0,
        frt: 0,
        ctr: 0,
        bck: 0,
        suggestedClub: '',
        coachingFocus: '',
        windMph: 0,
        windDegrees: 0,
        clubs: [],
        holes: [],
      });
    };
  }, [courseId, courseName]);

  const handleConfirmDistanceJump = useCallback(() => {
    if (!missedShotBanner?.shot) return;
    const prevNum = missedShotBanner?.prevShot?.num;
    if (typeof prevNum === 'number') {
      setLoggedShotsByHole((prev) => ({
        ...prev,
        [currentHoleIndex]: (prev[currentHoleIndex] || []).map((entry) => (
          entry.num === prevNum ? { ...entry, playerConfirmedDistance: true } : entry
        )),
      }));
    }
    markHoleFlag(currentHoleIndex, {
      flags: { distanceJumpFlagged: true, playerConfirmed: true },
    });
    // Shot was already committed in onShotLogged; only dismiss + confirm flags above.
    setMissedShotBanner(null);
  }, [currentHoleIndex, markHoleFlag, missedShotBanner]);

  const handleOpenMissedShotForm = useCallback(() => {
    if (!missedShotBanner?.shot || !missedShotBanner?.prevShot?.from || !missedShotBanner?.shot?.from) return;
    const midpoint = getMidpoint(missedShotBanner.prevShot.from, missedShotBanner.shot.from);
    setMissedShotForm({
      holeIndex: currentHoleIndex,
      insertAfterNum: missedShotBanner.prevShot.num,
      club: activeBagClubs[0] || '7 Iron',
      lie: 'Fairway',
      from: midpoint,
      queuedShot: missedShotBanner.shot,
      /** Queued shot is already on the hole from onShotLogged — only insert the missed swing. */
      skipQueuedCommit: true,
    });
  }, [activeBagClubs, currentHoleIndex, missedShotBanner]);

  const handleSaveMissedShot = useCallback(() => {
    if (!missedShotForm) return;
    insertRetrospectiveShot(missedShotForm.holeIndex, missedShotForm.insertAfterNum, {
      club: missedShotForm.club,
      lie: missedShotForm.lie,
      lieColor: detectLieAtCoordinate(missedShotForm.from)?.color || '#9CA3AF',
      from: missedShotForm.from,
      to: missedShotForm.queuedShot?.from || null,
      loggedAt: new Date().toISOString(),
      actualYards: null,
      playingYards: null,
    });
    if (!missedShotForm.skipQueuedCommit && missedShotForm.queuedShot) {
      commitShotToHole(missedShotForm.holeIndex, missedShotForm.queuedShot);
    }
    setMissedShotForm(null);
    setMissedShotBanner(null);
  }, [commitShotToHole, detectLieAtCoordinate, insertRetrospectiveShot, missedShotForm]);

  const handleFinishRound = useCallback(async () => {
    const gpsShots = Object.entries(loggedShotsByHole).flatMap(([holeIndex, shots]) =>
      (shots || []).map((shot, index) => ({
        id: String(shot.id || `${holeIndex}-${index}`),
        holeNumber: Number(holeIndex) + 1,
        shotNumber: typeof shot.num === 'number' ? shot.num : index + 1,
        club: shot.abbr || 'Shot',
        ...(shot.shotKind === 'putt' ? { shotType: 'putt' } : {}),
        lie: shot.lie || null,
        actualYards: typeof shot.actualYards === 'number' ? shot.actualYards : null,
        playingYards: typeof shot.playingYards === 'number' ? shot.playingYards : null,
        from: shot.from || null,
        to: shot.to || null,
        weather: shot.weather
          ? {
              windMph: Number.isFinite(shot.weather.windMph) ? shot.weather.windMph : null,
              windDegrees: Number.isFinite(shot.weather.windDegrees) ? shot.weather.windDegrees : null,
              tempF: Number.isFinite(shot.weather.tempF) ? shot.weather.tempF : null,
              humidity: Number.isFinite(shot.weather.humidity) ? shot.weather.humidity : null,
            }
          : null,
        loggedAt: shot.loggedAt || null,
        playerConfirmedDistance: Boolean(shot.playerConfirmedDistance),
        addedRetrospectively: Boolean(shot.addedRetrospectively),
        offCourseFlag: Boolean(shot.offCourseFlag),
      }))
    );

    if (!gpsShots.length) {
      Alert.alert('No GPS shots logged', 'Log at least one shot before continuing to score entry.');
      return;
    }

    const gpsHoleSummaries = Object.entries(holeSummariesByHole)
      .map(([holeIndex, summary]) => {
        const shots = loggedShotsByHole[Number(holeIndex)] || [];
        const holePar = visibleHoles[Number(holeIndex)]?.par ?? null;
        const derived = deriveGreenSummary(shots, summary, holePar);
        return {
        holeNumber: Number(holeIndex) + 1,
        firstPuttDistance: typeof summary.firstPuttDistance === 'number' ? summary.firstPuttDistance : null,
        pinLocation: summary.pinLocation || null,
        putts: typeof summary.putts === 'number' ? summary.putts : (derived.putts ?? null),
      };
      })
      .filter((summary) => summary.firstPuttDistance !== null || summary.putts !== null || summary.pinLocation !== null);

    const holeMapUrls = Object.entries(loggedShotsByHole).reduce((acc, [holeIndex, shots]) => {
      const holeData = visibleHoles[Number(holeIndex)] || null;
      const teePoi = holeData ? teePoiFromHole(holeData) : null;
      const greenPoi = holeData ? greenPoiFromHole(holeData) : null;
      if (!shots?.length || !teePoi || !greenPoi) return acc;
      const url = buildStaticHoleMapUrl({
        shots,
        teePoi,
        greenPoi,
      });
      if (url) {
        acc[Number(holeIndex) + 1] = url;
      }
      return acc;
    }, {});

    // Build courseOverride: prefer full CourseDetails from API (has all tees with ratings),
    // fall back to constructing one from GPS hole data.
    let courseOverride = undefined;
    try {
      const { getCourseDetails } = require('../services/golfCourseApiService');
      const details = await getCourseDetails(courseId);
      if (details?.teeBoxes?.length) {
        courseOverride = details;
      }
    } catch { /* fall through to GPS-derived override */ }

    if (!courseOverride && course) {
      const allHoles = course.holes || [];
      const teeNamesSet = new Map();
      for (const hole of allHoles) {
        for (const tee of (hole.tees || [])) {
          if (tee?.name && !teeNamesSet.has(tee.name)) {
            teeNamesSet.set(tee.name, []);
          }
        }
      }
      for (const hole of allHoles) {
        for (const [teeName, holesList] of teeNamesSet) {
          const teeEntry = (hole.tees || []).find(t => t?.name === teeName);
          holesList.push({
            hole: hole.hole ?? hole.number,
            par: hole.par ?? 4,
            yardage: Number(teeEntry?.yards) || hole.yardage || 0,
            handicap: hole.handicap ?? 0,
          });
        }
      }
      const teeBoxes = [...teeNamesSet.entries()].map(([teeName, holes]) => ({
        name: teeName,
        color: teeName,
        rating: 0,
        slope: 0,
        yardage: holes.reduce((sum, h) => sum + h.yardage, 0),
        holes,
      }));
      const resolvedName = courseName || course.courseName || course.name || 'GPS Round';
      courseOverride = {
        id: courseId,
        name: resolvedName,
        city: course.city || '',
        state: course.state || '',
        country: course.country || '',
        holes: allHoles.length,
        par: allHoles.reduce((s, h) => s + (h.par ?? 4), 0),
        latitude: course.latitude,
        longitude: course.longitude,
        teeBoxes,
        source: 'gps',
      };
    }

    const endedAt = Date.now();
    const finishHoleNum = visibleHoles[currentHoleIndex]?.hole ?? currentHoleIndex + 1;
    const mergedHoleTimestamps = {
      ...timingState.holeTimestamps,
      [finishHoleNum]: {
        ...(timingState.holeTimestamps[finishHoleNum] || {
          holeNumber: finishHoleNum,
          startedAt: endedAt,
          teeShotAt: null,
          savedAt: null,
          pausedMs: 0,
        }),
        savedAt: endedAt,
        pausedMs: currentHolePausedMs,
      },
    };
    const mergedTiming = { ...timingState, holeTimestamps: mergedHoleTimestamps };
    const holesCompleted = Object.values(mergedHoleTimestamps).filter((h) => h.savedAt).length;
    const roundTiming = calculateFinalTiming(mergedTiming, holesCompleted, endedAt);

    await clearGpsInProgressRound().catch(() => undefined);

    const payload = {
      courseId,
      courseName: courseName || course?.courseName || course?.name || 'GPS Round',
      courseOverride,
      teeName: selectedTee?.name || teeColor,
      startingHole,
      endingHole,
      roundLength,
      routeHoleNumbers: routeHoleNumbers?.length ? routeHoleNumbers : undefined,
      routeLabel: routeLabel || undefined,
      startedAt: mergedTiming.roundStartedAt,
      endedAt,
      gpsShots,
      gpsHoleSummaries,
      gpsHoleFlags: Object.values(holeFlagsByHole),
      holeMapUrls,
      roundTiming,
    };

    // Check for flagged holes needing review
    const flaggedForReview = Object.entries(holeFlagsByHole)
      .filter(([, flags]) => flags.shotCountFlagged || flags.distanceJumpFlagged)
      .filter(([, flags]) => !flags.playerConfirmed)
      .map(([idx]) => {
        const holeData = visibleHoles[Number(idx)];
        const shots = loggedShotsByHole[Number(idx)] || [];
        return {
          hole: holeData?.hole ?? Number(idx) + 1,
          par: holeData?.par ?? 4,
          shotCount: shots.length,
          reason: holeFlagsByHole[idx]?.shotCountFlagged ? 'shot_count' : 'distance_jump',
        };
      });

    setPendingRoundPayload(payload);

    if (flaggedForReview.length > 0) {
      setFlaggedForPreSave(flaggedForReview);
      setShowPreSaveReview(true);
    } else {
      onFinishRound?.(payload);
    }
  }, [course, courseId, courseName, currentHoleIndex, currentHolePausedMs, endingHole, holeFlagsByHole, holeSummariesByHole, loggedShotsByHole, onFinishRound, roundLength, routeHoleNumbers, routeLabel, selectedTee?.name, startingHole, teeColor, timingState, visibleHoles]);

  const handlePauseRound = useCallback(async () => {
    try {
      const now = Date.now();
      const closedPauseMs = timingState.pauseEvents.reduce((s, p) => s + (p.durationMs ?? 0), 0);
      const wall = now - timingState.roundStartedAt;
      const playedMs = Math.max(0, wall - closedPauseMs);

      const pauseEv = createPauseEvent('weather');
      const nextTiming = {
        ...timingState,
        lastActiveAt: now,
        playedMs,
        pauseEvents: [...timingState.pauseEvents, pauseEv],
      };

      const pausedPayload = {
        id: roundIdRef.current,
        status: 'paused',
        courseId,
        courseName: courseName || course?.courseName || course?.name || 'GPS Round',
        teeColor,
        selectedTee: selectedTee ? { name: selectedTee.name, color: selectedTee.color, yards: selectedTee.yards } : null,
        selectedTeeYardage,
        startingHole: visibleHoles[0]?.hole,
        endingHole,
        roundLength,
        routeHoleNumbers,
        routeLabel,
        tournamentMode,
        currentHoleIndex,
        pausedOnHole: currentHole?.hole ?? currentHoleIndex + 1,
        holesCompleted: Object.values(nextTiming.holeTimestamps).filter((h) => h.savedAt).length,
        loggedShotsByHole,
        holeSummariesByHole,
        holeScoresByHole,
        holeFlagsByHole,
        timing: nextTiming,
        createdAt: createdAtRoundRef.current,
        updatedAt: new Date().toISOString(),
      };

      await saveGpsInProgressRound(pausedPayload);
      onBack?.();
    } catch {
      Alert.alert('Error', 'Could not save round. Try again.');
    }
  }, [course, courseId, courseName, currentHole, currentHoleIndex, endingHole, holeFlagsByHole, holeScoresByHole, holeSummariesByHole, loggedShotsByHole, onBack, roundLength, routeHoleNumbers, routeLabel, selectedTee, selectedTeeYardage, teeColor, timingState, tournamentMode, visibleHoles]);

  const playedHoleCount = useMemo(
    () => visibleHoles.reduce((count, _hole, idx) => {
      const score = holeScoresByHole[idx];
      const summary = holeSummariesByHole[idx] || {};
      const shots = (loggedShotsByHole[idx] || []).length;
      const putts = typeof summary.putts === 'number' ? summary.putts : 0;
      return count + ((score != null || shots > 0 || putts > 0) ? 1 : 0);
    }, 0),
    [holeScoresByHole, holeSummariesByHole, loggedShotsByHole, visibleHoles]
  );

  const handleDeleteRound = useCallback(async () => {
    await clearGpsInProgressRound().catch(() => undefined);
    updateWatchGpsContext({
      active: false,
      roundActive: false,
      action: 'roundState',
      type: 'roundEnded',
      roundID: String(roundIdRef.current || courseId || courseName || 'gps-round'),
      roundId: String(roundIdRef.current || courseId || courseName || 'gps-round'),
      finalHole: visibleHoles[currentHoleIndex]?.hole ?? currentHoleIndex + 1,
      frt: 0,
      ctr: 0,
      bck: 0,
      timestamp: Date.now() / 1000,
      lastSyncAt: Date.now() / 1000,
      clubs: [],
      holes: [],
    });
    onBack?.();
  }, [courseId, courseName, currentHoleIndex, onBack, visibleHoles]);

  const handleEndRoundPress = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    const fromWatch = watchInvokedEndRoundRef.current;
    watchInvokedEndRoundRef.current = false;
    const message = currentHoleIndex < visibleHoles.length - 1
      ? `You are on hole ${currentHoleIndex + 1} of ${visibleHoles.length}`
      : undefined;
    const currentHasScore = holeScoresByHole[currentHoleIndex] != null || (currentHoleShots.length + currentPutts > 0);
    const fewPlayed = playedHoleCount < 5;
    const mid = !currentHasScore && playedHoleCount >= 5
      ? `${message ? `${message}\n\n` : ''}No score entered for the current hole. You can still finish now.`
      : message;
    const warning = fromWatch
      ? `Your Apple Watch asked to end this GPS round.${mid ? `\n\n${mid}` : ''}`
      : mid;

    const runFinish = () => {
      void handleFinishRound();
    };
    const runPause = () => {
      void handlePauseRound();
    };
    const runDelete = () => {
      Alert.alert('Delete this round?', 'Data will be lost.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Round', style: 'destructive', onPress: () => void handleDeleteRound() },
      ]);
    };

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: fromWatch ? 'End Round (Watch)' : 'End Round',
          message: warning || '',
          options: fewPlayed
            ? ['Finish Round', 'Delete Round', 'Save & Pause — Resume Later', 'Cancel']
            : ['Finish Round', 'Save & Pause — Resume Later', 'Cancel'],
          destructiveButtonIndex: fewPlayed ? 1 : undefined,
          cancelButtonIndex: fewPlayed ? 3 : 2,
        },
        (buttonIndex) => {
          if (buttonIndex === 0) runFinish();
          else if (fewPlayed && buttonIndex === 1) runDelete();
          else if ((fewPlayed && buttonIndex === 2) || (!fewPlayed && buttonIndex === 1)) runPause();
        },
      );
    } else {
      Alert.alert(fromWatch ? 'End Round (Watch)' : 'End Round', warning || '', fewPlayed ? [
        { text: 'Finish Round', onPress: runFinish },
        { text: 'Delete Round', style: 'destructive', onPress: runDelete },
        { text: 'Save & Pause — Resume Later', onPress: runPause },
        { text: 'Cancel', style: 'cancel' },
      ] : [
        { text: 'Finish Round', onPress: runFinish },
        { text: 'Save & Pause — Resume Later', onPress: runPause },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }, [currentHoleIndex, currentHoleShots.length, currentPutts, handleDeleteRound, handleFinishRound, handlePauseRound, holeScoresByHole, playedHoleCount, visibleHoles]);

  handleEndRoundPressRef.current = handleEndRoundPress;

  if (!MapboxGL) {
    return (
      <View style={styles.container}>
        <View style={[styles.fallbackCenter, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <Text style={styles.errorText}>@rnmapbox/maps is not installed yet.</Text>
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={[styles.fallbackCenter, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>Downloading course…</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={[styles.fallbackCenter, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <Text style={styles.errorText}>{error || 'Course data unavailable'}</Text>
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent={false} />
      <View style={styles.screenShell}>
      <View
        style={styles.gpsTopChromeWrap}
        pointerEvents="box-none"
      >
        <GpsGlassChrome
        courseName={courseName || course.courseName || 'GPS Round'}
        cachedLabel={cached ? 'Cached on device' : course?.source === 'LOCAL_SAMPLE' ? 'Local sample data' : 'Downloaded now'}
        selectedTeeName={selectedTee?.name || teeColor}
        selectedTeeYardage={selectedTeeYardage}
        topInset={insets.top}
        routeLabel={routeLabel}
        hole={currentHole}
        currentHoleIndex={currentHoleIndex}
        holes={visibleHoles}
        holeNumbers={holeWindow.custom ? routeHoleNumbers : undefined}
        loggedHoles={visibleLoggedHoles}
        teeBack={teeBack}
        greenFront={greenFront}
        greenCenter={greenCenter}
        greenBack={greenBack}
        lastShotFrom={lastShotFrom}
        currentHoleShotCount={currentHoleShots.length}
        onSelectHole={(visibleIndex) => handleSelectHole(visibleIndex)}
        onBack={handleEndRoundPress}
        onCardPress={() => setShowScorecard(true)}
        weatherIcon={weatherIcon}
        weatherText={!tournamentMode
          ? `${Number.isFinite(weather?.windMph) ? `${Math.round(weather.windMph)} mph` : '--'}  ${Number.isFinite(weather?.tempF) ? `${Math.round(weather.tempF)}F` : '--'}  ${Number.isFinite(weather?.humidity) ? `${Math.round(weather.humidity)}%` : '--'}`
          : 'Tournament mode'}
        yardages={yardages}
        playingDistance={playingDistance}
        tournamentMode={tournamentMode}
        holeScores={holeScoresForSelector}
        isOffCourse={isOffCourse}
        teeYardage={selectedTeeYardage}
        distanceUnit={distanceUnit}
        />
      </View>

      <MissedShotNudge
        nudgeHole={nudgeHole}
        onReview={() => {
          if (nudgeHole) setReviewHole(nudgeHole.hole);
        }}
        onDismiss={() => {
          if (nudgeHole) setNudgeDismissed(prev => new Set([...prev, nudgeHole.hole]));
        }}
      />

      <View style={styles.mapWrap}>
        <MapboxGL.MapView
          onPress={handleMapPress}
          onCameraChanged={handleCameraChanged}
          onDidFinishLoadingMap={() => resetHoleCamera(false)}
          style={StyleSheet.absoluteFillObject}
          styleURL={MapboxGL.StyleURL.Satellite}
          logoEnabled={false}
          attributionEnabled={false}
          scaleBarEnabled={false}
          compassEnabled={false}
          logoPosition={{ bottom: GPS_MAPBOX.LOGO_ATTRIBUTION_EDGE, left: GPS_MAPBOX.LOGO_ATTRIBUTION_EDGE }}
          attributionPosition={{ bottom: GPS_MAPBOX.LOGO_ATTRIBUTION_EDGE, right: GPS_MAPBOX.LOGO_ATTRIBUTION_EDGE }}
        >
          <MapboxGL.Camera
            ref={cameraRef}
            defaultSettings={greenCenter ? {
              centerCoordinate: [greenCenter.Longitude, greenCenter.Latitude],
              zoomLevel: 16,
            } : undefined}
          />
          {(pinCoords || greenCenter) ? (
            <MapboxGL.MarkerView
              id="green-flag-marker"
              coordinate={[
                pinCoords?.lng ?? greenCenter.Longitude,
                pinCoords?.lat ?? greenCenter.Latitude,
              ]}
            >
              <View style={styles.greenFlagMarker} pointerEvents="none">
                <Ionicons name="flag" size={16} color="#10B981" style={styles.greenFlagIcon} />
              </View>
            </MapboxGL.MarkerView>
          ) : null}
          {showGreenDistancePills ? (
            <>
              <MapboxGL.MarkerView
                id="green-front-pill"
                coordinate={[greenFront.Longitude, greenFront.Latitude]}
              >
                <View style={[styles.greenDistancePill, styles.greenDistancePillFront]}>
                  <Text style={styles.greenDistancePillText}>Front {formatYardage(yardages.front, distanceUnit)}</Text>
                </View>
              </MapboxGL.MarkerView>
              <MapboxGL.MarkerView
                id="green-middle-pill"
                coordinate={[greenCenter.Longitude, greenCenter.Latitude]}
              >
                <View style={[styles.greenDistancePill, styles.greenDistancePillMiddle]}>
                  <Text style={styles.greenDistancePillText}>Middle {formatYardage(yardages.center, distanceUnit)}</Text>
                </View>
              </MapboxGL.MarkerView>
              <MapboxGL.MarkerView
                id="green-back-pill"
                coordinate={[greenBack.Longitude, greenBack.Latitude]}
              >
                <View style={[styles.greenDistancePill, styles.greenDistancePillBack]}>
                  <Text style={styles.greenDistancePillText}>Back {formatYardage(yardages.back, distanceUnit)}</Text>
                </View>
              </MapboxGL.MarkerView>
            </>
          ) : null}
          {(currentHoleSummary.firstPuttDistance != null || currentPutts > 0) && puttMarkerPoi ? (
            <MapboxGL.MarkerView
              id="putt-pill-marker"
              coordinate={[puttMarkerPoi.Longitude, puttMarkerPoi.Latitude]}
            >
              <View style={styles.greenPuttBadge}>
                <Text style={styles.greenPuttBadgeLabel}>PUTTS</Text>
                <Text style={styles.greenPuttBadgeValue}>{currentPutts}</Text>
                {currentPuttDistanceSummary ? (
                  <Text style={styles.greenPuttBadgeSub}>{currentPuttDistanceSummary}</Text>
                ) : null}
              </View>
            </MapboxGL.MarkerView>
          ) : null}
          {showDispersion && holeDispersion?.length >= 2 ? holeDispersion.map((shot, index) => (
            <MapboxGL.MarkerView
              key={`dispersion-${shot.roundId}-${index}`}
              id={`dispersion-${shot.roundId}-${index}`}
              coordinate={[shot.lng, shot.lat]}
            >
              <View
                pointerEvents="none"
                style={[
                  styles.dispersionDot,
                  { backgroundColor: dispersionLieColor(shot.lie), borderColor: dispersionLieColor(shot.lie) },
                ]}
              />
            </MapboxGL.MarkerView>
          )) : null}
          {userPos && (
            <MapboxGL.MarkerView id="user-pulse-marker" coordinate={[userPos.lng, userPos.lat]}>
              <View style={styles.playerDotWrap}>
                <Animated.View style={[styles.playerPulseRing, {
                  transform: [{ scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
                  opacity: pulseAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.5, 0.15, 0] }),
                }]} />
                <View style={styles.playerCoreDot} />
              </View>
            </MapboxGL.MarkerView>
          )}
          {selectedTeeMarker ? (
            <MapboxGL.PointAnnotation
              id="selected-tee-marker"
              coordinate={[selectedTeeMarker.lng, selectedTeeMarker.lat]}
            >
              <View
                style={[
                  styles.selectedTeeMarker,
                  {
                    borderColor: getTeeMarkerColor(selectedTee?.name || teeColor),
                    backgroundColor: `${getTeeMarkerColor(selectedTee?.name || teeColor)}2E`,
                  },
                ]}
              />
            </MapboxGL.PointAnnotation>
          ) : null}
          {shotPathGeo && (
            <MapboxGL.ShapeSource id="shot-track" shape={shotPathGeo}>
              <MapboxGL.LineLayer id="shot-track-line" style={stylesMap.shotTrack} />
            </MapboxGL.ShapeSource>
          )}
          {strategyGeo && (
            <MapboxGL.ShapeSource id="strategy-line" shape={strategyGeo}>
              <MapboxGL.LineLayer id="strategy-line-layer" style={stylesMap.strategyLine} />
            </MapboxGL.ShapeSource>
          )}
          {yardageMarkers.map((marker) => (
            <MapboxGL.MarkerView
              key={`yd-${marker.yds}`}
              id={`yd-${marker.yds}`}
              coordinate={[marker.lng, marker.lat]}
            >
              <View style={styles.ydMarkerWrap}>
                <View
                  style={[
                    styles.ydDiamond,
                    {
                      borderColor: marker.color,
                      backgroundColor: marker.synthetic ? colors.bg.secondary : `${marker.color}2E`,
                    },
                  ]}
                />
                <Text style={[styles.ydNum, { color: marker.color }]}>{marker.yds}</Text>
              </View>
            </MapboxGL.MarkerView>
          ))}
          {routeLabels.map((label) => (
            <MapboxGL.MarkerView
              key={label.id}
              id={label.id}
              coordinate={[label.lng, label.lat]}
            >
              <View style={styles.routeLabelWrap}>
                <View style={styles.routeLabelPill}>
                  <Text style={styles.routeLabelText}>{formatYardage(label.yardsToGreen, distanceUnit)}</Text>
                </View>
              </View>
            </MapboxGL.MarkerView>
          ))}
          {layupTargets.map((target, index) => (
            <MapboxGL.MarkerView
              key={target.id}
              id={target.id}
              coordinate={[target.lng, target.lat]}
            >
              <View style={[styles.layupWrap, index > 0 && styles.layupWrapSecondary, target.labelOffsetY ? { marginTop: -18 + target.labelOffsetY } : null]}>
                <View style={[styles.layupDot, index > 0 && styles.layupDotSecondary]} />
                <View style={[styles.layupPill, index > 0 && styles.layupPillSecondary]}>
                  <Text style={styles.layupTag}>{target.tag}</Text>
                  <Text style={styles.layupText}>{target.label}</Text>
                </View>
              </View>
            </MapboxGL.MarkerView>
          ))}
          {hazardCarriesFiltered.map((hazard, index) => (
            <MapboxGL.MarkerView
              key={hazard.id}
              id={`haz-${hazard.id}`}
              coordinate={[hazard.lng, hazard.lat]}
            >
              <View style={[styles.carryWrap, getHazardPillOffsetStyle(hazard, index)]}>
                <View style={styles.carryPill}>
                  <Text style={[styles.carryTxt, { color: hazard.color }]}>
                    {yardsToDisplay(hazard.front, distanceUnit)} front {yardsToDisplay(hazard.carry, distanceUnit)} carry
                    <Text style={styles.carrySuffix}>{unitSuffix(distanceUnit)}</Text>
                  </Text>
                </View>
              </View>
            </MapboxGL.MarkerView>
          ))}
          {currentHoleShots.map((shot) => (
            shot.from?.lng && shot.from?.lat ? (
              <MapboxGL.MarkerView
                key={`shot-${shot.id}`}
                id={`shot-${shot.id}`}
                coordinate={[shot.from.lng, shot.from.lat]}
              >
                <TouchableOpacity
                  activeOpacity={0.8}
                  onLongPress={() => {
                    setSelectedShot(shot);
                    setShowShotMenu(true);
                  }}
                  delayLongPress={400}
                >
                  <View style={[
                    styles.mapShotBadge,
                    shot.num === currentHoleShots.length && styles.mapShotBadgeActive,
                  ]}>
                    <View style={[styles.mapShotClubDot, shot.color ? { backgroundColor: shot.color } : null]} />
                    <Text style={styles.mapShotClubText}>{shot.abbr || `S${shot.num}`}</Text>
                    {Number.isFinite(shot.playingYards ?? shot.actualYards) ? (
                      <Text style={styles.mapShotYardsText}>{formatYardage(shot.playingYards ?? shot.actualYards, distanceUnit)}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              </MapboxGL.MarkerView>
            ) : null
          ))}
          {/* Ghost overlay: planned shot line + marker */}
          {ghostLineGeo && (
            <MapboxGL.ShapeSource id="ghost-shot-line" shape={ghostLineGeo}>
              <MapboxGL.LineLayer
                id="ghost-shot-line-layer"
                style={{
                  lineColor: 'rgba(96,165,250,0.4)',
                  lineWidth: 2,
                  lineDasharray: [4, 3],
                }}
              />
            </MapboxGL.ShapeSource>
          )}
          {ghostHolePlan?.markedShot && (
            <MapboxGL.MarkerView
              id="ghost-shot-marker"
              coordinate={[ghostHolePlan.markedShot.lng, ghostHolePlan.markedShot.lat]}
            >
              <View style={styles.ghostMarker}>
                <View style={styles.ghostDiamond} />
              </View>
            </MapboxGL.MarkerView>
          )}
          {measurePin && (
            <MapboxGL.MarkerView
              id="measure-pin"
              coordinate={[measurePin.lng, measurePin.lat]}
            >
              <View style={styles.measurePinWrap}>
                <View style={styles.measurePinBadge}>
                  {measurePin.snappedTag ? (
                    <View style={styles.measurePinTag}>
                      <Text style={styles.measurePinTagText}>{measurePin.snappedTag}</Text>
                    </View>
                  ) : null}
                  <Text style={styles.measurePinText}>
                    {measurePin.snappedLabel || 'To Aim Point'}: {measurePin.fromDistance != null ? formatYardage(measurePin.fromDistance, distanceUnit) : '--'}
                  </Text>
                  <Text style={styles.measurePinToGreenText}>To Green: {formatYardage(measurePin.toGreen, distanceUnit)}</Text>
                  <View style={styles.measurePinPlaysLikeRow}>
                    <Text style={styles.measurePinPlaysLikeText}>Plays Like: {formatYardage(measurePin.playsLike, distanceUnit)}</Text>
                    {measurePin.windRotation ? (
                      <Ionicons
                        name="navigate"
                        size={11}
                        color="#86EFAC"
                        style={{ transform: [{ rotate: measurePin.windRotation }] }}
                      />
                    ) : null}
                  </View>
                  {measurePin.fromDistance != null && (
                    <Text style={styles.measurePinFromYou}>{formatYardage(measurePin.fromDistance, distanceUnit)} from current position</Text>
                  )}
                  <View style={styles.measurePinActions}>
                    <TouchableOpacity
                      style={[styles.measurePinActionBtn, measurePin.locked && styles.measurePinActionBtnActive]}
                      onPress={() => {
                        void Haptics.selectionAsync().catch(() => undefined);
                        setMeasurePin((prev) => prev ? { ...prev, locked: !prev.locked } : prev);
                      }}
                    >
                      <Ionicons name={measurePin.locked ? 'lock-closed' : 'lock-open'} size={12} color={measurePin.locked ? '#0f1419' : '#fff'} />
                      <Text style={[styles.measurePinActionText, measurePin.locked && styles.measurePinActionTextActive]}>
                        {measurePin.locked ? 'Locked' : 'Pin'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.measurePinDismissBtn}
                      onPress={() => {
                        void Haptics.selectionAsync().catch(() => undefined);
                        setMeasurePin(null);
                      }}
                    >
                      <Ionicons name="close" size={12} color="rgba(255,255,255,0.8)" />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.measurePinDot} />
              </View>
            </MapboxGL.MarkerView>
          )}
          {measurePin && activeGreenPoi && (
            <MapboxGL.ShapeSource
              id="measure-line"
              shape={{
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [measurePin.lng, measurePin.lat],
                    [activeGreenPoi.Longitude, activeGreenPoi.Latitude],
                  ],
                },
                properties: {},
              }}
            >
              <MapboxGL.LineLayer
                id="measure-line-layer"
                style={{
                  lineColor: '#FBBF24',
                  lineWidth: 2.5,
                  lineDasharray: [4, 3],
                  lineOpacity: 0.85,
                }}
              />
            </MapboxGL.ShapeSource>
          )}
          {measurePin?.measureLineFrom && (
            <MapboxGL.ShapeSource
              id="measure-line-from-origin"
              shape={{
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [measurePin.measureLineFrom.lng, measurePin.measureLineFrom.lat],
                    [measurePin.lng, measurePin.lat],
                  ],
                },
                properties: {},
              }}
            >
              <MapboxGL.LineLayer
                id="measure-line-from-origin-layer"
                style={{
                  lineColor: '#22C55E',
                  lineWidth: 4,
                  lineOpacity: 0.95,
                }}
              />
            </MapboxGL.ShapeSource>
          )}
          <GpsOverlay
            ref={overlayRef}
            userPos={userPos}
            startPoint={overlayStartPoint}
            greenCenter={greenCenter}
            teePoi={teeBack}
            holePar={currentHole?.par}
            userClubs={userClubs}
            manualDisplayYards={manualClubDisplayYards}
            sheetPlayingYards={
              tournamentMode
                ? (Number.isFinite(targetYards) ? targetYards : centerYards)
                : (playingDistance?.adjustedYards ?? centerYards)
            }
            caddieTipText={clubSheetCaddieText}
            activeBagClubs={activeBagClubs}
            tournamentMode={tournamentMode}
            detectLieAtCoordinate={detectLieAtCoordinate}
            shotNumber={currentHoleShots.length + 1}
            previousLie={currentHoleShots.length > 0 ? currentHoleShots[currentHoleShots.length - 1]?.lie : null}
            onOverlayStateChange={setOverlayState}
            onShotLogged={(shot) => {
              // Move edit: update existing shot position only
              if (shot.isMoveEdit) {
                updateShotOnHole(currentHoleIndex, shot.id, {
                  from: shot.from,
                  lie: shot.lie,
                  lieColor: shot.lieColor,
                });
                setEditingShot(null);
                return;
              }
              const existing = loggedShotsByHoleRef.current[currentHoleIndex] || [];
              const prevShot = existing.length > 0 ? existing[existing.length - 1] : null;
              const distanceJump = prevShot && !shot.penalty && !prevShot.penalty
                ? checkDistanceJump(
                    {
                      hole: currentHole?.hole || currentHoleIndex + 1,
                      club: shot.club,
                      startCoords: shot.from || null,
                    },
                    {
                      hole: currentHole?.hole || currentHoleIndex + 1,
                      club: prevShot.club || prevShot.abbr,
                      startCoords: prevShot.from || null,
                    },
                    Object.fromEntries(
                      Object.entries(clubAverages || {}).map(([key, value]) => [key.toLowerCase(), value])
                    ),
                    userClubs?.Driver || null,
                  )
                : null;

              if (distanceJump) {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
                markHoleFlag(currentHoleIndex, {
                  flags: { distanceJumpFlagged: true },
                });
                setMissedShotBanner({
                  kind: 'distance_jump',
                  holeIndex: currentHoleIndex,
                  shot,
                  prevShot,
                  message:
                    distanceJump.reason === 'club_mismatch'
                      ? `Your ${distanceJump.club} averages ${distanceJump.clubAvg}y but that position is ${distanceJump.gpsDistance}y away. Did you forget a shot?`
                      : distanceJump.reason === 'personal_limit'
                        ? `That is ${distanceJump.gpsDistance}y from your last shot, further than your driver avg. Did you miss one?`
                        : `That is ${distanceJump.gpsDistance}y from your last shot. Did you forget one?`,
                });
              }

              // Capture hole entry conditions on first shot
              if (existing.length === 0) {
                const hNum = currentHole?.hole ?? currentHoleIndex + 1;
                setTimingState((prev) => ({
                  ...prev,
                  holeTimestamps: {
                    ...prev.holeTimestamps,
                    [hNum]: {
                      ...(prev.holeTimestamps[hNum] || {
                        holeNumber: hNum,
                        startedAt: Date.now(),
                        teeShotAt: null,
                        savedAt: null,
                        pausedMs: 0,
                      }),
                      teeShotAt: Date.now(),
                    },
                  },
                }));
                setHoleSummariesByHole(prev => ({
                  ...prev,
                  [currentHoleIndex]: {
                    ...(prev[currentHoleIndex] || {}),
                    conditions: {
                      tempF: weather?.tempF ?? null,
                      windMph: weather?.windMph ?? null,
                      windDegrees: weather?.windDegrees ?? null,
                      humidity: weather?.humidity ?? null,
                    },
                    playingYardage: playingDistance?.adjustedYards ?? centerYards ?? null,
                    gpsDistance: centerYards ?? null,
                    windAdj: playingDistance?.windAdj ?? null,
                    tempAdj: playingDistance?.tempAdj ?? null,
                    elevAdj: playingDistance?.elevAdj ?? null,
                  },
                }));
              }
              if (insertAfterShotId) {
                // Insert mode: find the shot num we're inserting after, then splice
                const existingShots = loggedShotsByHoleRef.current[currentHoleIndex] || [];
                const afterShot = existingShots.find((s) => s.id === insertAfterShotId);
                const insertAfterNum = afterShot ? afterShot.num : existingShots.length;
                insertRetrospectiveShot(currentHoleIndex, insertAfterNum, {
                  ...shot,
                  addedRetrospectively: true,
                });
                setInsertAfterShotId(null);
              } else {
                commitShotToHole(currentHoleIndex, shot);
              }

              // Auto FIR detection: tee shot on par 4/5
              const isTeeShot = existing.length === 0;
              if (isTeeShot && (currentHole?.par === 4 || currentHole?.par === 5)) {
                const fir = shot.lie === 'Fairway';
                setHoleSummariesByHole((prev) => ({
                  ...prev,
                  [currentHoleIndex]: {
                    ...(prev[currentHoleIndex] || {}),
                    fairwayHit: fir,
                    fairwayMiss: !fir
                      ? (shot.lie === 'Left Rough' ? 'left'
                        : shot.lie === 'Right Rough' ? 'right'
                        : shot.lie === 'Sand' ? 'bunker'
                        : 'other')
                      : null,
                  },
                }));
              }

              // Auto GIR detection: shot lands on green
              if (shot.lie === 'Green') {
                const girCount = existing.length + 1;
                const girInReg = girCount <= (currentHole?.par || 4) - 2;
                setHoleSummariesByHole((prev) => ({
                  ...prev,
                  [currentHoleIndex]: {
                    ...(prev[currentHoleIndex] || {}),
                    girAchieved: girInReg,
                    greenReachedInShots: girCount,
                  },
                }));
              }
            }}
          />
        </MapboxGL.MapView>
        {aimMode ? <View pointerEvents="none" style={styles.aimModeDimmer} /> : null}
        {showAimHintBanner ? (
          <View style={styles.aimHintBanner} pointerEvents="none">
            <Text style={styles.aimHintText}>Aim Point Mode — Tap anywhere on the map to measure distances</Text>
          </View>
        ) : null}
        {missedShotBanner ? (
          <View style={styles.missedShotBanner}>
            <Text style={styles.missedShotBannerText}>{missedShotBanner.message}</Text>
            <View style={styles.missedShotBannerActions}>
              <TouchableOpacity style={styles.missedShotPrimaryBtn} onPress={handleOpenMissedShotForm}>
                <Text style={styles.missedShotPrimaryBtnText}>
                  {missedShotBanner.kind === 'shot_count' ? 'Add shot' : 'Add missed shot'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.missedShotSecondaryBtn}
                onPress={() => {
                  if (missedShotBanner.kind === 'distance_jump') {
                    handleConfirmDistanceJump();
                    return;
                  }
                  markHoleFlag(currentHoleIndex, {
                    dataComplete: false,
                    flags: { shotCountFlagged: true, playerConfirmed: true },
                  });
                  handleSelectHole(missedShotBanner.targetHoleIndex);
                }}
              >
                <Text style={styles.missedShotSecondaryBtnText}>No, that is right</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
        {missedShotForm ? (
          <View style={styles.missedShotBanner}>
            <Text style={styles.missedShotBannerTitle}>Add missed shot</Text>
            <View style={styles.missedShotFieldRow}>
              <Text style={styles.missedShotFieldLabel}>Club</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.missedShotClubRow}>
                  {activeBagClubs.map((club) => (
                    <TouchableOpacity
                      key={club}
                      style={[styles.missedShotClubChip, missedShotForm.club === club && styles.missedShotClubChipActive]}
                      onPress={() => setMissedShotForm((prev) => prev ? { ...prev, club } : prev)}
                    >
                      <Text style={styles.missedShotClubChipText}>{club}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
            <View style={styles.missedShotFieldRow}>
              <Text style={styles.missedShotFieldLabel}>Lie</Text>
              <View style={styles.missedShotClubRow}>
                {['Fairway', 'Left Rough', 'Right Rough', 'Sand', 'Other'].map((lie) => (
                  <TouchableOpacity
                    key={lie}
                    style={[styles.missedShotClubChip, missedShotForm.lie === lie && styles.missedShotClubChipActive]}
                    onPress={() => setMissedShotForm((prev) => prev ? { ...prev, lie } : prev)}
                  >
                    <Text style={styles.missedShotClubChipText}>{lie}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.missedShotBannerActions}>
              <TouchableOpacity style={styles.missedShotPrimaryBtn} onPress={handleSaveMissedShot}>
                <Text style={styles.missedShotPrimaryBtnText}>Save missed shot</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.missedShotSecondaryBtn} onPress={() => setMissedShotForm(null)}>
                <Text style={styles.missedShotSecondaryBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
        {lieToast ? (
          <View style={[styles.lieToast, { bottom: toastBottom }, lieToast.color ? { borderColor: lieToast.color } : null]}>
            <View style={[styles.lieToastDot, lieToast.color ? { backgroundColor: lieToast.color } : null]} />
            <Text style={styles.lieToastText}>{lieToast.lie}</Text>
            <Text style={styles.lieToastSubtext}>Current lie</Text>
          </View>
        ) : null}
        {showDispersion && holeDispersion?.length >= 3 ? (
          <View style={styles.dispersionInsightChip}>
            <Text style={styles.dispersionInsightText}>
              {buildLiveDispersionInsight(holeDispersion, dispersionMode)}
            </Text>
          </View>
        ) : null}
        {/* GPS warmup banner */}
        {!gpsWarmedUp && gpsAccuracyMeters != null && (
          <View style={styles.gpsWarmupBanner}>
            <ActivityIndicator size="small" color="#1ac855" />
            <Text style={styles.gpsWarmupText}>Acquiring GPS lock\u2026 {formatAccuracy(gpsAccuracyMeters, distanceUnit)}</Text>
          </View>
        )}
        {/* Plan note chip */}
        {showGhostOverlay && ghostHolePlan?.note ? (
          <View style={styles.planNoteChip}>
            <Ionicons name="document-text-outline" size={12} color="#60A5FA" />
            <Text style={styles.planNoteText} numberOfLines={2}>{ghostHolePlan.note}</Text>
          </View>
        ) : null}
        {/* Plan vs actual comparison chip */}
        {showGhostOverlay && ghostHolePlan?.planningYardage && currentHoleShots.length >= 1 && currentHoleShots[0]?.from ? (
          <View style={styles.planCompareChip}>
            <Text style={styles.planCompareLabel}>Plan</Text>
            <Text style={styles.planCompareValue}>{ghostHolePlan.planningYardage}y</Text>
            <Text style={styles.planCompareSep}>vs</Text>
            <Text style={styles.planCompareLabel}>Actual</Text>
            <Text style={styles.planCompareValue}>
              {currentHoleShots[0].playingYards != null
                ? `${currentHoleShots[0].playingYards}y`
                : '--'}
            </Text>
          </View>
        ) : null}
        <View
          pointerEvents="none"
          style={[
            styles.mapboxWordmark,
            { bottom: insets.bottom + GPS_BAR.BOTTOM_ACTION + GPS_ABOVE_BAR.WORDMARK },
          ]}
        >
          <Text style={styles.mapboxWordmarkText}>mapbox</Text>
        </View>
      </View>

      <View style={styles.gpsHudWrap} pointerEvents="box-none">
      <GpsRoundHud
        suggestion={clubChipSuggestion}
        showSuggestionChip={activeBagClubs.length > 0}
        suggestionChipPickedLabel={overlayState.shotFlow === 'idle' ? overlayState.selectedClub : null}
        holeNumber={currentHole?.hole || currentHoleIndex + 1}
        displayNudge={displayNudge}
        showNudgeCard={Boolean(displayNudge) && suggestionTipExpanded}
        suggestionActive={suggestionTipExpanded}
        nudgeOverlayBottom={coachingOverlayBottom}
        onPressSuggestion={() => {
          // Tap opens the coaching insights modal — shows the percentage
          // stats / recommendation copy, and offers a "pick different club"
          // button. Long-press is the fast path to the club picker.
          void Haptics.selectionAsync().catch(() => undefined);
          setSuggestionTipExpanded(false);
          setShowSuggestionModal(true);
        }}
        onLongPressSuggestion={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
          setSuggestionTipExpanded(false);
          overlayRef.current?.openClubPicker?.();
        }}
        bottomBarHeight={GPS_BAR.BOTTOM_ACTION}
        yardageBarHeight={GPS_BAR.YARDAGE}
        currentPutts={currentPutts}
        onDecrementPutts={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
          setHoleSummariesByHole((prev) => ({
            ...prev,
            [currentHoleIndex]: {
              ...currentHoleSummary,
              putts: Math.max(0, currentPutts - 1),
            },
          }));
        }}
        onBeforeIncrementPutts={() => closeLastOpenShotToGreen(currentHoleIndex, greenCenter)}
        onIncrementPutts={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
          setHoleSummariesByHole((prev) => ({
            ...prev,
            [currentHoleIndex]: {
              ...currentHoleSummary,
              putts: currentPutts + 1,
            },
          }));
        }}
        addShotLabel="ADD SHOT"
        onPressAddShot={() => {
          if (overlayState.anySheet || overlayState.shotFlow !== 'idle') return;
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
          setMeasurePin(null);
          overlayRef.current?.startShotEntry?.();
        }}
        addShotActive={false}
        yardages={yardages}
        compactYardage={compactLayout}
        bottomInset={insets.bottom}
        quietLinks={[]}
        gpsQuality={gpsQuality}
        gpsAccuracyMeters={gpsAccuracyMeters}
        distanceUnit={distanceUnit}
        greenTarget={greenTarget}
        onGreenTargetChange={setGreenTarget}
        manualMode={manualMode}
        manualYardage={manualYardage}
        onManualYardageChange={setManualYardage}
        onNextHole={() => {
          const advance = () => {
            if (currentHoleIndex >= visibleHoles.length - 1) {
              handleEndRoundPress();
            } else {
              handleSelectHole(currentHoleIndex + 1);
            }
          };
          const hasScore = holeScoresByHole[currentHoleIndex] != null || (currentHoleShots.length + currentPutts > 0);
          if (!hasScore) {
            Alert.alert(
              'Add score?',
              `No score entered for hole ${currentHole?.hole || currentHoleIndex + 1}.`,
              [
                { text: 'Add Score', onPress: () => setShowScoreSheet(true) },
                { text: 'Skip', style: 'cancel', onPress: advance },
              ]
            );
          } else {
            advance();
          }
        }}
        isLastHole={currentHoleIndex >= visibleHoles.length - 1}
        holeScore={holeScoresByHole[currentHoleIndex] ?? ((currentHoleShots.length + currentPutts > 0) ? currentHoleShots.length + currentPutts : null)}
        holePar={currentHole?.par || 4}
        onScorePress={() => setShowScoreSheet(true)}
        isPlacing={overlayState.shotFlow === 'mark' || overlayState.shotFlow === 'edit'}
        showPlacementInstruction={!overlayState.anySheet && (overlayState.shotFlow === 'mark' || overlayState.shotFlow === 'edit')}
        placementClub={overlayState.activeClub}
        placementLie={overlayState.activeLie}
        placementLieOptions={overlayState.placementLieOptions || []}
        placementDistance={overlayState.targetDistance}
        placementInstructionText={
          overlayState.shotFlow === 'edit'
            ? `Tap to move shot ${selectedShot?.num || ''}`.trim()
            : insertAfterShotId
              ? `Tap where shot ${((loggedShotsByHole[currentHoleIndex] || []).find(s => s.id === insertAfterShotId)?.num ?? 0) + 1} started`
              : undefined
        }
        onCancelPlacement={() => {
          setMeasurePin(null);
          setInsertAfterShotId(null);
          overlayRef.current?.resetOverlay?.();
        }}
        onConfirmPlacement={() => {
          setMeasurePin(null);
          overlayRef.current?.confirmAndLog?.();
        }}
        onCycleLie={() => overlayRef.current?.cycleLie?.()}
        onSetPlacementLie={(lieName) => overlayRef.current?.setManualLieChoice?.(lieName)}
        onOpenClubPicker={() => overlayRef.current?.openClubPicker?.()}
        onPressEditShot={currentHoleShots.length > 0 ? () => {
          setSelectedShot(currentHoleShots[currentHoleShots.length - 1]);
          setShowShotMenu(true);
        } : null}
      />
      </View>
      </View>

      {greenMapOnly && (
        <View style={[styles.pinHint, { bottom: insets.bottom + GPS_BAR.BOTTOM_ACTION + 56 }]} pointerEvents="none">
          <Text style={styles.pinHintText}>Tap to move pin</Text>
        </View>
      )}
      <View
        style={[
          styles.rightMapStack,
          {
            bottom: insets.bottom + GPS_BAR.BOTTOM_ACTION + GPS_ABOVE_BAR.RIGHT_MAP_STACK
              + (overlayState.shotFlow === 'mark' || overlayState.shotFlow === 'edit' ? GPS_BAR.PLACEMENT_YARDAGE_BAND : 0)
              + (manualMode ? 44 : 0),
          },
        ]}
        pointerEvents="box-none"
      >
        {holeDispersion?.length >= 2 ? (
          <TouchableOpacity
            style={[styles.greenPill, showDispersion && styles.greenPillActive, styles.dispersionPill]}
            onPress={() => setShowDispersion((value) => !value)}
          >
            <Ionicons name="stats-chart-outline" size={14} color={showDispersion ? '#fff' : colors.brand.primary} />
            <Text style={[styles.greenPillText, showDispersion && styles.greenPillTextActive]}>
              {showDispersion ? 'Hide' : 'Pattern'}
            </Text>
            {!showDispersion ? (
              <View style={styles.dispersionCountBadge}>
                <Text style={styles.dispersionCountText}>{holeDispersion.length}</Text>
              </View>
            ) : null}
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[styles.greenPill, greenMapOnly && styles.greenPillActive]}
          onPress={handleGreenViewPress}
        >
          <Ionicons name="golf-outline" size={14} color={greenMapOnly ? '#fff' : colors.brand.primary} />
          <Text style={[styles.greenPillText, greenMapOnly && styles.greenPillTextActive]}>
            {greenTarget === 'front' ? 'Front' : greenTarget === 'back' ? 'Back' : 'Green'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.greenPill, aimMode && styles.greenPillActive, styles.aimPill]}
          onPress={toggleAimMode}
        >
          <Ionicons name={aimMode ? 'checkmark-circle-outline' : 'locate-outline'} size={14} color={aimMode ? '#fff' : colors.brand.primary} />
          <Text style={[styles.greenPillText, aimMode && styles.greenPillTextActive]}>
            {aimMode ? 'Done' : 'Aim'}
          </Text>
        </TouchableOpacity>
        {greenMapOnly ? (
          <TouchableOpacity style={[styles.greenPill, styles.overviewPill]} onPress={handleMapOverviewPress}>
            <Ionicons name="expand-outline" size={14} color="#fff" />
            <Text style={[styles.greenPillText, styles.greenPillTextActive]}>Overview</Text>
          </TouchableOpacity>
        ) : null}
        {liveLie?.lie === 'Green' && (
          <TouchableOpacity style={styles.greenMarkButton} onPress={() => setShowGreenSheet(true)}>
            <Text style={styles.greenMarkText}>Mark Green</Text>
          </TouchableOpacity>
        )}
        {coursePlan && (
          <TouchableOpacity
            style={[styles.greenPill, showGhostOverlay && { borderColor: 'rgba(96,165,250,0.5)', backgroundColor: 'rgba(96,165,250,0.12)' }]}
            onPress={() => setShowGhostOverlay(prev => !prev)}
          >
            <Ionicons name="layers-outline" size={14} color={showGhostOverlay ? '#60A5FA' : '#6B7280'} />
            <Text style={[styles.greenPillText, { color: showGhostOverlay ? '#60A5FA' : '#6B7280' }]}>Plan</Text>
          </TouchableOpacity>
        )}
        <View style={styles.mapBtnRow}>
          <TouchableOpacity
            style={[styles.mapBtnPill, manualMode ? null : gpsQuality !== 'none' ? styles.mapBtnPillActive : null]}
            onPress={() => {
              if (manualMode) { setManualMode(false); setManualYardage(''); }
              else if (gpsQuality === 'none') { setManualMode(true); }
            }}
            activeOpacity={0.8}
          >
            <Ionicons
              name={manualMode ? 'hand-left-outline' : gpsQuality === 'none' ? 'navigate-outline' : 'navigate'}
              size={13}
              color="#FFFFFF"
            />
            <Text style={styles.mapBtnText}>{manualMode ? 'MANUAL' : 'GPS'}</Text>
          </TouchableOpacity>
          {isOffCourse ? (
            <View style={styles.mapOffCourseBadge}>
              <Text style={styles.mapOffCourseText}>Off Course</Text>
            </View>
          ) : null}
        </View>
      </View>

      <ScoreEntrySheet
        visible={showScoreSheet}
        holeNumber={currentHole?.hole || currentHoleIndex + 1}
        par={currentHole?.par || 4}
        currentScore={holeScoresByHole[currentHoleIndex] ?? ((currentHoleShots.length + currentPutts > 0) ? currentHoleShots.length + currentPutts : null)}
        onSave={(score) => setHoleScoresByHole(prev => ({ ...prev, [currentHoleIndex]: score }))}
        onClose={() => setShowScoreSheet(false)}
      />

      <ReportModal
        visible={reportModalVisible}
        context={reportContext}
        onClose={() => {
          setReportModalVisible(false);
          setReportContext(null);
        }}
      />

      <Modal visible={showSuggestionModal} transparent animationType="fade" onRequestClose={() => setShowSuggestionModal(false)}>
        <View style={styles.historyBackdrop}>
          <TouchableOpacity style={styles.historyScrim} activeOpacity={1} onPress={() => setShowSuggestionModal(false)} />
          <View style={styles.historySheet}>
            <View style={styles.historyHandle} />
            <View style={styles.historyHeader}>
              <View>
                <Text style={styles.historyTitle}>{holeSuggestion?.title || 'Coaching insight'}</Text>
                <Text style={styles.historySubtitle}>
                  {(() => {
                    const inRange = Number.isFinite(suggestionRawYardsToGreenCenter)
                      && suggestionRawYardsToGreenCenter > 0
                      && suggestionRawYardsToGreenCenter < 800;
                    if (holeSuggestion?.support && inRange) return holeSuggestion.support;
                    if (inRange) return `${Math.round(suggestionRawYardsToGreenCenter)}y to green center`;
                    return 'Your bag at a glance';
                  })()}
                </Text>
              </View>
              <TouchableOpacity style={styles.historyClose} onPress={() => setShowSuggestionModal(false)}>
                <Text style={styles.historyCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.suggestionModalScroll} contentContainerStyle={styles.suggestionModalBody}>
              {holeSuggestion && holeSuggestion.state !== 'no_history' ? (
                <CoachingInsightCard suggestion={holeSuggestion} holeNumber={currentHole?.hole || currentHoleIndex + 1} />
              ) : (
                <View style={styles.suggestionEmptyNote}>
                  <Text style={styles.suggestionEmptyTitle}>Building coaching history</Text>
                  <Text style={styles.suggestionEmptyBody}>
                    Play a few rounds (or seed history from Profile → Add Haven Golf Course rounds) and tips will appear here.
                  </Text>
                </View>
              )}

              {(() => {
                const target = Number.isFinite(suggestionPlayingDistance?.adjustedYards)
                  ? suggestionPlayingDistance.adjustedYards
                  : suggestionRawYardsToGreenCenter;
                // Clamp: only treat the target as a real "distance to green" when
                // it's within a sane golf range. At home (miles off course) it
                // can read 10,000+ yards and every club diff becomes nonsense.
                const hasSaneTarget = Number.isFinite(target) && target > 0 && target < 800;
                const rows = (activeBagClubs || []).map((club) => {
                  const key = normalizeClubKey(club);
                  const avg = clubAverages?.[key];
                  const manual = userClubs ? userClubs[key] ?? null : null;
                  const display = getClubDisplayDistance(avg, manual);
                  const yards = display?.yards ?? null;
                  const diff = hasSaneTarget && Number.isFinite(yards) ? Math.abs(yards - target) : null;
                  const confidenceLabel = display?.source === 'gps'
                    ? (display.confidence === 'high' ? `GPS · ${display.sampleCount} shots` : `GPS · ${display.sampleCount} shots · building`)
                    : display?.source === 'manual'
                      ? 'From profile'
                      : 'No data yet';
                  return { club, label: formatClubLabel(club), yards, diff, confidenceLabel, hasData: !!display };
                }).sort((a, b) => {
                  // If we have a sane target, sort by closeness; else sort by longest club descending.
                  if (hasSaneTarget) {
                    if (a.diff == null && b.diff == null) return 0;
                    if (a.diff == null) return 1;
                    if (b.diff == null) return -1;
                    return a.diff - b.diff;
                  }
                  return (b.yards || 0) - (a.yards || 0);
                });
                const suggestedKey = normalizeClubKey(distanceSuggestedClub?.club || '');
                return rows.length === 0 ? null : (
                  <View style={styles.clubTable}>
                    <Text style={styles.clubTableHeader}>
                      {hasSaneTarget ? `Your clubs · target ${Math.round(target)}y` : 'Your clubs (avg carry)'}
                    </Text>
                    {rows.slice(0, 8).map((row) => {
                      const isSuggested = normalizeClubKey(row.club) === suggestedKey;
                      return (
                        <View key={row.club} style={[styles.clubTableRow, isSuggested && styles.clubTableRowActive]}>
                          <Text style={[styles.clubTableClub, isSuggested && styles.clubTableClubActive]}>
                            {isSuggested ? '★ ' : ''}{row.label}
                          </Text>
                          <View style={styles.clubTableMeta}>
                            <Text style={[styles.clubTableYards, isSuggested && styles.clubTableYardsActive]}>
                              {row.yards != null ? `${Math.round(row.yards)}y` : '—'}
                            </Text>
                            {row.diff != null ? (
                              <Text style={styles.clubTableDiff}>
                                {row.diff === 0 ? 'on' : `±${Math.round(row.diff)}y`}
                              </Text>
                            ) : null}
                          </View>
                          <Text style={styles.clubTableConfidence}>{row.confidenceLabel}</Text>
                        </View>
                      );
                    })}
                  </View>
                );
              })()}

              <TouchableOpacity
                style={styles.suggestionModalCta}
                onPress={() => {
                  void Haptics.selectionAsync().catch(() => undefined);
                  setShowSuggestionModal(false);
                  // Open picker on next tick so the modal animates out first.
                  setTimeout(() => overlayRef.current?.openClubPicker?.(), 100);
                }}
              >
                <Text style={styles.suggestionModalCtaText}>Pick a different club</Text>
              </TouchableOpacity>
              <Text style={styles.suggestionModalHint}>Tip: long-press the suggested chip to skip straight to the club picker.</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showHistory} transparent animationType="fade" onRequestClose={() => setShowHistory(false)}>
        <View style={styles.historyBackdrop}>
          <TouchableOpacity style={styles.historyScrim} activeOpacity={1} onPress={() => setShowHistory(false)} />
          <View style={styles.historySheet}>
            <View style={styles.historyHandle} />
            <View style={styles.historyHeader}>
              <View>
                <Text style={styles.historyTitle}>Shot History</Text>
                <Text style={styles.historySubtitle}>
                  {Object.values(loggedShotsByHole).reduce((sum, shots) => sum + shots.length, 0)} logged shots
                </Text>
              </View>
              <TouchableOpacity style={styles.historyClose} onPress={() => setShowHistory(false)}>
                <Text style={styles.historyCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.historyScroll} contentContainerStyle={styles.historyScrollContent}>
              {(course?.holes || []).map((hole, index) => {
                const shots = loggedShotsByHole[index] || [];
                const expanded = historyHoleIndex === index;
                return (
                  <View key={`hist-${hole.hole}`} style={[styles.historyHoleBlock, index === currentHoleIndex && styles.historyHoleCurrent]}>
                    <TouchableOpacity
                      style={styles.historyHoleRow}
                      onPress={() => setHistoryHoleIndex(expanded ? null : index)}
                    >
                      <Text style={styles.historyHoleText}>Hole {hole.hole}</Text>
                      <View style={styles.historyHoleMeta}>
                        <Text style={shots.length ? styles.historyHoleCount : styles.historyHoleEmpty}>
                          {shots.length ? `${shots.length} shots` : '—'}
                        </Text>
                        <Ionicons
                          name={expanded ? 'chevron-up' : 'chevron-down'}
                          size={14}
                          color={shots.length ? '#4CAF7D' : 'rgba(255,255,255,0.25)'}
                        />
                      </View>
                    </TouchableOpacity>
                    {expanded && shots.map((shot) => (
                      <View key={shot.id} style={styles.historyShotRow}>
                        <View style={[styles.historyShotBadge, shot.color ? { backgroundColor: shot.color } : null]}>
                          <Text style={styles.historyShotBadgeText}>{shot.num}</Text>
                        </View>
                        <View style={styles.historyShotCopy}>
                          <Text style={styles.historyShotClub}>{shot.abbr}</Text>
                          <Text style={styles.historyShotYards}>{shot.playingYards ? `${shot.playingYards}y` : shot.actualYards ? `${shot.actualYards}y` : '—'}</Text>
                        </View>
                        {shot.lie ? (
                          <View style={styles.historyLieWrap}>
                            <View style={[styles.historyLieDot, shot.lieColor ? { backgroundColor: shot.lieColor } : null]} />
                            <Text style={[styles.historyLieText, shot.lieColor ? { color: shot.lieColor } : null]}>{shot.lie}</Text>
                          </View>
                        ) : (
                          <Text style={styles.historyNoGps}>manual entry</Text>
                        )}
                      </View>
                    ))}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showGreenSheet} transparent animationType="fade" onRequestClose={() => setShowGreenSheet(false)}>
        <View style={styles.historyBackdrop}>
          <TouchableOpacity style={styles.historyScrim} activeOpacity={1} onPress={() => setShowGreenSheet(false)} />
          <View style={styles.historySheet}>
            <View style={styles.historyHandle} />
            <View style={styles.historyHeader}>
              <View>
                <Text style={styles.historyTitle}>Green Markers</Text>
                <Text style={styles.historySubtitle}>Log the first putt, hole location, and putts on this green.</Text>
              </View>
              <TouchableOpacity style={styles.historyClose} onPress={() => setShowGreenSheet(false)}>
                <Text style={styles.historyCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.greenSheetBody}>
              <Text style={styles.greenSheetLabel}>Hole Location</Text>
              <View style={styles.greenChoiceRow}>
                {[
                  { key: 'front', label: 'Front' },
                  { key: 'middle', label: 'Middle' },
                  { key: 'back', label: 'Back' },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.key}
                    style={[
                      styles.greenChoiceChip,
                      currentHoleSummary.pinLocation === option.key && styles.greenChoiceChipActive,
                    ]}
                    onPress={() => setHoleSummariesByHole((prev) => ({
                      ...prev,
                      [currentHoleIndex]: {
                        ...currentHoleSummary,
                        pinLocation: option.key,
                      },
                    }))}
                  >
                    <Text style={[
                      styles.greenChoiceText,
                      currentHoleSummary.pinLocation === option.key && styles.greenChoiceTextActive,
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.greenSheetLabel}>First Putt Distance</Text>
              <View style={styles.greenStepperRow}>
                <TouchableOpacity
                  style={styles.greenStepperButton}
                  onPress={() => setHoleSummariesByHole((prev) => ({
                    ...prev,
                    [currentHoleIndex]: {
                      ...currentHoleSummary,
                      firstPuttDistance: Math.max(0, (currentHoleSummary.firstPuttDistance ?? 0) - 5),
                    },
                  }))}
                >
                  <Text style={styles.greenStepperButtonText}>-5</Text>
                </TouchableOpacity>
                <View style={styles.greenStepperValueWrap}>
                  <Text style={styles.greenStepperValue}>{currentHoleSummary.firstPuttDistance ?? 0}</Text>
                  <Text style={styles.greenStepperUnit}>ft</Text>
                </View>
                <TouchableOpacity
                  style={styles.greenStepperButton}
                  onPress={() => setHoleSummariesByHole((prev) => ({
                    ...prev,
                    [currentHoleIndex]: {
                      ...currentHoleSummary,
                      firstPuttDistance: (currentHoleSummary.firstPuttDistance ?? 0) + 5,
                    },
                  }))}
                >
                  <Text style={styles.greenStepperButtonText}>+5</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.greenSheetLabel}>Putts</Text>
              <View style={styles.greenChoiceRow}>
                {[0, 1, 2, 3, 4].map((putts) => (
                  <TouchableOpacity
                    key={`putts-${putts}`}
                    style={[
                      styles.greenChoiceChip,
                      currentPuttValue === putts && styles.greenChoiceChipActive,
                    ]}
                    onPress={() => setHoleSummariesByHole((prev) => ({
                      ...prev,
                      [currentHoleIndex]: {
                        ...currentHoleSummary,
                        putts,
                      },
                    }))}
                  >
                    <Text style={[
                      styles.greenChoiceText,
                      currentPuttValue === putts && styles.greenChoiceTextActive,
                    ]}>
                      {putts}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity style={styles.greenDoneButton} onPress={() => setShowGreenSheet(false)}>
                <Text style={styles.greenDoneButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <HoleReviewModal
        visible={reviewHole != null}
        onClose={() => setReviewHole(null)}
        hole={reviewHole != null ? (() => {
          const holeData = visibleHoles.find(h => (h?.hole ?? h?.number) === reviewHole);
          const shots = loggedShotsByHole[reviewHole - 1] || [];
          const summary = holeSummariesByHole[reviewHole - 1] || {};
          const derived = deriveGreenSummary(shots, summary, holeData?.par);
          return {
            hole: reviewHole,
            par: holeData?.par ?? 4,
            hcp: holeData?.hcp ?? holeData?.handicap ?? 0,
            score: summary.score ?? (shots.length > 0 ? shots.length : (summary.putts != null ? 1 : 0)) + (summary.putts || 0) + shots.reduce((sum, s) => sum + (s.penaltyStrokes || 0), 0),
            putts: summary.putts ?? derived.putts ?? 0,
            shots,
            conditions: summary.conditions ?? null,
            playingYardage: summary.playingYardage ?? null,
            gpsDistance: summary.gpsDistance ?? null,
            windAdj: summary.windAdj ?? null,
            tempAdj: summary.tempAdj ?? null,
            elevAdj: summary.elevAdj ?? null,
            mapSnapshotUrl: null,
            flags: holeFlagsByHole[reviewHole - 1] || {},
          };
        })() : null}
        courseName={courseName || course?.courseName}
        isEditable={true}
        onScoreChange={(val) => {
          setHoleSummariesByHole(prev => ({
            ...prev,
            [reviewHole - 1]: { ...prev[reviewHole - 1], score: val },
          }));
        }}
        onPuttsChange={(val) => {
          setHoleSummariesByHole(prev => ({
            ...prev,
            [reviewHole - 1]: { ...prev[reviewHole - 1], putts: val },
          }));
        }}
        onDeleteShot={(shot) => {
          setLoggedShotsByHole(prev => {
            const remaining = (prev[reviewHole - 1] || []).filter(s => s.id !== shot.id);
            return {
              ...prev,
              [reviewHole - 1]: remaining.map((s, i) => ({ ...s, num: i + 1 })),
            };
          });
        }}
      />

      <ScorecardSheet
        visible={showScorecard}
        onClose={() => setShowScorecard(false)}
        holes={scorecardHoles}
        currentHole={(currentHole?.hole ?? currentHole?.number ?? currentHoleIndex + 1)}
        courseName={courseName || course?.courseName || 'GPS Round'}
        teeName={selectedTee?.name || teeColor}
        onReviewHole={(holeNum) => {
          setShowScorecard(false);
          setReviewHole(holeNum);
        }}
        onHolePress={(holeNum) => {
          // Future hole: jump navigation prompt
          setShowScorecard(false);
          Alert.alert(
            `Jump to hole ${holeNum}?`,
            undefined,
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: `Go to hole ${holeNum}`,
                onPress: () => handleSelectHole(holeWindow.custom
                  ? routeHoleNumbers.indexOf(holeNum)
                  : holeNum - 1),
              },
            ],
          );
        }}
        onScoreChange={(holeNum, val) => {
          const idx = holeNum - 1;
          setHoleSummariesByHole(prev => ({
            ...prev,
            [idx]: { ...prev[idx], score: val },
          }));
        }}
        onPuttsChange={(holeNum, val) => {
          const idx = holeNum - 1;
          setHoleSummariesByHole(prev => ({
            ...prev,
            [idx]: { ...prev[idx], putts: val },
          }));
        }}
      />

      {/* Shot action sheet (long press on shot marker) */}
      <Modal visible={showShotMenu} transparent animationType="fade" onRequestClose={() => setShowShotMenu(false)}>
        <TouchableOpacity style={styles.shotMenuBackdrop} activeOpacity={1} onPress={() => setShowShotMenu(false)}>
          <View style={styles.shotMenuSheet}>
            <Text style={styles.shotMenuTitle}>Shot {selectedShot?.num} — {selectedShot?.abbr || selectedShot?.club || '?'}</Text>
            <TouchableOpacity
              style={styles.shotMenuOption}
              onPress={() => {
                setShowShotMenu(false);
                setInsertAfterShotId(selectedShot?.id);
                setMeasurePin(null);
                overlayRef.current?.startShotEntry?.();
              }}
            >
              <Ionicons name="add-circle-outline" size={18} color="#1ac855" />
              <Text style={styles.shotMenuOptionText}>Insert shot after</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.shotMenuOption}
              onPress={() => {
                setShowShotMenu(false);
                setEditingShot(selectedShot);
                setShowClubEditSheet(true);
              }}
            >
              <Ionicons name="create-outline" size={18} color="#60A5FA" />
              <Text style={styles.shotMenuOptionText}>Change club</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.shotMenuOption}
              onPress={() => {
                setShowShotMenu(false);
                setEditingShot(selectedShot);
                setMeasurePin(null);
                overlayRef.current?.startShotMoveEntry?.(selectedShot);
              }}
            >
              <Ionicons name="move-outline" size={18} color="#FBBF24" />
              <Text style={styles.shotMenuOptionText}>Move marker</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.shotMenuOption}
              onPress={() => {
                setShowShotMenu(false);
                Alert.alert(
                  'Delete shot?',
                  `Delete shot ${selectedShot?.num} (${selectedShot?.abbr || selectedShot?.club || '?'})? Remaining shots will be renumbered.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => deleteShotFromHole(currentHoleIndex, selectedShot?.id),
                    },
                  ]
                );
              }}
            >
              <Ionicons name="trash-outline" size={18} color="#EF4444" />
              <Text style={[styles.shotMenuOptionText, { color: '#EF4444' }]}>Delete shot</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shotMenuCancel} onPress={() => setShowShotMenu(false)}>
              <Text style={styles.shotMenuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Club edit sheet (change club on existing shot) */}
      <Modal visible={showClubEditSheet} transparent animationType="slide" onRequestClose={() => setShowClubEditSheet(false)}>
        <View style={styles.shotMenuBackdrop}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowClubEditSheet(false)} />
          <View style={styles.clubEditSheet}>
            <View style={styles.clubEditHeader}>
              <Text style={styles.clubEditTitle}>Change club — Shot {editingShot?.num}</Text>
              <TouchableOpacity onPress={() => setShowClubEditSheet(false)}>
                <Text style={styles.shotMenuCancelText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={{ padding: 16 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {activeBagClubs.map((club) => (
                  <TouchableOpacity
                    key={club}
                    style={[
                      styles.missedShotClubChip,
                      editingShot?.club === club && styles.missedShotClubChipActive,
                    ]}
                    onPress={() => {
                      updateShotOnHole(currentHoleIndex, editingShot.id, {
                        club,
                        abbr: clubAbbr(club),
                      });
                      setShowClubEditSheet(false);
                      setEditingShot(null);
                    }}
                  >
                    <Text style={styles.missedShotClubChipText}>{club}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <PreSaveReview
        visible={showPreSaveReview}
        onClose={() => setShowPreSaveReview(false)}
        flaggedHoles={flaggedForPreSave}
        onReviewHole={(holeNum) => {
          setShowPreSaveReview(false);
          setReviewHole(holeNum);
        }}
        onSave={() => {
          setShowPreSaveReview(false);
          if (pendingRoundPayload) onFinishRound?.(pendingRoundPayload);
        }}
      />
    </View>
  );
}

const stylesMap = {
  shotTrack: {
    lineColor: 'rgba(255,255,255,0.72)',
    lineWidth: 2,
    lineDasharray: [1.2, 1.2],
  },
  strategyLine: {
    lineColor: 'rgba(52,211,153,0.9)',
    lineWidth: 2.6,
    lineDasharray: [1.6, 1.1],
  },
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  screenShell: { flex: 1, backgroundColor: '#0a0a0a' },
  /** Top chrome: safe-area top inset applied here (not SafeAreaView). */
  gpsTopChromeWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: GPS_Z.TOP_CHROME,
  },
  /** HUD fills the screen; bottom safe area is applied inside GpsRoundHud (absolute bottom bar). */
  gpsHudWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: GPS_Z.HUD_WRAP,
  },
  topBarFrame: {
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 4,
    backgroundColor: 'transparent',
  },
  topBarCompact: {
    paddingTop: 2,
    paddingBottom: 2,
  },
  topBarCenter: { flex: 1, paddingHorizontal: 8 },
  courseName: { color: colors.text.primary, fontSize: 13, fontWeight: '600', letterSpacing: -0.2 },
  courseNameCompact: { fontSize: 12 },
  subMeta: { color: colors.text.secondary, fontSize: 10, marginTop: 1 },
  subMetaCompact: { fontSize: 9, marginTop: 0 },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg.elevated,
  },
  iconBtnCompact: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  iconBtnActive: {
    borderWidth: 1,
    borderColor: colors.brand.primaryBorder,
  },
  scorePill: {
    minWidth: 42,
    height: 28,
    borderRadius: 8,
    paddingHorizontal: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorePillCompact: {
    height: 26,
    paddingHorizontal: 8,
  },
  scorePillMuted: {
    backgroundColor: colors.bg.elevated,
    borderColor: colors.border.subtle,
  },
  scorePillHot: {
    backgroundColor: colors.bg.elevated,
    borderColor: colors.border.subtle,
  },
  scorePillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  scorePillTextMuted: {
    color: colors.text.secondary,
  },
  scorePillTextHot: {
    color: colors.semantic.error,
  },
  holeHeaderFrame: {
    justifyContent: 'center',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  holeSelectorFrame: {
    justifyContent: 'center',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  mapWrap: { flex: 1, minHeight: 0, position: 'relative' },
  bottomActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 10,
    backgroundColor: 'transparent',
  },
  yardageBarFrame: {
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  map: { flex: 1 },
  weatherStrip: {
    position: 'absolute',
    top: 20,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    zIndex: GPS_Z.MAP_WEATHER_STRIP,
  },
  weatherText: {
    color: '#F3F4F6',
    fontSize: 11,
    fontWeight: '700',
  },
  weatherDivider: {
    width: 1,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginHorizontal: 6,
  },
  missedShotBanner: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 42,
    backgroundColor: '#0F172A',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    zIndex: GPS_Z.MISSED_SHOT_BANNER,
  },
  missedShotBannerTitle: {
    color: colors.text.primary,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  missedShotBannerText: {
    color: colors.text.primary,
    fontSize: 12,
    lineHeight: 18,
  },
  missedShotBannerActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  missedShotPrimaryBtn: {
    backgroundColor: colors.brand.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  missedShotPrimaryBtnText: {
    color: '#06281E',
    fontSize: 12,
    fontWeight: '700',
  },
  missedShotSecondaryBtn: {
    borderColor: colors.border.subtle,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  missedShotSecondaryBtnText: {
    color: colors.text.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  missedShotFieldRow: {
    marginTop: 8,
  },
  missedShotFieldLabel: {
    color: colors.text.secondary,
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
  },
  missedShotClubRow: {
    flexDirection: 'row',
    gap: 6,
  },
  missedShotClubChip: {
    borderColor: colors.border.subtle,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  missedShotClubChipActive: {
    borderColor: colors.brand.primary,
    backgroundColor: colors.brand.primaryMuted,
  },
  missedShotClubChipText: {
    color: colors.text.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  distanceBadge: {
    position: 'absolute',
    right: 10,
    top: 8,
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderRadius: radius.md + 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: 132,
    alignItems: 'center',
    zIndex: GPS_Z.MAP_DISTANCE_BADGE,
  },
  distanceBadgeLabel: {
    color: colors.text.tertiary,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  distanceFromTee: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.5,
    marginTop: -2,
  },
  distGps: {
    color: 'rgba(255,255,255,0.30)',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  distanceValue: {
    color: colors.text.primary,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 24,
    letterSpacing: -0.5,
  },
  distanceUnit: {
    color: colors.text.secondary,
    fontSize: 9,
    letterSpacing: 1,
    marginBottom: 3,
  },
  distanceAdjust: {
    color: colors.brand.primary,
    fontSize: 8,
    fontWeight: '600',
    lineHeight: 11,
    textAlign: 'center',
  },
  playingDetailsCard: {
    position: 'absolute',
    right: GPS_MAP_OVERLAY.PLAYING_DETAILS_RIGHT,
    top: GPS_MAP_OVERLAY.PLAYING_DETAILS_TOP,
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderRadius: radius.md + 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    zIndex: GPS_Z.TOP_CHROME,
  },
  playingDetailRow: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  playingDetailDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  playingDetailLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  playingDetailValue: {
    color: '#1ac855',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 1,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  shotRow: {
    position: 'absolute',
    bottom: GPS_BAR.BOTTOM_ACTION - GPS_MAP_OVERLAY.SHOT_ROW_GAP_ABOVE_BAR,
    left: GPS_MAP_OVERLAY.SHOT_ROW_LEFT,
    right: GPS_MAP_OVERLAY.SHOT_ROW_RIGHT_CLEAR,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    zIndex: GPS_Z.MAP_WEATHER_STRIP,
  },
  shotPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.bg.secondary,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  shotNumber: {
    width: 14,
    height: 14,
    borderRadius: 3,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shotNumberText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
  },
  shotClubText: {
    color: '#BBBBBB',
    fontSize: 10,
    fontWeight: '600',
  },
  shotLieIcon: {
    fontSize: 9,
    color: colors.brand.primary,
    marginLeft: 2,
  },
  clearShotsButton: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  clearShotsButtonText: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 10,
    fontWeight: '700',
  },
  lieToast: {
    position: 'absolute',
    left: 50,
    right: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    zIndex: GPS_Z.LIE_TOAST,
  },
  lieToastDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand.primary,
  },
  lieToastText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  lieToastSubtext: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 11,
  },
  gpsWarmupBanner: {
    position: 'absolute',
    top: 120,
    alignSelf: 'center',
    left: 60,
    right: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(26,200,85,0.25)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    zIndex: GPS_Z.TOP_CHROME + 1,
  },
  gpsWarmupText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },
  // Crosshair styles removed — shot placement is tap-only now
  nudgeCard: {
    position: 'absolute',
    left: GPS_MAP_OVERLAY.LEGACY_NUDGE_INSET,
    right: GPS_MAP_OVERLAY.LEGACY_NUDGE_INSET,
    bottom: GPS_MAP_OVERLAY.FLOATING_PANEL_BOTTOM_OFFSET,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    paddingVertical: 10,
    paddingRight: 12,
    zIndex: GPS_Z.MAP_LEGACY_NUDGE,
  },
  nudgeCardGreen: {
    borderColor: colors.brand.primaryBorder,
  },
  nudgeCardAmber: {
    borderColor: 'rgba(251,191,36,0.28)',
  },
  nudgeCardRed: {
    borderColor: 'rgba(248,113,113,0.28)',
  },
  nudgeAccent: {
    width: 3,
    alignSelf: 'stretch',
    marginRight: 10,
    borderTopLeftRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
  },
  nudgeAccentGreen: {
    backgroundColor: colors.brand.primary,
  },
  nudgeAccentAmber: {
    backgroundColor: '#FBBF24',
  },
  nudgeAccentRed: {
    backgroundColor: '#F87171',
  },
  nudgeCopy: {
    flex: 1,
  },
  nudgeTitle: {
    color: colors.text.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  nudgeBody: {
    color: '#E5E7EB',
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  nudgeSupport: {
    color: colors.text.tertiary,
    fontSize: 10,
    marginTop: 4,
  },
  rightMapStack: {
    position: 'absolute',
    right: GPS_RIGHT_STACK.EDGE,
    alignItems: 'flex-end',
    gap: GPS_RIGHT_STACK.GAP,
    zIndex: GPS_Z.RIGHT_MAP_STACK,
  },
  mapBtnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  mapBtnPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(6,6,6,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  mapBtnPillActive: {
    backgroundColor: 'rgba(26,200,85,0.18)',
    borderColor: 'rgba(26,200,85,0.5)',
  },
  mapBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  mapOffCourseBadge: {
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.5)',
    backgroundColor: 'rgba(248,113,113,0.18)',
  },
  mapOffCourseText: {
    color: '#F87171',
    fontSize: 10,
    fontWeight: '600',
  },
  greenPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(6,6,6,0.82)',
    borderWidth: 1,
    borderColor: colors.brand.primaryBorder,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  greenPillActive: {
    backgroundColor: 'rgba(26,200,85,0.22)',
    borderColor: 'rgba(26,200,85,0.6)',
  },
  greenPillText: {
    color: colors.brand.primary,
    fontSize: rs(11),
    fontWeight: '700',
  },
  greenPillTextActive: {
    color: '#fff',
  },
  aimPill: {
    backgroundColor: 'rgba(4,12,8,0.9)',
  },
  overviewPill: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderColor: 'rgba(255,255,255,0.22)',
  },
  dispersionPill: {
    position: 'relative',
  },
  dispersionCountBadge: {
    position: 'absolute',
    top: -5,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dispersionCountText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '800',
    lineHeight: 10,
  },
  dispersionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    opacity: 0.82,
  },
  dispersionInsightChip: {
    position: 'absolute',
    top: 124,
    left: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    zIndex: GPS_Z.MAP_DISTANCE_BADGE,
  },
  dispersionInsightText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
  },
  greenMarkButton: {
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  greenMarkText: {
    color: '#E5E7EB',
    fontSize: 11,
    fontWeight: '600',
  },
  greenDistancePill: {
    backgroundColor: 'rgba(4,12,8,0.96)',
    borderColor: 'rgba(26,200,85,0.65)',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  greenDistancePillFront: {
    marginTop: 20,
    marginLeft: -24,
  },
  greenDistancePillMiddle: {
    marginTop: -22,
  },
  greenDistancePillBack: {
    marginTop: -24,
    marginLeft: 24,
  },
  greenDistancePillText: {
    color: '#ECFDF5',
    fontSize: 9,
    fontWeight: '800',
  },
  selectedTeeMarker: {
    width: 16,
    height: 16,
    borderWidth: 2,
    transform: [{ rotate: '45deg' }],
  },
  routeLabelWrap: {
    width: 50,
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -16,
  },
  routeLabelPill: {
    backgroundColor: 'rgba(5,10,20,0.88)',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  routeLabelText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  currentShotPill: {
    width: 88,
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 14,
    paddingHorizontal: 9,
    paddingVertical: 8,
    alignItems: 'center',
  },
  currentShotLabel: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 18,
  },
  currentShotYards: {
    color: colors.text.primary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  currentShotLie: {
    color: colors.text.secondary,
    fontSize: 9,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
  },
  puttStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 14,
    paddingHorizontal: 7,
    paddingVertical: 7,
    minWidth: 112,
    justifyContent: 'center',
  },
  puttStepperButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  puttStepperButtonText: {
    color: colors.text.primary,
    fontSize: 20,
    fontWeight: '700',
  },
  puttStepperValueWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    paddingHorizontal: 6,
  },
  puttStepperValue: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 18,
  },
  puttStepperLabel: {
    color: colors.text.secondary,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 2,
  },
  addShotTrayButton: {
    width: 96,
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: 2,
  },
  addShotTrayButtonActive: {
    borderColor: colors.brand.primaryBorder,
    backgroundColor: colors.brand.primaryMuted,
  },
  addShotTrayButtonText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  mapShotBadge: {
    minWidth: 36,
    height: 28,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,10,8,0.9)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  mapShotBadgeActive: {
    borderColor: colors.brand.primaryBorder,
  },
  ghostMarker: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostDiamond: {
    width: 14,
    height: 14,
    backgroundColor: 'rgba(96,165,250,0.3)',
    borderWidth: 2,
    borderColor: 'rgba(96,165,250,0.6)',
    transform: [{ rotate: '45deg' }],
  },
  planNoteChip: {
    position: 'absolute',
    left: 10,
    bottom: GPS_MAP_OVERLAY.PLAN_NOTE_CHIP_BOTTOM,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15,20,25,0.85)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.3)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    maxWidth: 200,
    zIndex: GPS_Z.TOP_CHROME,
  },
  planNoteText: {
    color: '#D1D5DB',
    fontSize: 11,
    flexShrink: 1,
  },
  planCompareChip: {
    position: 'absolute',
    left: 10,
    bottom: GPS_MAP_OVERLAY.PLAN_COMPARE_CHIP_BOTTOM,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15,20,25,0.85)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.3)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    zIndex: GPS_Z.TOP_CHROME,
  },
  planCompareLabel: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '600',
  },
  planCompareValue: {
    color: '#60A5FA',
    fontSize: 12,
    fontWeight: '700',
  },
  planCompareSep: {
    color: '#6B7280',
    fontSize: 10,
    marginHorizontal: 2,
  },
  measurePinWrap: {
    alignItems: 'center',
  },
  measurePinBadge: {
    backgroundColor: 'rgba(10,12,14,0.96)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(26,200,85,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'flex-start',
    marginBottom: 6,
    gap: 3,
    minWidth: 178,
    shadowColor: '#000',
    shadowOpacity: 0.32,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  measurePinFromYou: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '600',
  },
  measurePinText: {
    color: '#ECFDF5',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  measurePinToGreenText: {
    color: '#FCD34D',
    fontSize: 13,
    fontWeight: '800',
  },
  measurePinPlaysLikeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  measurePinPlaysLikeText: {
    color: '#86EFAC',
    fontSize: 12,
    fontWeight: '800',
  },
  measurePinTag: {
    backgroundColor: 'rgba(26,200,85,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(26,200,85,0.28)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  measurePinTagText: {
    color: '#A7F3D0',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  measurePinActions: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'stretch',
  },
  measurePinActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  measurePinActionBtnActive: {
    backgroundColor: '#86EFAC',
    borderColor: '#86EFAC',
  },
  measurePinActionText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  measurePinActionTextActive: {
    color: '#0f1419',
  },
  measurePinDismissBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginLeft: 'auto',
  },
  measurePinDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.5)',
  },
  aimModeDimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.08)',
    zIndex: GPS_Z.MAP_DISTANCE_BADGE - 1,
  },
  aimHintBanner: {
    position: 'absolute',
    top: 122,
    left: 14,
    right: 14,
    alignItems: 'center',
    zIndex: GPS_Z.TOP_CHROME + 2,
  },
  aimHintText: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
    backgroundColor: 'rgba(5,10,20,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(26,200,85,0.35)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  mapShotClubDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.brand.primary,
    marginRight: 4,
  },
  mapShotClubText: {
    color: colors.text.primary,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 14,
    letterSpacing: 0.1,
  },
  mapShotYardsText: {
    color: colors.text.secondary,
    fontSize: 10,
    fontWeight: '600',
    marginLeft: 4,
  },
  clubEditSheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingBottom: 22,
  },
  clubEditHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  clubEditTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  pinHint: {
    position: 'absolute',
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: GPS_Z.TOP_CHROME,
  },
  pinHintText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '500',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
  },
  shotMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  shotMenuSheet: {
    width: '90%',
    maxWidth: 340,
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    marginBottom: 40,
    overflow: 'hidden',
  },
  shotMenuTitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  shotMenuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  shotMenuOptionText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
  },
  shotMenuCancel: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  shotMenuCancelText: {
    color: '#9CA3AF',
    fontSize: 16,
    fontWeight: '600',
  },
  playerDotWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Pin the flag base near the green center (MarkerView anchors center of view). */
  greenFlagMarker: {
    alignItems: 'center',
    justifyContent: 'flex-end',
    width: 22,
    height: 24,
    marginBottom: 2,
  },
  greenFlagIcon: {
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  greenPuttBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(4,12,8,0.94)',
    borderColor: 'rgba(26,200,85,0.65)',
    borderWidth: 1,
    borderRadius: 999,
    minWidth: 48,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  greenPuttBadgeLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 0.7,
    lineHeight: 8,
  },
  greenPuttBadgeValue: {
    color: '#1ac855',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 15,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  greenPuttBadgeSub: {
    color: 'rgba(255,255,255,0.66)',
    fontSize: 8,
    fontWeight: '600',
    lineHeight: 9,
    marginTop: 1,
  },
  playerPulseRing: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#1ac855',
  },
  playerCoreDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#1ac855',
    borderWidth: 2.5,
    borderColor: '#ffffff',
  },
  mapboxWordmark: {
    position: 'absolute',
    left: GPS_MAPBOX.LOGO_ATTRIBUTION_EDGE,
    bottom: GPS_BAR.BOTTOM_ACTION + GPS_ABOVE_BAR.WORDMARK_STATIC,
    paddingHorizontal: 2,
    paddingVertical: 1,
  },
  mapboxWordmarkText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 8,
    fontWeight: '500',
    letterSpacing: 0.4,
  },
  loadingText: { color: '#9CA3AF', marginTop: 12, fontSize: 14 },
  helperBar: {
    backgroundColor: colors.bg.primary,
    paddingTop: 4,
    paddingBottom: 10,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
  helperText: {
    color: 'rgba(255,255,255,0.20)',
    fontSize: 10,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  ydMarkerWrap: {
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ydLine: {
    position: 'absolute',
    width: 32,
    borderTopWidth: 2,
    opacity: 0.8,
  },
  ydDiamond: {
    width: 16,
    height: 16,
    borderWidth: 2,
    transform: [{ rotate: '45deg' }],
  },
  ydNum: {
    position: 'absolute',
    fontSize: 8,
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
  },
  carryWrap: {
    width: 90,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -24,
  },
  carryPill: {
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  carryTxt: {
    fontSize: 8,
    fontWeight: '700',
  },
  carrySuffix: {
    fontSize: 7,
    color: 'rgba(255,255,255,0.70)',
  },
  layupWrap: {
    width: 90,
    minHeight: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -18,
  },
  layupWrapSecondary: {
    marginTop: -38,
  },
  layupDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#34D399',
    borderWidth: 2,
    borderColor: '#052E2B',
    marginBottom: 4,
  },
  layupDotSecondary: {
    backgroundColor: '#22C55E',
  },
  layupPill: {
    backgroundColor: 'rgba(5,46,43,0.92)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.45)',
  },
  layupPillSecondary: {
    backgroundColor: 'rgba(6,78,59,0.94)',
  },
  layupTag: {
    color: '#86EFAC',
    fontSize: 8,
    fontWeight: '800',
    marginBottom: 2,
    textAlign: 'center',
  },
  layupText: {
    color: '#D1FAE5',
    fontSize: 9,
    fontWeight: '700',
  },
  historyBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  historyScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  historySheet: {
    backgroundColor: colors.bg.primary,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: colors.border.subtle,
    maxHeight: '72%',
  },
  historyHandle: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignSelf: 'center',
    marginTop: 10,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
  },
  historyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  historySubtitle: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 11,
    marginTop: 2,
  },
  historyClose: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyCloseText: {
    color: 'rgba(255,255,255,0.40)',
    fontSize: 12,
  },
  historyScroll: {
    flex: 1,
  },
  historyScrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 24,
  },
  suggestionModalScroll: {
    maxHeight: '75%',
  },
  suggestionModalBody: {
    paddingHorizontal: 18,
    paddingBottom: 24,
    gap: 14,
  },
  suggestionEmptyNote: {
    backgroundColor: 'rgba(15,23,42,0.6)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    padding: 12,
  },
  suggestionEmptyTitle: {
    color: '#F8FAFC',
    fontSize: 13,
    fontWeight: '800',
  },
  suggestionEmptyBody: {
    color: '#94A3B8',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 4,
  },
  clubTable: {
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  clubTableHeader: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: 'rgba(15,23,42,0.55)',
  },
  clubTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148,163,184,0.12)',
  },
  clubTableRowActive: {
    backgroundColor: 'rgba(16,185,129,0.12)',
  },
  clubTableClub: {
    color: '#CBD5E1',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  clubTableClubActive: {
    color: '#34D399',
    fontWeight: '800',
  },
  clubTableMeta: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginRight: 10,
    minWidth: 80,
    justifyContent: 'flex-end',
  },
  clubTableYards: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '700',
  },
  clubTableYardsActive: {
    color: '#34D399',
  },
  clubTableDiff: {
    color: '#64748B',
    fontSize: 10,
    fontWeight: '600',
  },
  clubTableConfidence: {
    color: '#64748B',
    fontSize: 10,
    width: 90,
    textAlign: 'right',
  },
  suggestionModalCta: {
    marginTop: 8,
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  suggestionModalCtaText: {
    color: '#0f1419',
    fontSize: 14,
    fontWeight: '800',
  },
  suggestionModalHint: {
    color: '#64748B',
    fontSize: 10,
    textAlign: 'center',
  },
  greenSheetBody: {
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  greenSheetLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.1,
    marginBottom: 10,
    marginTop: 14,
    textTransform: 'uppercase',
  },
  greenChoiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  greenChoiceChip: {
    minWidth: 72,
    borderRadius: 10,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  greenChoiceChipActive: {
    backgroundColor: colors.brand.primaryMuted,
    borderColor: colors.brand.primary,
  },
  greenChoiceText: {
    color: '#CBD5E1',
    fontSize: 12,
    fontWeight: '600',
  },
  greenChoiceTextActive: {
    color: '#FFFFFF',
  },
  greenStepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  greenStepperButton: {
    width: 46,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  greenStepperButtonText: {
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '700',
  },
  greenStepperValueWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  greenStepperValue: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
  },
  greenStepperUnit: {
    color: colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  greenDoneButton: {
    marginTop: 18,
    backgroundColor: colors.brand.primary,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 13,
  },
  greenDoneButtonText: {
    color: colors.text.inverse,
    fontSize: 14,
    fontWeight: '800',
  },
  historyHoleBlock: {
    borderLeftWidth: 2,
    borderLeftColor: 'transparent',
    paddingLeft: 10,
  },
  historyHoleCurrent: {
    borderLeftColor: colors.brand.primary,
  },
  historyHoleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  historyHoleText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  historyHoleMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyHoleCount: {
    color: colors.brand.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  historyHoleEmpty: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 12,
    fontWeight: '600',
  },
  historyShotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 24,
    paddingBottom: 10,
    gap: 10,
  },
  historyShotBadge: {
    width: 18,
    height: 18,
    borderRadius: 4,
    backgroundColor: colors.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyShotBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
  },
  historyShotCopy: {
    flex: 1,
  },
  historyShotClub: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  historyShotYards: {
    color: 'rgba(255,255,255,0.30)',
    fontSize: 11,
    marginTop: 1,
  },
  historyLieWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  historyLieDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brand.primary,
  },
  historyLieText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.brand.primary,
  },
  historyNoGps: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 10,
    fontStyle: 'italic',
  },
  fallbackCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { color: '#FCA5A5', textAlign: 'center', lineHeight: 20, marginBottom: 14 },
  backBtn: {
    backgroundColor: '#1F2937',
    borderColor: '#374151',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  backBtnText: { color: '#E5E7EB', fontWeight: '600' },
});

export default GpsRoundScreen;
