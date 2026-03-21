import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { getCourse, saveCourse } from '../services/courseCache';
import { fetchCourseHolesFromBackend } from '../services/golfApi';
import { haversineYards } from '../services/haversine';
import GpsRoundHud from '../components/gps/GpsRoundHud';
import GpsGlassChrome from '../components/gps/GpsGlassChrome';
import { MAPBOX_PUBLIC_TOKEN } from '../config/mapbox';
import { getHoleFramingCoords, getStaticMapCameraConfig } from '../services/mapFraming';
import { buildInRoundNudge } from '../services/inRoundNudgeService';
import { getSuggestion } from '../services/courseStatsService';
import { buildEffectiveClubDistanceMap, getActiveBagClubs, getBestClubForPar3, getClubAverages } from '../services/clubDistanceService';
import { buildHazardCarryModel, buildHoleStrategyModel, getPreferredLeaveYards } from '../services/holeStrategyModel';
import ReportModal from '../components/ReportModal';
import { isGpsDistanceSuspect, isTeeMarkerSuspect } from '../services/reportDetection';
import { getRounds } from '../services/roundsService';
import { getUserProfile } from '../services/userService';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { elevationDiffToYardageAdjustment, getElevationDifferenceFeet } from '../services/weatherService';
import { getSelectedTeeCoordinates } from '../utils/holeUtils';
import { colors, radius, spacing } from '../theme/tokens';
import { GPS_ABOVE_BAR, GPS_COACHING, GPS_WEB_PREVIEW } from '../constants/gpsLayout';

const MAPBOX_STATIC_MAX_DIMENSION = 1280;

function getStaticImageSize(imageWidth, imageHeight) {
  const width = Math.max(1, Math.round(imageWidth || 0));
  const height = Math.max(1, Math.round(imageHeight || 0));
  const maxDimension = Math.max(width, height);
  if (maxDimension <= MAPBOX_STATIC_MAX_DIMENSION) {
    return { width, height };
  }
  const scale = MAPBOX_STATIC_MAX_DIMENSION / maxDimension;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function buildGreenStaticMapRequest(greenPoi, imageWidth, imageHeight) {
  if (!MAPBOX_PUBLIC_TOKEN || !greenPoi) return null;
  const size = getStaticImageSize(imageWidth, imageHeight);
  return {
    url: `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${greenPoi.Longitude},${greenPoi.Latitude},19.5,0/${size.width}x${size.height}?access_token=${encodeURIComponent(MAPBOX_PUBLIC_TOKEN)}&attribution=false`,
    ...size,
  };
}

const CLUB_OPTIONS = [
  { id: 'dr', abbr: 'Dr', name: 'Driver', yards: 240, color: '#F87171' },
  { id: '3w', abbr: '3W', name: '3 Wood', yards: 215, color: '#FB923C' },
  { id: '5i', abbr: '5i', name: '5 Iron', yards: 165, color: '#FBBF24' },
  { id: '7i', abbr: '7i', name: '7 Iron', yards: 142, color: '#A3E635' },
  { id: '8i', abbr: '8i', name: '8 Iron', yards: 130, color: '#34D399' },
  { id: '9i', abbr: '9i', name: '9 Iron', yards: 118, color: '#22D3EE' },
  { id: 'pw', abbr: 'PW', name: 'PW', yards: 105, color: '#60A5FA' },
  { id: 'gw', abbr: 'GW', name: 'GW', yards: 90, color: '#A78BFA' },
  { id: 'sw', abbr: 'SW', name: 'SW', yards: 75, color: '#E879F9' },
];

const PREVIEW_POINTS = {
  tee: { x: 0.52, y: 0.79 },
  greenFront: { x: 0.51, y: 0.18 },
  greenCenter: { x: 0.51, y: 0.15 },
  greenBack: { x: 0.51, y: 0.12 },
  water: { x: 0.28, y: 0.36 },
  fairwayBunker: { x: 0.39, y: 0.52 },
  greenBunker: { x: 0.58, y: 0.2 },
};

const PREVIEW_NUDGE_CONTEXT = {
  bestDistanceBand: { label: '75-100', count: 8, avgDelta: -0.3 },
  liePenalties: {
    Rough: { count: 7, deltaVsFairway: 0.9 },
    Sand: { count: 4, deltaVsFairway: 1.2 },
  },
  clubShortBias: {
    '7 Iron': { count: 6, shortPct: 48 },
  },
  saferTeeClub: { club: '3 Wood', fairwayPct: 71, avgDelta: 0.1 },
  holeMemory: {
    1: { missSide: 'right', approachMiss: null, approachBand: null, approachClub: null, saferTeeClub: '3 Wood', sampleCount: 3, approachSampleCount: 0, fairwayBunkerCount: 1 },
    6: { missSide: null, approachMiss: 'short', approachBand: '125-150', approachClub: '8 Iron', saferTeeClub: null, sampleCount: 3, approachSampleCount: 3, fairwayBunkerCount: 0 },
    8: { missSide: null, approachMiss: null, approachBand: null, approachClub: null, saferTeeClub: null, sampleCount: 2, approachSampleCount: 0, fairwayBunkerCount: 2 },
  },
  putting: {
    avgPutts: 2.1,
    longPuttThreePuttPct: 42,
    pinPutts: {
      front: { count: 2, avgPutts: 1.7 },
      middle: { count: 2, avgPutts: 2.0 },
      back: { count: 3, avgPutts: 2.5 },
    },
  },
};

const WEB_PADDING_RATIO = {
  top: 0.08,
  right: 0.1,
  bottom: 0.12,
  left: 0.1,
};
const MIN_WORLD_SPAN = 1e-6;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function getHazardPillOffsetStyle(hazard, index = 0) {
  const sideShift = hazard?.side === 'left' ? -34 : hazard?.side === 'right' ? 34 : 0;
  const rowLift = index % 2 === 1 ? -10 : 0;
  const greenLift = hazard?.kind === 'green-bunker' ? -12 : 0;
  return {
    marginLeft: -18 + sideShift,
    marginTop: -24 + rowLift + greenLift,
  };
}

function distanceBetweenPoints(a, b) {
  return Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0));
}

function getBestClub(targetYards) {
  if (!Number.isFinite(targetYards)) return CLUB_OPTIONS[3];
  return CLUB_OPTIONS.reduce((best, club) => (
    Math.abs(club.yards - targetYards) < Math.abs(best.yards - targetYards) ? club : best
  ), CLUB_OPTIONS[0]);
}

function normalizeClubLabel(label) {
  return String(label || '').trim().toLowerCase();
}

function normalizeDegrees(deg) {
  return ((deg % 360) + 360) % 360;
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

function computePreviewYardages(playerPoint, baseYardages) {
  const teeToCenter = Math.max(distanceBetweenPoints(PREVIEW_POINTS.tee, PREVIEW_POINTS.greenCenter), 0.001);
  const centerRatio = clamp(distanceBetweenPoints(playerPoint, PREVIEW_POINTS.greenCenter) / teeToCenter, 0, 1.12);
  const frontRatio = clamp(distanceBetweenPoints(playerPoint, PREVIEW_POINTS.greenFront) / teeToCenter, 0, 1.12);
  const backRatio = clamp(distanceBetweenPoints(playerPoint, PREVIEW_POINTS.greenBack) / teeToCenter, 0, 1.12);
  return {
    front: Math.max(0, Math.round((Number(baseYardages.front) || 0) * frontRatio)),
    center: Math.max(0, Math.round((Number(baseYardages.center) || 0) * centerRatio)),
    back: Math.max(0, Math.round((Number(baseYardages.back) || 0) * backRatio)),
  };
}

function getShotDistance(fromPoint, toPoint, baseCenterYards) {
  const teeToCenter = Math.max(distanceBetweenPoints(PREVIEW_POINTS.tee, PREVIEW_POINTS.greenCenter), 0.001);
  const ratio = clamp(distanceBetweenPoints(fromPoint, toPoint) / teeToCenter, 0.02, 1.12);
  return Math.max(1, Math.round((Number(baseCenterYards) || 0) * ratio));
}

function detectPreviewLie(point, hole) {
  if (distanceBetweenPoints(point, PREVIEW_POINTS.tee) < 0.05) {
    return { lie: 'Tee Box', color: '#60A5FA', showDot: true };
  }
  if (distanceBetweenPoints(point, PREVIEW_POINTS.greenCenter) < 0.065) {
    return { lie: 'Green', color: '#34D399', showDot: true };
  }
  if (extractHazardFlags(hole).water && distanceBetweenPoints(point, PREVIEW_POINTS.water) < 0.07) {
    return { lie: 'Water', color: '#60A5FA', showDot: true };
  }
  if (extractHazardFlags(hole).fairwayBunker && distanceBetweenPoints(point, PREVIEW_POINTS.fairwayBunker) < 0.06) {
    return { lie: 'Sand', color: '#FBBF24', showDot: true };
  }
  if (extractHazardFlags(hole).greenBunker && distanceBetweenPoints(point, PREVIEW_POINTS.greenBunker) < 0.05) {
    return { lie: 'Sand', color: '#FBBF24', showDot: true };
  }
  if (Math.abs(point.x - 0.5) <= 0.1) {
    return { lie: 'Fairway', color: '#4CAF7D', showDot: true };
  }
  return point.x < 0.5
    ? { lie: 'Left Rough', color: '#A3E635', showDot: true }
    : { lie: 'Right Rough', color: '#A3E635', showDot: true };
}

function toWorldX(lng) {
  return (lng + 180) / 360;
}

function toWorldY(lat) {
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = (clampedLat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}

function buildScreenProjection(hole) {
  const coords = getHoleFramingCoords(hole, null, { includeUser: false });
  if (!coords.length) return null;
  const worldPoints = coords.map(([lng, lat]) => ({ x: toWorldX(lng), y: toWorldY(lat) }));
  const minX = Math.min(...worldPoints.map((point) => point.x));
  const maxX = Math.max(...worldPoints.map((point) => point.x));
  const minY = Math.min(...worldPoints.map((point) => point.y));
  const maxY = Math.max(...worldPoints.map((point) => point.y));
  const spanX = Math.max(maxX - minX, MIN_WORLD_SPAN);
  const spanY = Math.max(maxY - minY, MIN_WORLD_SPAN);
  return {
    minX: minX - (spanX * WEB_PADDING_RATIO.left),
    maxX: maxX + (spanX * WEB_PADDING_RATIO.right),
    minY: minY - (spanY * WEB_PADDING_RATIO.top),
    maxY: maxY + (spanY * WEB_PADDING_RATIO.bottom),
  };
}

function projectLatLngToPercent(projection, lat, lng) {
  if (!projection || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const worldX = toWorldX(lng);
  const worldY = toWorldY(lat);
  return {
    x: clamp((worldX - projection.minX) / Math.max(projection.maxX - projection.minX, MIN_WORLD_SPAN), 0.02, 0.98),
    y: clamp((worldY - projection.minY) / Math.max(projection.maxY - projection.minY, MIN_WORLD_SPAN), 0.02, 0.98),
  };
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

function getHazardTags(hole) {
  const flags = extractHazardFlags(hole);
  const tags = [];
  if (flags.fairwayBunker) tags.push('FW Bunker');
  if (flags.greenBunker) tags.push('Green Bunker');
  if (flags.water) tags.push('Water');
  if (flags.dogleg) tags.push('Dogleg');
  return tags;
}

function interpolatePoint(start, end, ratio) {
  return {
    lat: start.lat + ((end.lat - start.lat) * ratio),
    lng: start.lng + ((end.lng - start.lng) * ratio),
  };
}

function isRouteWaypointReasonable(tee, green, point) {
  const latScale = 111_320;
  const lngScale = Math.cos((tee.lat * Math.PI) / 180) * 111_320;
  const b = {
    x: (green.lng - tee.lng) * lngScale,
    y: (green.lat - tee.lat) * latScale,
  };
  const p = {
    x: (point.lng - tee.lng) * lngScale,
    y: (point.lat - tee.lat) * latScale,
  };
  const ab2 = (b.x * b.x) + (b.y * b.y);
  if (ab2 === 0) return false;
  const t = ((p.x * b.x) + (p.y * b.y)) / ab2;
  const proj = { x: b.x * t, y: b.y * t };
  const dx = p.x - proj.x;
  const dy = p.y - proj.y;
  const corridorDistance = Math.sqrt((dx * dx) + (dy * dy));
  return t >= 0.15 && t <= 0.9 && corridorDistance <= 45;
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
  if (!Array.isArray(points) || points.length < 2 || !Number.isFinite(yardsFromGreen) || yardsFromGreen <= 0) return null;
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

  return [...grouped.entries()].map(([key, pois]) => {
    const yds = Number(key);
    const centerPoi = pois.find((poi) => String(poi?.SideOfFairway || '').toUpperCase() === 'C');
    if (centerPoi) return { yds, lat: centerPoi.Latitude, lng: centerPoi.Longitude };
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
  }).sort((a, b) => b.yds - a.yds);
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
  return [{ ...tee, kind: 'tee' }, ...routeWaypoints, { ...green, kind: 'green' }];
}

function getRouteLabels(routePoints) {
  if (routePoints.length < 3) return [];
  const green = routePoints[routePoints.length - 1];
  return routePoints.slice(1, -1).map((point, index) => ({
    id: `route-${index}`,
    lat: point.lat,
    lng: point.lng,
    yardsToGreen: Math.round(haversineYards(point.lat, point.lng, green.lat, green.lng)),
  }));
}

function getYardageMarkers(hole, teePoi, greenPoi, routePoints = []) {
  if (!hole || !teePoi || !greenPoi || hole.par === 3) return [];
  const colorMap = { 100: '#F87171', 150: '#FFFFFF', 250: '#60A5FA' };
  return [250, 150, 100]
    .map((yds) => {
      const point = interpolateAlongPolylineFromGreen(routePoints, yds);
      if (!point) return null;
      return { yds, color: colorMap[yds] || '#E5E7EB', lat: point.lat, lng: point.lng, synthetic: true };
    })
    .filter(Boolean)
    .sort((a, b) => b.yds - a.yds);
}

function getHazardCarryLabels(hole, yardages) {
  const labels = [];
  if (!hole) return labels;
  const flags = extractHazardFlags(hole);
  if (flags.fairwayBunker) {
    labels.push({ text: `${Math.max(110, Number(yardages.center) - 58 || 187)}y`, color: '#FBBF24', top: '52%', left: '39%' });
  }
  if (flags.greenBunker) {
    labels.push({ text: `${Math.max(70, Number(yardages.center) - 18 || 142)}y`, color: '#FBBF24', top: '20%', left: '58%' });
  }
  if (flags.water) {
    labels.push({ text: `${Math.max(90, Number(yardages.center) - 34 || 146)}y`, color: '#60A5FA', top: '36%', left: '28%' });
  }
  return labels;
}

function normalizeTeeName(name) {
  return String(name || '').trim().toLowerCase();
}

function getWindArrowRotation(degrees) {
  if (!Number.isFinite(degrees)) return '0deg';
  return `${(((degrees - 180) % 360) + 360) % 360}deg`;
}

function buildStaticMapRequest(hole, imageWidth, imageHeight) {
  if (!MAPBOX_PUBLIC_TOKEN || !hole) return null;
  const size = getStaticImageSize(imageWidth, imageHeight);
  const frame = getStaticMapCameraConfig(hole, size.width, size.height);
  if (!frame) return null;
  return {
    url: `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${frame.centerLng},${frame.centerLat},${frame.zoom},${frame.heading}/${frame.pixelWidth}x${frame.pixelHeight}?access_token=${encodeURIComponent(MAPBOX_PUBLIC_TOKEN)}&attribution=false`,
    width: frame.pixelWidth,
    height: frame.pixelHeight,
  };
}

function hasGpsHoleData(course) {
  const holes = Array.isArray(course?.holes) ? course.holes : [];
  return holes.some((hole) => {
    const tees = Array.isArray(hole?.tees) ? hole.tees : [];
    const pois = Array.isArray(hole?.pois) ? hole.pois : [];
    return tees.some((tee) => Number(tee?.yards) > 0) || pois.length > 0;
  });
}

export function WebGpsRoundPreview({
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
  onSwitchToManual,
}) {
  const safeAreaInsets = useContext(SafeAreaInsetsContext);
  const insets = safeAreaInsets || { top: 0, right: 0, bottom: 0, left: 0 };
  const { width, height } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cached, setCached] = useState(false);
  const [course, setCourse] = useState(null);
  const [currentHoleIndex, setCurrentHoleIndex] = useState(Math.max(0, (startingHole || 1) - 1));
  const [mapLoadError, setMapLoadError] = useState('');
  const [mapImageUri, setMapImageUri] = useState('');
  const [mapImageLoading, setMapImageLoading] = useState(false);
  const [clubPickerOpen, setClubPickerOpen] = useState(false);
  const [shotFlow, setShotFlow] = useState('idle');
  const [selectedClub, setSelectedClub] = useState(null);
  const [loggedShotsByHole, setLoggedShotsByHole] = useState({});
  const [holeSummariesByHole, setHoleSummariesByHole] = useState({});
  const [holePutts, setHolePutts] = useState({});
  const [playerPositionsByHole, setPlayerPositionsByHole] = useState({});
  const [mapLayout, setMapLayout] = useState({ width: 0, height: 0 });
  const [coachingEnabled, setCoachingEnabled] = useState(true);
  const [showGreenSheet, setShowGreenSheet] = useState(false);
  const [showGreenView, setShowGreenView] = useState(false);
  const [greenPinPosition, setGreenPinPosition] = useState(null);
  const [measurePin, setMeasurePin] = useState(null);
  const [gpsActive, setGpsActive] = useState(true);
  const [showNudge, setShowNudge] = useState(false);
  const [dismissedHoles, setDismissedHoles] = useState(() => new Set());
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportContext, setReportContext] = useState(null);
  const [reportedGpsMismatchHoles, setReportedGpsMismatchHoles] = useState(() => new Set());
  const [recentRounds, setRecentRounds] = useState([]);
  const [userPlayerRating, setUserPlayerRating] = useState(null);
  const [userClubs, setUserClubs] = useState(() => Object.fromEntries(CLUB_OPTIONS.map((club) => [club.name, club.yards])));
  const [activeBagClubs, setActiveBagClubs] = useState(() => CLUB_OPTIONS.map((club) => club.name));
  const [clubAverages, setClubAverages] = useState({});
  const [weather, setWeather] = useState(null);
  const [elevationDiffFt, setElevationDiffFt] = useState(0);

  const holeWindow = useMemo(() => {
    if (Array.isArray(routeHoleNumbers) && routeHoleNumbers.length > 0) {
      return { startIndex: 0, endIndex: routeHoleNumbers.length - 1, custom: true };
    }
    if (roundLength === 'front9') return { startIndex: 0, endIndex: 8, custom: false };
    if (roundLength === 'back9') return { startIndex: 9, endIndex: 17, custom: false };
    return { startIndex: 0, endIndex: Math.max(0, (course?.holes?.length || 18) - 1), custom: false };
  }, [course?.holes?.length, roundLength, routeHoleNumbers]);
  const visibleHoles = useMemo(() => {
    const allHoles = course?.holes || [];
    if (holeWindow.custom) {
      const holeMap = new Map(allHoles.map((hole) => [Number(hole?.hole ?? hole?.number), hole]));
      return routeHoleNumbers.map((holeNumber) => holeMap.get(Number(holeNumber))).filter(Boolean);
    }
    return allHoles.slice(holeWindow.startIndex, holeWindow.endIndex + 1);
  }, [course?.holes, holeWindow.custom, holeWindow.endIndex, holeWindow.startIndex, routeHoleNumbers]);
  const currentHole = visibleHoles[currentHoleIndex] || null;
  const hazardTags = useMemo(() => getHazardTags(currentHole), [currentHole]);
  const teeBack = useMemo(
    () => findPoi(currentHole, 'Tee Back', 'C') || findPoi(currentHole, 'Tee Front', 'C'),
    [currentHole]
  );
  const greenFront = useMemo(() => findPoi(currentHole, 'Green', 'F'), [currentHole]);
  const greenCenter = useMemo(() => findPoi(currentHole, 'Green', 'C'), [currentHole]);
  const greenBack = useMemo(() => findPoi(currentHole, 'Green', 'B'), [currentHole]);

  const loadCourse = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const local = await getCourse(courseId);
      if (local && hasGpsHoleData(local)) {
        setCourse(local);
        setCached(true);
      } else {
        try {
          const remote = await fetchCourseHolesFromBackend(courseId, courseName);
          await saveCourse(courseId, remote);
          setCourse(remote);
          setCached(false);
        } catch (_remoteErr) {
          // No course found anywhere — continue with null so GPS round still starts.
          // Hole distances won't show but the round can proceed.
          setCached(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load course');
    } finally {
      setLoading(false);
    }
  }, [courseId, courseName]);

  useEffect(() => {
    loadCourse();
  }, [loadCourse]);

  useEffect(() => {
    setCurrentHoleIndex(Math.max(0, Math.min(visibleHoles.length - 1, (startingHole || 1) - 1)));
  }, [startingHole, courseId, visibleHoles.length]);

  const baseYardages = useMemo(() => {
    if (!teeBack || !greenFront || !greenCenter || !greenBack) {
      return { front: '--', center: '--', back: '--' };
    }
    return {
      front: haversineYards(teeBack.Latitude, teeBack.Longitude, greenFront.Latitude, greenFront.Longitude) ?? '--',
      center: haversineYards(teeBack.Latitude, teeBack.Longitude, greenCenter.Latitude, greenCenter.Longitude) ?? '--',
      back: haversineYards(teeBack.Latitude, teeBack.Longitude, greenBack.Latitude, greenBack.Longitude) ?? '--',
    };
  }, [teeBack, greenFront, greenCenter, greenBack]);

  const playerPoint = playerPositionsByHole[currentHoleIndex] || PREVIEW_POINTS.tee;
  const liveLie = useMemo(() => detectPreviewLie(playerPoint, currentHole), [currentHole, playerPoint]);
  const yardages = useMemo(() => computePreviewYardages(playerPoint, baseYardages), [playerPoint, baseYardages]);
  const currentHoleShots = loggedShotsByHole[currentHoleIndex] || [];
  const currentRoundShots = useMemo(
    () => Object.values(loggedShotsByHole).flatMap((shots) => shots || []),
    [loggedShotsByHole]
  );
  const currentHoleSummary = holeSummariesByHole[currentHoleIndex] || { firstPuttDistance: 0, pinLocation: 'middle', putts: null };
  const currentPutts = holePutts[currentHoleIndex] || 0;
  const holeScore = currentHoleShots.length + currentPutts;
  const loggedHoles = useMemo(
    () => Object.keys(loggedShotsByHole)
      .filter((key) => (loggedShotsByHole[key]?.length || 0) > 0 || (holePutts[key] || 0) > 0)
      .map((key) => Number(key)),
    [holePutts, loggedShotsByHole]
  );
  const visibleLoggedHoles = useMemo(
    () => holeWindow.custom
      ? loggedHoles.filter((index) => index >= 0 && index < visibleHoles.length)
      : loggedHoles
          .filter((index) => index >= holeWindow.startIndex && index <= holeWindow.endIndex)
          .map((index) => index - holeWindow.startIndex),
    [holeWindow.custom, holeWindow.endIndex, holeWindow.startIndex, loggedHoles, visibleHoles.length]
  );

  // Build holeScores record for HoleSelectorBar pill coloring
  const holeScoresForSelector = useMemo(() => {
    const result = {};
    visibleHoles.forEach((h, idx) => {
      const shots = (loggedShotsByHole[idx] || []).length;
      const putts = holePutts[idx] || 0;
      const computed = shots + putts;
      if (computed > 0) {
        result[idx] = { score: computed, par: h?.par || 4 };
      }
    });
    return result;
  }, [visibleHoles, loggedShotsByHole, holePutts]);

  const isOffCourse = liveLie?.lie === 'Off Course' || (Number.isFinite(yardages.center) && yardages.center > 800);

  const selectedTee = useMemo(
    () => currentHole?.tees?.find((tee) => normalizeTeeName(tee.name) === normalizeTeeName(teeColor)) || currentHole?.tees?.[0] || null,
    [currentHole, teeColor]
  );
  const selectedTeeYardage = Number(selectedTee?.yards) || null;
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
  const playingDistance = useMemo(() => {
    if (tournamentMode || !Number.isFinite(yardages.center)) return null;
    const base = getPlayingAdjustment(yardages.center, weather, 0);
    const elevAdj = elevationDiffToYardageAdjustment(elevationDiffFt || 0);
    return {
      adjustedYards: Math.max(0, Math.round(yardages.center + (base?.windAdj ?? 0) + (base?.tempAdj ?? 0) + elevAdj)),
      tempAdj: base?.tempAdj ?? 0,
      windAdj: base?.windAdj ?? 0,
      elevAdj,
    };
  }, [elevationDiffFt, tournamentMode, weather, yardages.center]);
  const distanceSuggestedClub = useMemo(
    () => getBestClubForPar3(
      tournamentMode ? yardages.center : playingDistance?.adjustedYards ?? yardages.center,
      activeBagClubs,
      clubAverages,
      userClubs,
    ),
    [activeBagClubs, clubAverages, playingDistance?.adjustedYards, tournamentMode, userClubs, yardages.center]
  );
  const holeSuggestion = useMemo(() => getSuggestion(
    recentRounds,
    currentHole?.hole || currentHoleIndex + 1,
    {
      par: currentHole?.par || 4,
      holeLength: selectedTeeYardage || null,
      gpsDistanceYards: tournamentMode ? yardages.center : playingDistance?.adjustedYards ?? yardages.center,
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
    currentHole?.hole,
    currentHole?.par,
    currentHoleIndex,
    distanceSuggestedClub,
    playingDistance?.adjustedYards,
    recentRounds,
    selectedTeeYardage,
    tournamentMode,
    userClubs,
    userPlayerRating,
    yardages.center,
  ]);
  const preferredLeaveYards = useMemo(
    () => getPreferredLeaveYards({ holeSuggestion, bestDistanceBand: PREVIEW_NUDGE_CONTEXT.bestDistanceBand }),
    [holeSuggestion]
  );
  const maxTeeShotYards = useMemo(
    () => CLUB_OPTIONS.reduce((max, club) => Math.max(max, Number(club.yards) || 0), 0),
    []
  );
  const likelyTeeShotYards = useMemo(() => {
    const matchedClub = Object.entries(userClubs || {}).find(([club]) => normalizeClubLabel(club) === normalizeClubLabel(holeSuggestion?.label));
    return (matchedClub ? Number(matchedClub[1]) : distanceSuggestedClub?.displayYards) || Math.round(maxTeeShotYards * 0.88);
  }, [distanceSuggestedClub?.displayYards, holeSuggestion?.label, maxTeeShotYards, userClubs]);
  const likelyAdvanceYards = useMemo(() => {
    const nonDriver = CLUB_OPTIONS
      .filter((club) => normalizeClubLabel(club.name) !== 'driver')
      .map((club) => Number(club.yards) || 0)
      .sort((a, b) => b - a);
    return nonDriver[0] || Math.max(150, Math.round(likelyTeeShotYards * 0.8));
  }, [likelyTeeShotYards]);
  const holeMissSide = PREVIEW_NUDGE_CONTEXT.holeMemory?.[currentHole?.hole || currentHoleIndex + 1]?.missSide || null;
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
  const hazardCarryLabels = useMemo(
    () => buildHazardCarryModel({
      hole: currentHole,
      userPos: selectedTeeMarker ? { lat: selectedTeeMarker.lat, lng: selectedTeeMarker.lng } : null,
      weather,
      shotBearingDeg: 0,
      elevationYards: elevationDiffToYardageAdjustment(elevationDiffFt || 0),
      centerYards: yardages.center,
      routePoints,
    }),
    [currentHole, elevationDiffFt, routePoints, selectedTeeMarker, weather, yardages.center]
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
  const suggestedClub = useMemo(() => {
    const matchedClub = Object.entries(userClubs || {}).find(([club]) => normalizeClubLabel(club) === normalizeClubLabel(holeSuggestion?.label));
    if (matchedClub) {
      return {
        name: matchedClub[0],
        yards: Number(matchedClub[1]) || null,
      };
    }
    if (!distanceSuggestedClub) return null;
    return {
      name: distanceSuggestedClub.club,
      yards: distanceSuggestedClub.displayYards,
    };
  }, [distanceSuggestedClub, holeSuggestion?.label, userClubs]);

  const activeNudge = useMemo(() => coachingEnabled ? buildInRoundNudge({
    holeNumber: currentHole?.hole || currentHoleIndex + 1,
    holePar: currentHole?.par || 4,
    liveLie: liveLie?.lie || null,
    selectedClub: selectedClub?.name || null,
    suggestedClub: holeSuggestion?.label || suggestedClub?.name || null,
    centerYards: Number.isFinite(yardages.center) ? yardages.center : null,
    playingYards: tournamentMode ? (Number.isFinite(yardages.center) ? yardages.center : null) : (playingDistance?.adjustedYards ?? null),
    tournamentMode,
    weather: tournamentMode ? null : weather,
    hazardCarries: hazardCarryLabels.map((label) => ({ label: label.label, actual: label.front, color: label.color })),
    currentRoundShots,
    greenSummary: currentHoleSummary,
    context: PREVIEW_NUDGE_CONTEXT,
  }) : null, [coachingEnabled, currentHole?.hole, currentHole?.par, currentHoleIndex, currentHoleSummary, currentRoundShots, hazardCarryLabels, holeSuggestion?.label, liveLie?.lie, playingDistance?.adjustedYards, selectedClub?.name, suggestedClub?.name, tournamentMode, weather, yardages.center]);
  const displayNudge = useMemo(() => {
    if (!activeNudge) return null;
    if (activeNudge.type === 'tee-club') return null;
    return activeNudge;
  }, [activeNudge]);
  const coachingOverlayBottom =
    GPS_WEB_PREVIEW.BOTTOM_BAR + GPS_WEB_PREVIEW.YARDAGE + insets.bottom + GPS_COACHING.NUDGE_GAP_ABOVE_BAR;
  const isCompact = width < 700;
  const mapWidth = Math.max(320, Math.round(width));
  const mapHeight = Math.max(220, height + insets.top + insets.bottom);
  const holeImageRequest = useMemo(
    () => buildStaticMapRequest(currentHole, mapWidth, mapHeight),
    [currentHole, mapWidth, mapHeight]
  );
  const greenStaticRequest = useMemo(
    () => buildGreenStaticMapRequest(greenCenter, mapWidth, mapHeight),
    [greenCenter, mapWidth, mapHeight]
  );
  const activeMapRequest = showGreenView ? greenStaticRequest : holeImageRequest;
  const projection = useMemo(() => buildScreenProjection(currentHole), [currentHole]);
  const screenYardageMarkers = useMemo(() => (
    yardageMarkers.map((marker) => {
      const point = projectLatLngToPercent(projection, marker.lat, marker.lng);
      return point ? { ...marker, ...point } : null;
    }).filter(Boolean)
  ), [projection, yardageMarkers]);
  const screenRouteLabels = useMemo(() => (
    routeLabels.map((label) => {
      const point = projectLatLngToPercent(projection, label.lat, label.lng);
      return point ? { ...label, ...point } : null;
    }).filter(Boolean)
  ), [projection, routeLabels]);
  const screenLayupTargets = useMemo(() => (
    layupTargets.map((target) => {
      const point = projectLatLngToPercent(projection, target.lat, target.lng);
      return point ? { ...target, ...point } : null;
    }).filter(Boolean)
  ), [layupTargets, projection]);
  const screenHazardCarries = useMemo(() => (
    hazardCarryLabels.map((label) => {
      const point = projectLatLngToPercent(projection, label.lat, label.lng);
      return point ? { ...label, ...point } : null;
    }).filter(Boolean)
  ), [hazardCarryLabels, projection]);
  const screenStrategyPoints = useMemo(() => (
    (strategyModel.strategyLinePoints || []).map((point, index) => {
      const projected = projectLatLngToPercent(projection, point.lat, point.lng);
      return projected ? { ...point, id: `strategy-${index}`, ...projected } : null;
    }).filter(Boolean)
  ), [projection, strategyModel]);

  useEffect(() => {
    setMapLoadError('');
  }, [holeImageRequest, greenStaticRequest, showGreenView, currentHoleIndex, mapWidth, mapHeight]);

  useEffect(() => {
    let active = true;
    let objectUrl = null;

    async function loadStaticMap() {
      if (!activeMapRequest) {
        setMapImageUri('');
        setMapImageLoading(false);
        if (!MAPBOX_PUBLIC_TOKEN) {
          setMapLoadError('Map preview is not configured for web.');
        }
        return;
      }

      setMapImageLoading(true);
      setMapLoadError('');

      try {
        const response = await fetch(activeMapRequest.url);

        if (!response.ok) {
          throw new Error(`mapbox_${response.status}`);
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!active) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setMapImageUri(objectUrl);
      } catch (error) {
        if (active) {
          setMapImageUri('');
          const errorCode = error instanceof Error ? error.message : '';
          if (__DEV__) {
            console.warn('[WebGpsRoundPreview] Static map load failed', errorCode || error);
          }
          setMapLoadError('Map preview could not load right now.');
        }
      } finally {
        if (active) {
          setMapImageLoading(false);
        }
      }
    }

    loadStaticMap();

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [activeMapRequest]);

  useEffect(() => {
    setShotFlow('idle');
    setSelectedClub(null);
    setShowGreenSheet(false);
    setShowGreenView(false);
  }, [currentHoleIndex]);

  useEffect(() => {
    let active = true;
    getRounds()
      .then((rounds) => {
        if (active) setRecentRounds(rounds.filter((round) => round.courseId === courseId || round.courseName === courseName).slice(0, 12));
      })
      .catch(() => {
        if (active) setRecentRounds([]);
      });
    return () => { active = false; };
  }, [courseId, courseName]);

  useEffect(() => {
    let active = true;
    Promise.all([getUserProfile(), getClubAverages()])
      .then(([profile, averages]) => {
        if (active) {
          setClubAverages(averages || {});
          const bagClubs = getActiveBagClubs(profile);
          setActiveBagClubs(bagClubs.length ? bagClubs : CLUB_OPTIONS.map((club) => club.name));
          setUserClubs(
            Object.keys(profile?.clubDistances || {}).length > 0 || Object.keys(averages || {}).length > 0
              ? buildEffectiveClubDistanceMap(profile?.clubDistances ?? null, averages || {})
              : Object.fromEntries(CLUB_OPTIONS.map((club) => [club.name, club.yards]))
          );
          setUserPlayerRating(typeof profile?.playerRating === 'number' ? profile.playerRating : null);
        }
      })
      .catch(() => {
        if (active) {
          setClubAverages({});
          setActiveBagClubs(CLUB_OPTIONS.map((club) => club.name));
          setUserClubs(Object.fromEntries(CLUB_OPTIONS.map((club) => [club.name, club.yards])));
          setUserPlayerRating(null);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!teeBack || tournamentMode) {
      setWeather(null);
      return undefined;
    }
    const refreshWeather = () => {
      getGpsWeather(teeBack.Latitude, teeBack.Longitude)
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
  }, [teeBack, tournamentMode]);

  useEffect(() => {
    let cancelled = false;
    if (!teeBack || !greenCenter) {
      setElevationDiffFt(0);
      return undefined;
    }
    getElevationDifferenceFeet(teeBack.Latitude, teeBack.Longitude, greenCenter.Latitude, greenCenter.Longitude)
      .then((next) => {
        if (!cancelled) setElevationDiffFt(next ?? 0);
      })
      .catch(() => {
        if (!cancelled) setElevationDiffFt(0);
      });
    return () => {
      cancelled = true;
    };
  }, [greenCenter, teeBack]);

  const handleSelectHole = useCallback((nextIndex) => {
    setCurrentHoleIndex(nextIndex);
    setMeasurePin(null);
  }, []);

  const handleStartShot = useCallback(() => {
    if (shotFlow !== 'idle' || clubPickerOpen) return;
    setClubPickerOpen(true);
    setMeasurePin(null);
  }, [clubPickerOpen, shotFlow]);

  const handlePickClub = useCallback((club) => {
    setSelectedClub(club);
    setClubPickerOpen(false);
    setShotFlow('mark');
  }, []);

  const handleMapMeasureTap = useCallback((event) => {
    if (!mapLayout.width || !mapLayout.height) return;
    const x = clamp(event.nativeEvent.locationX / mapLayout.width, 0.04, 0.96);
    const y = clamp(event.nativeEvent.locationY / mapLayout.height, 0.04, 0.96);
    const tapPoint = { x, y };
    const fromYou = Math.max(1, Math.round(getShotDistance(playerPoint, tapPoint, baseYardages.center)));
    const toGreen = Math.max(1, Math.round(getShotDistance(tapPoint, PREVIEW_POINTS.greenCenter, baseYardages.center)));
    setMeasurePin({ x, y, fromYou, toGreen });
  }, [baseYardages.center, mapLayout.height, mapLayout.width, playerPoint]);

  const handleMapShotPlacement = useCallback((event) => {
    if (shotFlow !== 'mark' || !selectedClub || !mapLayout.width || !mapLayout.height) return;
    const x = clamp(event.nativeEvent.locationX / mapLayout.width, 0.06, 0.94);
    const y = clamp(event.nativeEvent.locationY / mapLayout.height, 0.06, 0.94);
    const targetPoint = { x, y };
    const actualYards = getShotDistance(playerPoint, targetPoint, baseYardages.center);
    const playingYards = tournamentMode ? actualYards : Math.max(1, actualYards + 2);
    const lie = detectPreviewLie(targetPoint, currentHole);

    setLoggedShotsByHole((prev) => {
      const existing = prev[currentHoleIndex] || [];
      return {
        ...prev,
        [currentHoleIndex]: [
          ...existing,
          {
            id: `${currentHoleIndex}-${Date.now()}`,
            num: existing.length + 1,
            club: selectedClub.name,
            abbr: selectedClub.abbr,
            color: selectedClub.color,
            actualYards,
            playingYards,
            lie: lie.lie,
            lieColor: lie.color,
            from: playerPoint,
            to: targetPoint,
          },
        ],
      };
    });
    setPlayerPositionsByHole((prev) => ({ ...prev, [currentHoleIndex]: targetPoint }));
    setShotFlow('idle');
    setSelectedClub(null);
    setMeasurePin(null);
  }, [baseYardages.center, currentHole, currentHoleIndex, mapLayout.height, mapLayout.width, playerPoint, selectedClub, shotFlow, tournamentMode]);

  const handleResetHole = useCallback(() => {
    setLoggedShotsByHole((prev) => ({ ...prev, [currentHoleIndex]: [] }));
    setHolePutts((prev) => ({ ...prev, [currentHoleIndex]: 0 }));
    setPlayerPositionsByHole((prev) => ({ ...prev, [currentHoleIndex]: PREVIEW_POINTS.tee }));
    setShotFlow('idle');
    setSelectedClub(null);
    setMeasurePin(null);
  }, [currentHoleIndex]);

  const handleAdvanceHole = useCallback((direction = 1) => {
    setShotFlow('idle');
    setSelectedClub(null);
    setMeasurePin(null);
    setCurrentHoleIndex((prev) => clamp(prev + direction, 0, Math.max(visibleHoles.length - 1, 0)));
  }, [visibleHoles.length]);

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>Loading GPS preview</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.screenShell}>
        <View
          style={[styles.mapWrap, { height: mapHeight }]}
          onLayout={(event) => setMapLayout({
            width: event.nativeEvent.layout.width,
            height: event.nativeEvent.layout.height,
          })}
        >
          {mapImageUri && !mapLoadError ? (
            <Image
              source={{ uri: mapImageUri }}
              style={[styles.mapImage, { height: mapHeight }]}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.mapFallback, { minHeight: mapHeight }]}>
              {mapImageLoading ? (
                <>
                  <ActivityIndicator color="#60A5FA" />
                  <Text style={styles.mapFallbackTitle}>Loading Map Preview</Text>
                </>
              ) : (
                <>
                  <Ionicons name="image-outline" size={28} color="#6B7280" />
                  <Text style={styles.mapFallbackTitle}>Map Preview Unavailable</Text>
                  <Text style={styles.mapFallbackBody}>
                    {mapLoadError || 'Map preview is not configured for web.'}
                  </Text>
                </>
              )}
            </View>
          )}
          {currentHoleShots.map((shot) => (
            <React.Fragment key={shot.id}>
              <View
                pointerEvents="none"
                style={[
                  styles.shotPath,
                  {
                    left: `${shot.from.x * 100}%`,
                    top: `${shot.from.y * 100}%`,
                    width: `${distanceBetweenPoints(shot.from, shot.to) * 100}%`,
                    borderColor: shot.color,
                    transform: [
                      {
                        rotate: `${Math.atan2(shot.to.y - shot.from.y, shot.to.x - shot.from.x) * (180 / Math.PI)}deg`,
                      },
                    ],
                  },
                ]}
              />
              <View
                pointerEvents="none"
                style={[
                  styles.shotTarget,
                  {
                    left: `${shot.to.x * 100}%`,
                    top: `${shot.to.y * 100}%`,
                    borderColor: shot.color,
                    backgroundColor: `${shot.color}22`,
                  },
                ]}
              />
              <View
                pointerEvents="none"
                style={[
                  styles.shotMarker,
                  {
                    left: `${shot.from.x * 100}%`,
                    top: `${shot.from.y * 100}%`,
                    borderColor: shot.lieColor || shot.color,
                  },
                ]}
              >
                <View style={[styles.shotMarkerCore, { backgroundColor: shot.color }]}>
                  <Text style={styles.shotMarkerText}>{shot.num}</Text>
                </View>
              </View>
            </React.Fragment>
          ))}
          {screenStrategyPoints.slice(1).map((point, index) => {
            const from = screenStrategyPoints[index];
            const dx = point.x - from.x;
            const dy = point.y - from.y;
            const length = Math.hypot(dx, dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            return (
              <View
                key={`strategy-line-${index}`}
                pointerEvents="none"
                style={[
                  styles.strategyLine,
                  {
                    left: `${from.x * 100}%`,
                    top: `${from.y * 100}%`,
                    width: `${length * 100}%`,
                    transform: [{ rotate: `${angle}deg` }],
                  },
                ]}
              />
            );
          })}
          {screenYardageMarkers.map((marker) => (
            <View
              key={`marker-${marker.yds}`}
              pointerEvents="none"
              style={[styles.ydMarkerWrap, { top: `${marker.y * 100}%`, left: `${marker.x * 100}%` }]}
            >
              <View style={[styles.ydLine, { borderColor: marker.color }]} />
              <View style={[styles.ydDiamond, { borderColor: marker.color, backgroundColor: marker.synthetic ? colors.bg.secondary : `${marker.color}2E` }]}>
                <Text style={[styles.ydNum, { color: marker.color }]}>{marker.yds}</Text>
              </View>
            </View>
          ))}
          {screenLayupTargets.map((target, index) => (
            <View
              key={target.id}
              pointerEvents="none"
              style={[
                styles.layupWrap,
                index > 0 && styles.layupWrapSecondary,
                target.labelOffsetY ? { marginTop: -18 + target.labelOffsetY } : null,
                { top: `${target.y * 100}%`, left: `${target.x * 100}%` },
              ]}
            >
              <View style={[styles.layupDot, index > 0 && styles.layupDotSecondary]} />
              <View style={[styles.layupPill, index > 0 && styles.layupPillSecondary]}>
                <Text style={styles.layupTag}>{target.tag}</Text>
                <Text style={styles.layupText}>{target.label}</Text>
              </View>
            </View>
          ))}
          {screenRouteLabels.map((label) => (
            <View
              key={label.id}
              pointerEvents="none"
              style={[styles.routeLabelWrap, { top: `${label.y * 100}%`, left: `${label.x * 100}%` }]}
            >
              <View style={styles.routeLabelPill}>
                <Text style={styles.routeLabelText}>{label.yardsToGreen}y</Text>
              </View>
            </View>
          ))}
          {screenHazardCarries.map((label, index) => (
            <View
              key={label.id}
              pointerEvents="none"
              style={[styles.carryWrap, getHazardPillOffsetStyle(label, index), { top: `${label.y * 100}%`, left: `${label.x * 100}%` }]}
            >
              <View style={styles.carryPill}>
                <Text style={[styles.carryTxt, { color: label.color }]}>
                  {label.front} front {label.carry} carry
                  <Text style={styles.carrySuffix}>y</Text>
                </Text>
              </View>
            </View>
          ))}
          {!showGreenView && (
            <>
              <View
                pointerEvents="none"
                style={[
                  styles.playerRing,
                  { left: `${playerPoint.x * 100}%`, top: `${playerPoint.y * 100}%` },
                ]}
              />
              <View
                pointerEvents="none"
                style={[
                  styles.playerDot,
                  { left: `${playerPoint.x * 100}%`, top: `${playerPoint.y * 100}%` },
                ]}
              />
            </>
          )}
          {showGreenView && (
            <Pressable
              style={styles.mapTapCatcher}
              onPress={(e) => {
                const { locationX, locationY, target } = e.nativeEvent;
                const w = mapLayout.width || mapWidth;
                const h = mapLayout.height || mapHeight;
                setGreenPinPosition({ x: locationX / w, y: locationY / h });
              }}
            >
              {greenPinPosition && (
                <View
                  pointerEvents="none"
                  style={[styles.greenPin, {
                    left: `${greenPinPosition.x * 100}%`,
                    top: `${greenPinPosition.y * 100}%`,
                  }]}
                >
                  <Text style={styles.greenPinEmoji}>📍</Text>
                </View>
              )}
              {!greenPinPosition && (
                <View style={styles.greenPinHint}>
                  <Text style={styles.greenPinHintText}>Tap to mark pin location</Text>
                </View>
              )}
            </Pressable>
          )}
          {!showGreenView && (shotFlow === 'idle' || shotFlow === 'mark') && (
            <Pressable style={styles.mapTapCatcher} onPress={shotFlow === 'mark' ? handleMapShotPlacement : handleMapMeasureTap}>
              {measurePin ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.measurePinWrap,
                    {
                      left: `${measurePin.x * 100}%`,
                      top: `${measurePin.y * 100}%`,
                    },
                  ]}
                >
                  {measurePin.fromYou != null && (
                    <View style={styles.measurePinBadge}>
                      <Text style={styles.measurePinFromYou}>{measurePin.fromYou}y from you</Text>
                      <Text style={styles.measurePinText}>{measurePin.toGreen}y to green</Text>
                    </View>
                  )}
                  <View style={styles.measurePinDot} />
                </View>
          ) : null}
          <GpsGlassChrome
            courseName={courseName || course?.courseName || 'GPS Preview'}
            cachedLabel={cached ? 'Cached on device' : course?.source === 'LOCAL_SAMPLE' ? 'Local sample data' : 'Loaded now'}
            selectedTeeName={selectedTee?.name || teeColor}
            selectedTeeYardage={selectedTeeYardage}
            routeLabel={routeLabel}
            hole={currentHole}
            currentHoleIndex={currentHoleIndex}
            holes={visibleHoles}
            holeNumbers={holeWindow.custom ? routeHoleNumbers : undefined}
            loggedHoles={visibleLoggedHoles}
            onSelectHole={(holeNumber) => handleSelectHole(holeWindow.custom ? holeNumber - 1 : holeNumber - 1 + holeWindow.startIndex)}
            onBack={onBack}
            onGpsPress={() => setGpsActive((v) => !v)}
            gpsLabel={gpsActive ? 'GPS' : 'MANUAL'}
            gpsIcon="navigate"
            onCardPress={() => {}}
            onFinishRound={() => {}}
            weatherText={!tournamentMode
              ? `${Number.isFinite(weather?.windMph) ? `${Math.round(weather.windMph)} mph` : '--'}  ${Number.isFinite(weather?.tempF) ? `${Math.round(weather.tempF)}F` : '--'}  ${Number.isFinite(weather?.humidity) ? `${Math.round(weather.humidity)}%` : '--'}`
              : 'Tournament mode'}
            yardages={yardages}
            playingDistance={playingDistance}
            tournamentMode={tournamentMode}
            topInset={insets.top}
            holeScores={holeScoresForSelector}
            isOffCourse={isOffCourse}
            showOffCourse={isOffCourse}
            teeYardage={selectedTeeYardage}
          />
          <View
            pointerEvents="none"
            style={[
              styles.mapboxWordmark,
              { bottom: insets.bottom + GPS_WEB_PREVIEW.BOTTOM_BAR + GPS_WEB_PREVIEW.WORDMARK_ABOVE_BAR },
            ]}
          >
            <Text style={styles.mapboxWordmarkText}>mapbox</Text>
          </View>
            </Pressable>
          )}
          {!clubPickerOpen && shotFlow === 'idle' && currentHoleShots.length > 0 && !displayNudge && (
            <View style={styles.shotRow}>
              {currentHoleShots.map((shot) => (
                <View key={`pill-${shot.id}`} style={[styles.shotPill, { borderColor: shot.color }]}>
                  <View style={[styles.shotNumber, { backgroundColor: shot.color }]}>
                    <Text style={styles.shotNumberText}>{shot.num}</Text>
                  </View>
                  <Text style={styles.shotClubText}>{shot.abbr}</Text>
                  <Text style={[styles.shotLieIcon, { color: shot.lieColor }]}>{shot.lie === 'Fairway' ? 'F' : shot.lie === 'Green' ? 'G' : shot.lie === 'Sand' ? 'S' : shot.lie === 'Tee Box' ? 'T' : shot.lie.startsWith('Left') ? 'L' : shot.lie.startsWith('Right') ? 'R' : '•'}</Text>
                </View>
              ))}
              <TouchableOpacity style={styles.clearShotsButton} onPress={handleResetHole}>
                <Text style={styles.clearShotsButtonText}>Reset</Text>
              </TouchableOpacity>
            </View>
          )}
          {shotFlow === 'mark' && (
            <View style={styles.markBanner}>
              <View style={styles.markBannerPulse}>
                <View style={styles.markBannerDot} />
              </View>
              <View style={styles.markBannerCopy}>
                <Text style={styles.markBannerTitle}>Tap to place the shot</Text>
                <Text style={styles.markBannerSubtitle}>
                  {selectedClub?.name || suggestedClub.name} selected for Hole {currentHoleIndex + 1}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.markBannerClose}
                onPress={() => {
                  setShotFlow('idle');
                  setSelectedClub(null);
                }}
              >
                <Text style={styles.markBannerCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <GpsRoundHud
          suggestion={holeSuggestion}
          holeNumber={currentHole?.hole || currentHoleIndex + 1}
          displayNudge={displayNudge}
          showNudgeCard={!showNudge && Boolean(displayNudge) && shotFlow === 'idle' && !clubPickerOpen && !showGreenSheet}
          nudgeOverlayBottom={coachingOverlayBottom}
          onPressSuggestion={() => setShowNudge((v) => !v)}
          suggestionActive={showNudge}
          bottomBarHeight={GPS_WEB_PREVIEW.BOTTOM_BAR}
          yardageBarHeight={GPS_WEB_PREVIEW.YARDAGE}
          currentPutts={currentPutts}
          onDecrementPutts={() => setHolePutts((prev) => ({ ...prev, [currentHoleIndex]: Math.max(0, currentPutts - 1) }))}
          onIncrementPutts={() => setHolePutts((prev) => ({ ...prev, [currentHoleIndex]: currentPutts + 1 }))}
          addShotLabel="ADD SHOT"
          onPressAddShot={handleStartShot}
          yardages={yardages}
          bottomInset={insets.bottom}
          quietLinks={quietReportLinks}
          onNextHole={() => {
            if (currentHoleIndex < visibleHoles.length - 1) {
              handleSelectHole(currentHoleIndex + 1);
            }
          }}
          isLastHole={currentHoleIndex >= visibleHoles.length - 1}
          holeScore={holeScore > 0 ? holeScore : null}
          holePar={currentHole?.par || 4}
          onScorePress={() => {}}
          isPlacing={shotFlow === 'mark'}
          placementClub={selectedClub?.abbr || suggestedClub?.abbr || null}
          onCancelPlacement={() => { setShotFlow('idle'); setSelectedClub(null); }}
          onConfirmPlacement={() => {}}
        />

        <ReportModal
          visible={reportModalVisible}
          context={reportContext}
          onClose={() => {
            setReportModalVisible(false);
            setReportContext(null);
          }}
        />

        <Modal visible={clubPickerOpen} transparent animationType="fade" onRequestClose={() => setClubPickerOpen(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableOpacity style={styles.modalScrim} activeOpacity={1} onPress={() => setClubPickerOpen(false)} />
            <View style={styles.modalSheet}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <View>
                  <Text style={styles.modalTitle}>Log Shot</Text>
                  <Text style={styles.sheetSubtitle}>
                    {tournamentMode ? `GPS ${yardages.center} yds` : `Playing ${Math.max(0, yardages.center + 2)} yds`}
                  </Text>
                </View>
                <TouchableOpacity style={styles.sheetClose} onPress={() => setClubPickerOpen(false)}>
                  <Text style={styles.sheetCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.clubRail}>
                {CLUB_OPTIONS.map((club) => {
                  const active = selectedClub?.id === club.id || (!selectedClub && suggestedClub.id === club.id);
                  return (
                    <TouchableOpacity key={club.id} style={[styles.clubCard, active && styles.clubCardActive]} onPress={() => handlePickClub(club)}>
                      {suggestedClub.id === club.id && <Text style={styles.clubBestLabel}>BEST</Text>}
                      <View style={[styles.clubCardAccent, active && styles.clubCardAccentActive]} />
                      <Text style={[styles.clubCardName, active && styles.clubCardNameActive]}>{club.abbr}</Text>
                      <Text style={[styles.clubCardYards, active && styles.clubCardYardsActive]}>{club.yards}y</Text>
                      <Text style={styles.clubCardDiffGood}>
                        {Math.max(0, yardages.center - club.yards) > 0 ? '+' : ''}{Math.round(yardages.center - club.yards)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal visible={showGreenSheet} transparent animationType="fade" onRequestClose={() => setShowGreenSheet(false)}>
          <View style={styles.modalBackdrop}>
            <TouchableOpacity style={styles.modalScrim} activeOpacity={1} onPress={() => setShowGreenSheet(false)} />
            <View style={styles.modalSheet}>
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <View>
                  <Text style={styles.modalTitle}>Green Markers</Text>
                  <Text style={styles.sheetSubtitle}>Track first putt distance, hole location, and putts.</Text>
                </View>
                <TouchableOpacity style={styles.sheetClose} onPress={() => setShowGreenSheet(false)}>
                  <Text style={styles.sheetCloseText}>✕</Text>
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
                      style={[styles.greenChoiceChip, currentHoleSummary.pinLocation === option.key && styles.greenChoiceChipActive]}
                      onPress={() => setHoleSummariesByHole((prev) => ({
                        ...prev,
                        [currentHoleIndex]: { ...currentHoleSummary, pinLocation: option.key },
                      }))}
                    >
                      <Text style={[styles.greenChoiceText, currentHoleSummary.pinLocation === option.key && styles.greenChoiceTextActive]}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.greenSheetLabel}>First Putt Distance</Text>
                <View style={styles.greenStepperRow}>
                  <TouchableOpacity
                    style={styles.greenStepperButton}
                    onPress={() => setHoleSummariesByHole((prev) => ({
                      ...prev,
                      [currentHoleIndex]: { ...currentHoleSummary, firstPuttDistance: Math.max(0, (currentHoleSummary.firstPuttDistance ?? 0) - 5) },
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
                      [currentHoleIndex]: { ...currentHoleSummary, firstPuttDistance: (currentHoleSummary.firstPuttDistance ?? 0) + 5 },
                    }))}
                  >
                    <Text style={styles.greenStepperButtonText}>+5</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.greenSheetLabel}>Putts</Text>
                <View style={styles.greenChoiceRow}>
                  {[0, 1, 2, 3, 4].map((putts) => (
                    <TouchableOpacity
                      key={`web-putts-${putts}`}
                      style={[styles.greenChoiceChip, currentHoleSummary.putts === putts && styles.greenChoiceChipActive]}
                      onPress={() => setHoleSummariesByHole((prev) => ({
                        ...prev,
                        [currentHoleIndex]: { ...currentHoleSummary, putts },
                      }))}
                    >
                      <Text style={[styles.greenChoiceText, currentHoleSummary.putts === putts && styles.greenChoiceTextActive]}>{putts}</Text>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  screenShell: { flex: 1, backgroundColor: 'transparent' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  topBarFrame: { justifyContent: 'center', backgroundColor: 'transparent' },
  holeHeaderFrame: { justifyContent: 'center', backgroundColor: 'transparent', overflow: 'hidden' },
  holeSelectorFrame: { justifyContent: 'center', backgroundColor: 'transparent', overflow: 'hidden' },
  yardageBarFrame: { justifyContent: 'center', backgroundColor: 'transparent' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, backgroundColor: 'transparent' },
  topBarCenter: { flex: 1, paddingHorizontal: 10 },
  iconBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.elevated },
  iconBtnActive: { borderWidth: 1, borderColor: colors.brand.primaryBorder },
  courseName: { color: colors.text.primary, fontSize: 13, fontWeight: '600', letterSpacing: -0.2 },
  subMeta: { color: colors.text.secondary, fontSize: 10, marginTop: 1 },
  gpsPill: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, borderRadius: 15, paddingHorizontal: 10, backgroundColor: colors.brand.primary, marginLeft: 2 },
  gpsPillOff: { backgroundColor: colors.bg.elevated, borderWidth: 1, borderColor: colors.border.subtle },
  gpsPillText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
  loadingText: { color: '#9CA3AF', marginTop: 12, fontSize: 14 },
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
  mapWrap: {
    alignSelf: 'stretch',
    overflow: 'hidden',
    position: 'relative',
    flex: 1,
  },
  mapImage: {
    width: '100%',
    backgroundColor: '#0F172A',
  },
  ydMarkerWrap: {
    position: 'absolute',
    width: 32,
    marginLeft: -16,
    marginTop: -6,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  ydNum: {
    fontSize: 8,
    fontWeight: '900',
    transform: [{ rotate: '-45deg' }],
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
  },
  routeLabelWrap: {
    position: 'absolute',
    marginLeft: -20,
    marginTop: -18,
    alignItems: 'center',
    justifyContent: 'center',
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
  carryWrap: {
    position: 'absolute',
    marginLeft: -18,
    marginTop: -24,
    alignItems: 'center',
    justifyContent: 'center',
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
    position: 'absolute',
    marginLeft: -26,
    marginTop: -18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  layupWrapSecondary: {
    marginTop: -40,
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
    borderWidth: 1,
    borderColor: 'rgba(52,211,153,0.45)',
    paddingHorizontal: 8,
    paddingVertical: 4,
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
  mapFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  mapFallbackTitle: { color: '#E5E7EB', fontSize: 16, fontWeight: '700' },
  mapFallbackBody: { color: '#9CA3AF', fontSize: 13, lineHeight: 20, textAlign: 'center' },
  mapFallbackUrl: { color: '#6B7280', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 4 },
  weatherStrip: {
    position: 'absolute',
    top: 20,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  weatherText: { color: '#F3F4F6', fontSize: 11, fontWeight: '700' },
  weatherDivider: { width: 1, height: 10, backgroundColor: 'rgba(255,255,255,0.12)', marginHorizontal: 6 },
  mapRightCol: {
    position: 'absolute',
    right: 10,
    top: 20,
    alignItems: 'flex-end',
    gap: 6,
    zIndex: 10,
  },
  distanceBadge: {
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderRadius: radius.md + 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: 118,
    alignItems: 'center',
  },
  distanceBadgeLabel: { color: colors.text.tertiary, fontSize: 8, fontWeight: '700', letterSpacing: 1.2, marginBottom: 2 },
  distanceValue: { color: colors.text.primary, fontSize: 28, fontWeight: '700', lineHeight: 28, letterSpacing: -0.5 },
  distGps: { color: 'rgba(255,255,255,0.38)', fontSize: 11, fontWeight: '600', marginTop: 2 },
  distanceUnit: { color: colors.text.secondary, fontSize: 9, letterSpacing: 1, marginBottom: 3 },
  distanceAdjust: { color: colors.brand.primary, fontSize: 8, fontWeight: '600', lineHeight: 11, textAlign: 'center' },
  playingDetailsCard: {
    width: 118,
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderRadius: radius.md + 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingVertical: 4,
    paddingHorizontal: 8,
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
  suggestedChip: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestedChipNote: { borderColor: colors.brand.primaryBorder },
  suggestedChipActive: { backgroundColor: colors.brand.primaryMuted, borderColor: colors.brand.primaryBorder },
  suggestedLabel: { color: 'rgba(255,255,255,0.42)', fontSize: 8, fontWeight: '700', letterSpacing: 1.2, marginBottom: 1 },
  suggestedClubText: { color: colors.text.primary, fontSize: 12, fontWeight: '700' },
  playerRing: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    marginLeft: -11,
    marginTop: -11,
    backgroundColor: 'rgba(26,200,85,0.18)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.26)',
  },
  playerDot: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderRadius: 4.5,
    marginLeft: -4.5,
    marginTop: -4.5,
    backgroundColor: '#1ac855',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  shotPath: {
    position: 'absolute',
    borderWidth: 0,
    borderTopWidth: 1.2,
    borderStyle: 'dashed',
    opacity: 0.7,
    transform: [{ rotate: '0deg' }],
  },
  strategyLine: {
    position: 'absolute',
    borderWidth: 0,
    borderTopWidth: 1.6,
    borderStyle: 'dashed',
    borderColor: 'rgba(52,211,153,0.88)',
    opacity: 0.95,
    transformOrigin: '0 0',
  },
  shotTarget: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    marginLeft: -9,
    marginTop: -9,
    borderWidth: 1.5,
  },
  shotMarker: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    marginLeft: -12,
    marginTop: -12,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shotMarkerCore: {
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shotMarkerText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
  },
  mapTapCatcher: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 8,
  },
  mapTapScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.14)',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 14,
    paddingHorizontal: 18,
  },
  mapTapPrompt: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    overflow: 'hidden',
  },
  mapTapSubprompt: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: 12,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingBottom: 8,
    paddingTop: 2,
    overflow: 'hidden',
  },
  shotRow: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 66,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  shotPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.76)',
    borderRadius: 7,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  shotNumber: {
    width: 14,
    height: 14,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shotNumberText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '800',
  },
  shotClubText: {
    color: '#D1D5DB',
    fontSize: 10,
    fontWeight: '600',
  },
  shotLieIcon: {
    fontSize: 9,
    fontWeight: '700',
  },
  clearShotsButton: {
    marginLeft: 'auto',
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  clearShotsButtonText: {
    color: '#E5E7EB',
    fontSize: 10,
    fontWeight: '700',
  },
  markBanner: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 30,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.brand.primaryBorder,
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 9,
  },
  markBannerPulse: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(76,175,125,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  markBannerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brand.primary,
  },
  markBannerCopy: {
    flex: 1,
  },
  markBannerTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  markBannerSubtitle: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 10,
    marginTop: 2,
  },
  markBannerClose: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  markBannerCloseText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 12,
    fontWeight: '700',
  },
  greenPin: {
    position: 'absolute',
    marginLeft: -12,
    marginTop: -24,
    zIndex: 10,
  },
  measurePinWrap: {
    position: 'absolute',
    marginLeft: -15,
    marginTop: -18,
    alignItems: 'center',
    zIndex: 10,
  },
  measurePinBadge: {
    backgroundColor: 'rgba(0,0,0,0.88)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignItems: 'center',
    marginBottom: 5,
  },
  measurePinFromYou: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '800',
  },
  measurePinText: {
    color: '#FBBF24',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginTop: 1,
  },
  measurePinDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FBBF24',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.5)',
  },
  mapboxWordmark: {
    position: 'absolute',
    left: 8,
    bottom: GPS_WEB_PREVIEW.BOTTOM_BAR + GPS_ABOVE_BAR.WORDMARK_STATIC,
    paddingHorizontal: 2,
    paddingVertical: 1,
    zIndex: 10,
  },
  mapboxWordmarkText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 8,
    fontWeight: '500',
    letterSpacing: 0.4,
  },
  greenPinEmoji: {
    fontSize: 24,
    lineHeight: 28,
  },
  greenPinHint: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 20,
  },
  greenPinHintText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  nudgeCard: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.bg.secondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    paddingVertical: 10,
    paddingRight: 12,
    zIndex: 12,
  },
  coachingCardWrap: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 13,
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
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
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
  bottomMapBar: {
    height: GPS_WEB_PREVIEW.BOTTOM_BAR,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    backgroundColor: 'transparent',
  },
  // Suggested club chip in bottom bar
  suggestedBarChip: { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.subtle, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, minWidth: 52 },
  suggestedBarChipNote: { borderColor: colors.brand.primaryBorder, backgroundColor: colors.brand.primaryMuted },
  suggestedBarLabel: { fontSize: 10 },
  suggestedBarClub: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  suggestedBarMeta: { color: colors.text.secondary, fontSize: 9, fontWeight: '600' },
  // Putts stepper in bottom bar
  bottomPuttStepper: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.subtle, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 4, gap: 6 },
  bottomPuttBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.bg.elevated, borderWidth: 1, borderColor: colors.border.subtle, alignItems: 'center', justifyContent: 'center' },
  bottomPuttBtnText: { color: '#E5E7EB', fontSize: 16, fontWeight: '700', lineHeight: 20 },
  bottomPuttValueWrap: { alignItems: 'center', minWidth: 28 },
  bottomPuttValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', lineHeight: 22 },
  bottomPuttLabel: { color: colors.text.secondary, fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
  // Right stack: Green button + Add Shot
  bottomRightStack: { flexDirection: 'column', gap: 4, alignItems: 'stretch' },
  greenViewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.subtle, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, minWidth: 58 },
  greenViewBtnActive: { borderColor: colors.brand.primaryBorder },
  greenViewBtnText: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '600' },
  addShotButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.subtle, borderRadius: 10, paddingHorizontal: 4, paddingVertical: 7 },
  addShotButtonText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
  // Course note panel
  courseNotePanel: { marginHorizontal: 14, marginTop: 4, backgroundColor: colors.brand.primaryMuted, borderWidth: 1, borderColor: colors.brand.primaryBorder, borderRadius: 10, padding: 10 },
  courseNoteTitle: { color: colors.brand.primary, fontSize: 11, fontWeight: '700', marginBottom: 4 },
  courseNoteBody: { color: colors.text.secondary, fontSize: 12, lineHeight: 18 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalScrim: {
    ...StyleSheet.absoluteFillObject,
  },
  modalSheet: {
    backgroundColor: colors.bg.primary,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 1,
    borderColor: colors.border.subtle,
    paddingBottom: 22,
  },
  sheetHandle: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignSelf: 'center',
    marginTop: 10,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  sheetSubtitle: {
    color: colors.brand.primary,
    fontSize: 11,
    marginTop: 2,
  },
  sheetClose: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
  clubRail: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 8,
  },
  clubCard: {
    width: 62,
    height: 76,
    borderRadius: 12,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    position: 'relative',
  },
  clubCardActive: {
    backgroundColor: colors.brand.primaryMuted,
    borderColor: colors.brand.primary,
    borderWidth: 1.5,
  },
  clubCardAccent: {
    position: 'absolute',
    top: 8,
    width: 18,
    height: 2,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  clubCardAccentActive: {
    backgroundColor: colors.brand.primary,
  },
  clubBestLabel: {
    position: 'absolute',
    top: 5,
    color: colors.brand.primary,
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
  },
  clubCardName: {
    color: '#BBBBBB',
    fontSize: 15,
    fontWeight: '700',
  },
  clubCardNameActive: {
    color: '#FFFFFF',
  },
  clubCardYards: {
    color: '#444444',
    fontSize: 11,
    marginTop: 2,
  },
  clubCardYardsActive: {
    color: 'rgba(255,255,255,0.6)',
  },
  clubCardDiffGood: {
    color: colors.brand.primary,
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
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
});

export default WebGpsRoundPreview;
