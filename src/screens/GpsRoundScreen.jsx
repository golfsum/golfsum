import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, AppState, Modal, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getCourse, saveCourse } from '../services/courseCache';
import { fetchCourseHolesFromBackend } from '../services/golfApi';
import { requestGpsPermission, watchUserPosition, classifyGpsQuality } from '../services/gps';
import { haversineYards } from '../services/haversine';
import { rs } from '../utils/responsive';
import { MAPBOX_PUBLIC_TOKEN } from '../config/mapbox';
import GpsOverlay from '../components/gps/GpsOverlay';
import GpsRoundHud from '../components/gps/GpsRoundHud';
import GpsGlassChrome from '../components/gps/GpsGlassChrome';
import { getUserProfile } from '../services/userService';
import { getNativeHoleCameraConfig, isCoordWithinBounds } from '../services/mapFraming';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { getSelectedTeeCoordinates } from '../utils/holeUtils';
import { elevationDiffToYardageAdjustment, getElevationDifferenceFeet } from '../services/weatherService';
import { endLiveActivity, isLiveActivitySupported, upsertLiveActivity } from '../services/liveActivityService';
import { getRounds } from '../services/roundsService';
import { buildInRoundNudge, buildInRoundNudgeContext } from '../services/inRoundNudgeService';
import { getSuggestion } from '../services/courseStatsService';
import { buildEffectiveClubDistanceMap, getActiveBagClubs, getBestClubForPar3, getClubAverages } from '../services/clubDistanceService';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

function detectLiveLie(userPos, hole, teePoi, greenPoi) {
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

  if (metrics && metrics.alongTrackRatio >= 0 && metrics.alongTrackRatio <= 1 && metrics.corridorDistance <= 15) {
    return { lie: 'Fairway', color: '#4CAF7D', showDot: true };
  }
  if (metrics) {
    return { lie: metrics.side, color: '#A3E635', showDot: true };
  }

  return LIVE_LIE_DEFAULT;
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
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cached, setCached] = useState(false);
  const [course, setCourse] = useState(null);
  const [currentHoleIndex, setCurrentHoleIndex] = useState(Math.max(0, (startingHole || 1) - 1));
  const [userPos, setUserPos] = useState(null);
  const [yardages, setYardages] = useState({ front: '--', center: '--', back: '--' });
  const cameraRef = useRef(null);
  const locationSubRef = useRef(null);
  const overlayRef = useRef(null);
  const frameBoundsRef = useRef(null);
  const lastMapTapRef = useRef(0);
  const pulseAnim = useRef(new Animated.Value(0)).current;

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
  const [userPlayerRating, setUserPlayerRating] = useState(null);
  const [activeBagClubs, setActiveBagClubs] = useState([]);
  const [clubAverages, setClubAverages] = useState({});
  const [liveLie, setLiveLie] = useState(LIVE_LIE_DEFAULT);
  const [gpsQuality, setGpsQuality] = useState('good');
  const [gpsAccuracyMeters, setGpsAccuracyMeters] = useState(null);
  const [manualMode, setManualMode] = useState(false);
  const [manualYardage, setManualYardage] = useState('');
  const noGpsTimerRef = useRef(null);
  const [overlayState, setOverlayState] = useState({ anySheet: false, shotFlow: 'idle', selectedClub: null });
  const [weather, setWeather] = useState(null);
  const [loggedShotsByHole, setLoggedShotsByHole] = useState({});
  const loggedShotsByHoleRef = useRef(loggedShotsByHole);
  useEffect(() => {
    loggedShotsByHoleRef.current = loggedShotsByHole;
  }, [loggedShotsByHole]);
  const [holeSummariesByHole, setHoleSummariesByHole] = useState({});
  const [lieToast, setLieToast] = useState(null);
  const [holeScoresByHole, setHoleScoresByHole] = useState({});
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
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportContext, setReportContext] = useState(null);
  const [holeFlagsByHole, setHoleFlagsByHole] = useState({});
  const [missedShotBanner, setMissedShotBanner] = useState(null);
  const [missedShotForm, setMissedShotForm] = useState(null);
  const [reportedGpsMismatchHoles, setReportedGpsMismatchHoles] = useState(() => new Set());
  const [showPreSaveReview, setShowPreSaveReview] = useState(false);
  const [pendingRoundPayload, setPendingRoundPayload] = useState(null);
  const [flaggedForPreSave, setFlaggedForPreSave] = useState([]);
  const [coursePlan, setCoursePlan] = useState(null);
  const [showGhostOverlay, setShowGhostOverlay] = useState(true);

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
  const roundStartedAtRef = useRef(Date.now());
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
  const greenCenter = useMemo(
    () => findPoi(currentHole, 'Green', 'C'),
    [currentHole]
  );
  const greenFront = useMemo(() => findPoi(currentHole, 'Green', 'F'), [currentHole]);
  const greenBack = useMemo(() => findPoi(currentHole, 'Green', 'B'), [currentHole]);
  const activeGreenPoi = useMemo(() => {
    if (greenTarget === 'front' && greenFront) return greenFront;
    if (greenTarget === 'back' && greenBack) return greenBack;
    return greenCenter;
  }, [greenTarget, greenFront, greenBack, greenCenter]);
  const shotBearingDeg = useMemo(() => {
    if (!userPos || !greenCenter) return null;
    const dy = (greenCenter.Latitude - userPos.lat) * (Math.PI / 180);
    const dx = ((greenCenter.Longitude - userPos.lng) * (Math.PI / 180)) * Math.cos(((greenCenter.Latitude + userPos.lat) / 2) * (Math.PI / 180));
    return normalizeDegrees(Math.atan2(dx, dy) * (180 / Math.PI));
  }, [greenCenter, userPos]);
  const distanceMode = useMemo(() => {
    if (userNearHole && userPos) return 'live';
    if (teeBack) return gpsQuality === 'none' ? 'plan' : 'tee';
    return 'plan';
  }, [userNearHole, userPos, teeBack, gpsQuality]);

  const centerYards = useMemo(() => {
    const fromPos = distanceMode === 'live' && userPos
      ? { lat: userPos.lat, lng: userPos.lng }
      : teeBack
        ? { lat: teeBack.Latitude, lng: teeBack.Longitude }
        : null;
    if (!fromPos || !activeGreenPoi) return null;
    const y = haversineYards(fromPos.lat, fromPos.lng, activeGreenPoi.Latitude, activeGreenPoi.Longitude);
    return Number.isFinite(y) ? Math.round(y) : null;
  }, [distanceMode, userPos, teeBack, activeGreenPoi]);

  const targetYards = useMemo(() => {
    if (greenTarget === 'center') return centerYards;
    const fromPos = distanceMode === 'live' && userPos
      ? { lat: userPos.lat, lng: userPos.lng }
      : teeBack
        ? { lat: teeBack.Latitude, lng: teeBack.Longitude }
        : null;
    const targetPoi = greenTarget === 'front' ? greenFront : greenTarget === 'back' ? greenBack : activeGreenPoi;
    if (!fromPos || !targetPoi) return centerYards;
    const y = haversineYards(fromPos.lat, fromPos.lng, targetPoi.Latitude, targetPoi.Longitude);
    return Number.isFinite(y) ? Math.round(y) : centerYards;
  }, [greenTarget, centerYards, distanceMode, userPos, teeBack, greenFront, greenBack, activeGreenPoi]);
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
  const distanceSuggestedClub = useMemo(
    () => getBestClubForPar3(
      tournamentMode ? centerYards : playingDistance?.adjustedYards,
      activeBagClubs,
      clubAverages,
      userClubs,
    ),
    [activeBagClubs, centerYards, clubAverages, playingDistance?.adjustedYards, tournamentMode, userClubs]
  );
  const currentHoleShots = loggedShotsByHole[currentHoleIndex] || [];

  // Build scorecard holes array from live round state
  const scorecardHoles = useMemo(() => {
    return visibleHoles.map((h, idx) => {
      const holeNum = h?.hole ?? h?.number ?? idx + 1;
      const shots = loggedShotsByHole[idx] || [];
      const summary = holeSummariesByHole[idx] || {};
      const putts = typeof summary.putts === 'number' ? summary.putts : null;
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
      const putts = typeof holeSummariesByHole[idx]?.putts === 'number' ? holeSummariesByHole[idx].putts : 0;
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
  const currentPutts = typeof currentHoleSummary.putts === 'number' ? currentHoleSummary.putts : 0;
  const currentRoundShots = useMemo(
    () => Object.values(loggedShotsByHole).flatMap((shots) => shots || []),
    [loggedShotsByHole]
  );
  const userNearHole = useMemo(() => isUserNearHole(userPos, currentHole), [currentHole, userPos]);
  const isOffCourse = liveLie?.lie === 'Off Course' || !userPos
    || (Number.isFinite(yardages.center) && yardages.center > 800);
  const nudgeContext = useMemo(() => buildInRoundNudgeContext(recentRounds), [recentRounds]);
  const holeSuggestion = useMemo(() => getSuggestion(
    recentRounds,
    currentHole?.hole || currentHoleIndex + 1,
    {
      par: currentHole?.par || 4,
      holeLength: selectedTeeYardage || currentHole?.yardage || null,
      gpsDistanceYards: tournamentMode ? centerYards : playingDistance?.adjustedYards ?? centerYards ?? null,
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
    tournamentMode,
    userClubs,
    userPlayerRating,
  ]);
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
      userPos,
      weather,
      shotBearingDeg,
      elevationYards: elevationDiffToYardageAdjustment(elevationDiffFt || 0),
      centerYards,
      routePoints,
    }),
    [centerYards, currentHole, elevationDiffFt, routePoints, shotBearingDeg, userPos, weather]
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
      hazardCarries,
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
    hazardCarries,
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
  // HUD sits inside a bottom-padded overlay; nudge offset is relative to that inset region.
  const coachingOverlayBottom =
    GPS_BAR.BOTTOM_ACTION + GPS_BAR.YARDAGE + GPS_COACHING.NUDGE_GAP_ABOVE_BAR;
  const detectLieAtCoordinate = useCallback((coord) => (
    detectLiveLie(coord, currentHole, teeBack, greenCenter)
  ), [currentHole, greenCenter, teeBack]);
  const shotPathGeo = useMemo(() => {
    if (!MapboxGL || !currentHoleShots.length) return null;
    const coordinates = currentHoleShots
      .map((shot) => shot.from)
      .filter((point) => point?.lng && point?.lat)
      .map((point) => [point.lng, point.lat]);
    if (userPos?.lng && userPos?.lat) {
      coordinates.push([userPos.lng, userPos.lat]);
    }
    if (coordinates.length < 2) return null;
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates,
        },
        properties: { kind: 'shot-track' },
      }],
    };
  }, [currentHoleShots, userPos]);
  const currentShotDisplay = useMemo(() => {
    const lastShot = currentHoleShots[currentHoleShots.length - 1] || null;
    if (overlayState.shotFlow === 'placing' || overlayState.shotFlow === 'confirming') {
      return {
        label: overlayState.selectedClub || effectiveSuggestedClub?.club || `Shot ${currentHoleShots.length + 1}`,
        yards: tournamentMode ? centerYards : playingDistance?.adjustedYards ?? centerYards,
        lie: liveLie?.lie || null,
      };
    }
    if (lastShot) {
      return {
        label: lastShot.abbr || `Shot ${lastShot.num}`,
        yards: lastShot.playingYards ?? lastShot.actualYards ?? null,
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

  const resetHoleCamera = useCallback((includeUser = userNearHole) => {
    if (!MapboxGL || !currentHole || !cameraRef.current) return;
    const shouldIncludeUser = includeUser && userNearHole;
    const frame = getNativeHoleCameraConfig(currentHole, shouldIncludeUser ? userPos : null, { includeUser: shouldIncludeUser });
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
  }, [currentHole, userNearHole, userPos]);

  const loadCourse = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const local = await getCourse(courseId);
      if (local) {
        setCourse(local);
        setCached(true);
      } else {
        try {
          const remote = await fetchCourseHolesFromBackend(courseId);
          await saveCourse(courseId, remote);
          setCourse(remote);
          setCached(false);
        } catch (_remoteErr) {
          // No course found anywhere — continue with null so GPS round still starts.
          setCached(false);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load course. Pre-download courses from Find Course for offline play.');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadCourse();
  }, [loadCourse]);

  // Load course plan for ghost overlay
  useEffect(() => {
    const uid = getCurrentUser()?.uid || null;
    loadPlan(uid, courseId, teeColor)
      .then(plan => { if (plan?.holes) setCoursePlan(plan.holes); })
      .catch(() => {});
  }, [courseId, teeColor]);

  useEffect(() => {
    setCurrentHoleIndex(Math.max(0, Math.min(visibleHoles.length - 1, (startingHole || 1) - 1)));
  }, [startingHole, courseId, visibleHoles.length]);

  useEffect(() => {
    let active = true;
    Promise.all([getUserProfile(), getClubAverages()])
      .then(([profile, averages]) => {
        if (active) {
          setClubAverages(averages || {});
          setActiveBagClubs(getActiveBagClubs(profile));
          setUserClubs(buildEffectiveClubDistanceMap(profile?.clubDistances ?? null, averages || {}));
          setUserPlayerRating(typeof profile?.playerRating === 'number' ? profile.playerRating : null);
        }
      })
      .catch(() => {
        if (active) {
          setClubAverages({});
          setActiveBagClubs([]);
          setUserClubs(null);
          setUserPlayerRating(null);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    getRounds()
      .then((rounds) => {
        if (active) setRecentRounds(rounds.filter((round) => round.courseId === courseId || round.courseName === courseName).slice(0, 12));
      })
      .catch(() => {
        if (active) setRecentRounds([]);
      });
    return () => {
      active = false;
    };
  }, [courseId, courseName]);

  useEffect(() => () => {
    if (lieToastTimeoutRef.current) clearTimeout(lieToastTimeoutRef.current);
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
  }, [teeBack, tournamentMode, userPos]);

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
          const nextUserPos = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setUserPos(nextUserPos);
          const acc = position.coords.accuracy;
          setGpsAccuracyMeters(Number.isFinite(acc) ? Math.round(acc) : null);
          setGpsQuality(classifyGpsQuality(acc));
        },
        () => {
          setGpsQuality('none');
          setError('GPS signal unavailable.');
        }
      );
    };

    start().catch(() => setError('Failed to start GPS.'));
    return () => {
      mounted = false;
      locationSubRef.current?.remove?.();
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
              setUserPos({ lat: position.coords.latitude, lng: position.coords.longitude });
              const acc = position.coords.accuracy;
              setGpsAccuracyMeters(Number.isFinite(acc) ? Math.round(acc) : null);
              setGpsQuality(classifyGpsQuality(acc));
            },
            () => setGpsQuality('none'),
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
    if (!userPos || !greenFront || !greenCenter || !greenBack) {
      setYardages({ front: '--', center: '--', back: '--' });
      if (!userPos) setLiveLie(LIVE_LIE_DEFAULT);
      return;
    }

    setYardages({
      front: haversineYards(userPos.lat, userPos.lng, greenFront.Latitude, greenFront.Longitude) ?? '--',
      center: haversineYards(userPos.lat, userPos.lng, greenCenter.Latitude, greenCenter.Longitude) ?? '--',
      back: haversineYards(userPos.lat, userPos.lng, greenBack.Latitude, greenBack.Longitude) ?? '--',
    });
    setLiveLie(detectLiveLie(userPos, currentHole, teeBack, greenCenter));
  }, [currentHole, greenBack, greenCenter, greenFront, teeBack, userPos]);

  useEffect(() => {
    resetHoleCamera(false);
    overlayRef.current?.resetOverlay?.();
    setGreenTarget('center');
  }, [currentHole, resetHoleCamera]);

  useEffect(() => {
    if (!MapboxGL || !currentHole || !cameraRef.current || !userPos || !userNearHole) return;
    const currentBounds = frameBoundsRef.current;
    const userCoord = [userPos.lng, userPos.lat];
    if (currentBounds && isCoordWithinBounds(userCoord, currentBounds)) return;
    resetHoleCamera(true);
  }, [currentHole, resetHoleCamera, userNearHole, userPos]);

  useEffect(() => {
    if (!MapboxGL || !MAPBOX_PUBLIC_TOKEN) return;
    MapboxGL.setAccessToken(MAPBOX_PUBLIC_TOKEN);
  }, []);

  const geo = useMemo(() => {
    if (!currentHole) return null;
    const tee = teeBack;
    const green = greenCenter;
    if (!tee || !green) return null;

    const features = [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [green.Longitude, green.Latitude] },
        properties: { kind: 'green' },
      },
    ];

    if (userPos && userNearHole) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [userPos.lng, userPos.lat] },
        properties: { kind: 'user' },
      });
    }

    return { type: 'FeatureCollection', features };
  }, [currentHole, routePoints, userNearHole, userPos]);

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

  const handleGreenMapToggle = useCallback(() => {
    if (!cameraRef.current || !greenCenter) return;
    if (greenMapOnly) {
      resetHoleCamera(true);
      setGreenMapOnly(false);
      return;
    }
    cameraRef.current?.setCamera({
      centerCoordinate: [greenCenter.Longitude, greenCenter.Latitude],
      zoomLevel: 18.5,
      animationDuration: 700,
      animationMode: 'flyTo',
    });
    setGreenMapOnly(true);
  }, [greenCenter, greenMapOnly, resetHoleCamera]);

  const [measurePin, setMeasurePin] = useState(null);

  const handleMapPress = useCallback((event) => {
    const coords = event?.geometry?.coordinates;
    const tapLng = coords?.[0];
    const tapLat = coords?.[1];

    const mapMode = overlayRef.current?.getMapMode?.() || 'gps';
    if (mapMode === 'placing' || mapMode === 'confirming') {
      if (!Number.isFinite(tapLng) || !Number.isFinite(tapLat)) return;
      setMeasurePin(null);
      const handled = overlayRef.current?.handleShotMapTap?.({ latitude: tapLat, longitude: tapLng });
      if (handled) lastMapTapRef.current = Date.now();
      return;
    }
    if (mapMode !== 'gps') return;

    if (overlayState.anySheet || overlayState.shotFlow !== 'idle') return;

    const now = Date.now();
    if (now - lastMapTapRef.current <= 280) {
      resetHoleCamera(true);
      setGreenMapOnly(false);
      setMeasurePin(null);
      lastMapTapRef.current = now;
      return;
    }
    lastMapTapRef.current = now;

    // Tap to measure: show distance from origin (player if on course, tee box if off course)
    // to the tapped point, plus tapped point → green.
    if (!Array.isArray(coords) || coords.length < 2 || !activeGreenPoi) {
      setMeasurePin(null);
      return;
    }
    const toGreen = Math.round(haversineYards(tapLat, tapLng, activeGreenPoi.Latitude, activeGreenPoi.Longitude));
    if (!Number.isFinite(toGreen) || toGreen > 800) {
      setMeasurePin(null);
      return;
    }
    const fromOrigin = (!isOffCourse && userPos)
      ? userPos
      : (teeBack ? { lat: teeBack.Latitude, lng: teeBack.Longitude } : userPos);

    const rawFrom = fromOrigin
      ? Math.round(haversineYards(fromOrigin.lat, fromOrigin.lng, tapLat, tapLng))
      : null;

    const fromDistance = (rawFrom != null && rawFrom >= 5 && rawFrom < 600) ? rawFrom : null;
    const fromLabel = isOffCourse ? 'tee' : 'you';

    setMeasurePin({ lng: tapLng, lat: tapLat, toGreen, fromDistance, fromLabel });
  }, [activeGreenPoi, isOffCourse, overlayState.anySheet, overlayState.shotFlow, resetHoleCamera, teeBack, userPos]);

  const handleCameraChanged = useCallback((event) => {
    overlayRef.current?.handleCameraChanged?.(event);
    // Reset green zoom state if user manually zooms out
    const zoom = event?.properties?.zoom;
    if (Number.isFinite(zoom) && zoom < 16.5 && greenMapOnly) {
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
      return {
        ...prev,
        [holeIndex]: [
          ...existing,
          {
            id: shotInput.id
              ? String(shotInput.id)
              : `gps-shot-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`,
            num: existing.length + 1,
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
          },
        ],
      };
    });
    setLieToast(lie);
    if (lieToastTimeoutRef.current) clearTimeout(lieToastTimeoutRef.current);
    lieToastTimeoutRef.current = setTimeout(() => setLieToast(null), 2500);
  }, [detectLieAtCoordinate, userPos]);

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

  const handleSelectHole = useCallback((nextIndex) => {
    setMeasurePin(null);
    if (nextIndex !== currentHoleIndex) {
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

    setCurrentHoleIndex(nextIndex);
    setLiveLie(LIVE_LIE_DEFAULT);
    setShowGreenSheet(false);
    setGreenMapOnly(false);
    setOverlayState({ anySheet: false, shotFlow: 'idle', selectedClub: null });
    setMissedShotBanner(null);
    setMissedShotForm(null);
    overlayRef.current?.resetOverlay?.();
  }, [currentHole, currentHoleIndex, currentHoleSummary?.putts, currentPutts, loggedShotsByHole, markHoleFlag, missedShotBanner?.holeIndex, missedShotBanner?.kind, missedShotBanner?.targetHoleIndex, selectedTeeYardage]);

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
    commitShotToHole(currentHoleIndex, missedShotBanner.shot);
    setMissedShotBanner(null);
  }, [commitShotToHole, currentHoleIndex, markHoleFlag, missedShotBanner]);

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
    commitShotToHole(missedShotForm.holeIndex, missedShotForm.queuedShot);
    setMissedShotForm(null);
    setMissedShotBanner(null);
  }, [commitShotToHole, detectLieAtCoordinate, insertRetrospectiveShot, missedShotForm]);

  const handleFinishRound = useCallback(() => {
    const gpsShots = Object.entries(loggedShotsByHole).flatMap(([holeIndex, shots]) =>
      (shots || []).map((shot, index) => ({
        id: String(shot.id || `${holeIndex}-${index}`),
        holeNumber: Number(holeIndex) + 1,
        shotNumber: typeof shot.num === 'number' ? shot.num : index + 1,
        club: shot.abbr || 'Shot',
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
      }))
    );

    if (!gpsShots.length) {
      Alert.alert('No GPS shots logged', 'Log at least one shot before continuing to score entry.');
      return;
    }

    const gpsHoleSummaries = Object.entries(holeSummariesByHole)
      .map(([holeIndex, summary]) => ({
        holeNumber: Number(holeIndex) + 1,
        firstPuttDistance: typeof summary.firstPuttDistance === 'number' ? summary.firstPuttDistance : null,
        pinLocation: summary.pinLocation || null,
        putts: typeof summary.putts === 'number' ? summary.putts : null,
      }))
      .filter((summary) => summary.firstPuttDistance !== null || summary.putts !== null || summary.pinLocation !== null);

    const payload = {
      courseId,
      courseName: courseName || course?.courseName || course?.name || 'GPS Round',
      teeName: selectedTee?.name || teeColor,
      startingHole,
      endingHole,
      roundLength,
      routeHoleNumbers: routeHoleNumbers?.length ? routeHoleNumbers : undefined,
      routeLabel: routeLabel || undefined,
      startedAt: roundStartedAtRef.current,
      endedAt: Date.now(),
      gpsShots,
      gpsHoleSummaries,
      gpsHoleFlags: Object.values(holeFlagsByHole),
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
  }, [course?.courseName, course?.name, courseId, courseName, endingHole, holeFlagsByHole, holeSummariesByHole, loggedShotsByHole, onFinishRound, roundLength, routeHoleNumbers, routeLabel, selectedTee?.name, startingHole, teeColor, visibleHoles]);

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
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={styles.screenShell}>
      <View
        style={[styles.gpsTopChromeWrap, { paddingTop: insets.top }]}
        pointerEvents="box-none"
      >
        <GpsGlassChrome
        courseName={courseName || course.courseName || 'GPS Round'}
        cachedLabel={cached ? 'Cached on device' : course?.source === 'LOCAL_SAMPLE' ? 'Local sample data' : 'Downloaded now'}
        selectedTeeName={selectedTee?.name || teeColor}
        selectedTeeYardage={selectedTeeYardage}
        topInset={0}
        routeLabel={routeLabel}
        hole={currentHole}
        currentHoleIndex={currentHoleIndex}
        holes={visibleHoles}
        holeNumbers={holeWindow.custom ? routeHoleNumbers : undefined}
        loggedHoles={visibleLoggedHoles}
        onSelectHole={(holeNumber) => handleSelectHole(holeWindow.custom ? holeNumber - 1 : holeNumber - 1 + holeWindow.startIndex)}
        onBack={handleBackPress}
        onGpsPress={() => {
          if (manualMode) { setManualMode(false); setManualYardage(''); }
          else if (gpsQuality === 'none') { setManualMode(true); }
        }}
        gpsLabel={manualMode ? 'MANUAL' : 'GPS'}
        gpsIcon={manualMode ? 'hand-left-outline' : gpsQuality === 'none' ? 'navigate-outline' : 'navigate'}
        onCardPress={() => setShowScorecard(true)}
        onFinishRound={handleFinishRound}
        weatherText={!tournamentMode
          ? `${Number.isFinite(weather?.windMph) ? `${Math.round(weather.windMph)} mph` : '--'}  ${Number.isFinite(weather?.tempF) ? `${Math.round(weather.tempF)}F` : '--'}  ${Number.isFinite(weather?.humidity) ? `${Math.round(weather.humidity)}%` : '--'}`
          : 'Tournament mode'}
        yardages={yardages}
        playingDistance={playingDistance}
        tournamentMode={tournamentMode}
        holeScores={holeScoresForSelector}
        isOffCourse={isOffCourse}
        showOffCourse={isOffCourse}
        teeYardage={selectedTeeYardage}
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
          style={StyleSheet.absoluteFillObject}
          styleURL={MapboxGL.StyleURL.Satellite}
          logoEnabled={false}
          attributionEnabled={false}
          scaleBarEnabled={false}
          compassEnabled={false}
          logoPosition={{ bottom: GPS_MAPBOX.LOGO_ATTRIBUTION_EDGE, left: GPS_MAPBOX.LOGO_ATTRIBUTION_EDGE }}
          attributionPosition={{ bottom: GPS_MAPBOX.LOGO_ATTRIBUTION_EDGE, right: GPS_MAPBOX.LOGO_ATTRIBUTION_EDGE }}
        >
          <MapboxGL.Camera ref={cameraRef} zoomLevel={16.2} />
          {geo && (
            <MapboxGL.ShapeSource id="hole-shapes" shape={geo}>
              <MapboxGL.CircleLayer id="green" filter={['==', ['get', 'kind'], 'green']} style={stylesMap.green} />
            </MapboxGL.ShapeSource>
          )}
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
                  <Text style={styles.routeLabelText}>{label.yardsToGreen}y</Text>
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
          {hazardCarries.map((hazard, index) => (
            <MapboxGL.MarkerView
              key={hazard.id}
              id={`haz-${hazard.id}`}
              coordinate={[hazard.lng, hazard.lat]}
            >
              <View style={[styles.carryWrap, getHazardPillOffsetStyle(hazard, index)]}>
                <View style={styles.carryPill}>
                  <Text style={[styles.carryTxt, { color: hazard.color }]}>
                    {hazard.front} front {hazard.carry} carry
                    <Text style={styles.carrySuffix}>y</Text>
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
                <View style={[
                  styles.mapShotBadge,
                  shot.num === currentHoleShots.length && styles.mapShotBadgeActive,
                ]}>
                  <View style={[styles.mapShotClubDot, shot.color ? { backgroundColor: shot.color } : null]} />
                  <Text style={styles.mapShotClubText}>{shot.abbr || `S${shot.num}`}</Text>
                  {Number.isFinite(shot.playingYards ?? shot.actualYards) ? (
                    <Text style={styles.mapShotYardsText}>{shot.playingYards ?? shot.actualYards}y</Text>
                  ) : null}
                </View>
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
                  {measurePin.fromDistance != null && (
                    <Text style={styles.measurePinFromYou}>{measurePin.fromDistance}y from {measurePin.fromLabel}</Text>
                  )}
                  <Text style={styles.measurePinText}>{measurePin.toGreen}y to green</Text>
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
                  lineWidth: 1.5,
                  lineDasharray: [4, 3],
                  lineOpacity: 0.7,
                }}
              />
            </MapboxGL.ShapeSource>
          )}
          {measurePin && !isOffCourse && userPos && (
            <MapboxGL.ShapeSource
              id="measure-line-from-player"
              shape={{
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: [
                    [userPos.lng, userPos.lat],
                    [measurePin.lng, measurePin.lat],
                  ],
                },
                properties: {},
              }}
            >
              <MapboxGL.LineLayer
                id="measure-line-from-player-layer"
                style={{
                  lineColor: '#60A5FA',
                  lineWidth: 1.2,
                  lineDasharray: [4, 3],
                  lineOpacity: 0.6,
                }}
              />
            </MapboxGL.ShapeSource>
          )}
          <GpsOverlay
            ref={overlayRef}
            userPos={userPos}
            startPoint={
              currentHoleShots.length > 0 && currentHoleShots[currentHoleShots.length - 1]?.from
                ? currentHoleShots[currentHoleShots.length - 1].from
                : userNearHole && userPos ? userPos : teeBack ? { lat: teeBack.Latitude, lng: teeBack.Longitude } : userPos
            }
            greenCenter={greenCenter}
            teePoi={teeBack}
            holePar={currentHole?.par}
            userClubs={userClubs}
            activeBagClubs={activeBagClubs}
            tournamentMode={tournamentMode}
            detectLieAtCoordinate={detectLieAtCoordinate}
            shotNumber={currentHoleShots.length + 1}
            previousLie={currentHoleShots.length > 0 ? currentHoleShots[currentHoleShots.length - 1]?.lie : null}
            onOverlayStateChange={setOverlayState}
            onShotLogged={(shot) => {
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
                return;
              }

              // Capture hole entry conditions on first shot
              if (existing.length === 0) {
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
              commitShotToHole(currentHoleIndex, shot);
            }}
          />
        </MapboxGL.MapView>
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
        {(overlayState.shotFlow === 'placing' || overlayState.shotFlow === 'confirming') && !overlayState.anySheet ? (
          <View pointerEvents="none" style={styles.placementMarkerWrap}>
            <View style={[
              styles.placementClubCircle,
              overlayState.activeLie?.color && { borderColor: overlayState.activeLie.color, shadowColor: overlayState.activeLie.color },
            ]}>
              <Text style={styles.placementClubCircleText}>
                {clubAbbr(overlayState.activeClub || 'DR')}
              </Text>
            </View>
            <View style={styles.placementPinLine} />
            <View style={styles.placementPinDot} />
          </View>
        ) : null}
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

      <View
        style={[styles.gpsHudWrap, { paddingBottom: insets.bottom }]}
        pointerEvents="box-none"
      >
      <GpsRoundHud
        suggestion={holeSuggestion}
        holeNumber={currentHole?.hole || currentHoleIndex + 1}
        displayNudge={displayNudge}
        showNudgeCard={Boolean(displayNudge)}
        nudgeOverlayBottom={coachingOverlayBottom}
        onPressSuggestion={() => {
          if (holeSuggestion?.state && holeSuggestion.state !== 'no_history') {
            setShowSuggestionModal(true);
            return;
          }
          overlayRef.current?.openClubPicker?.();
        }}
        bottomBarHeight={GPS_BAR.BOTTOM_ACTION}
        yardageBarHeight={GPS_BAR.YARDAGE}
        currentPutts={currentPutts}
        onDecrementPutts={() => setHoleSummariesByHole((prev) => ({
          ...prev,
          [currentHoleIndex]: {
            ...currentHoleSummary,
            putts: Math.max(0, currentPutts - 1),
          },
        }))}
        onIncrementPutts={() => setHoleSummariesByHole((prev) => ({
          ...prev,
          [currentHoleIndex]: {
            ...currentHoleSummary,
            putts: currentPutts + 1,
          },
        }))}
        addShotLabel="ADD SHOT"
        onPressAddShot={() => {
          if (overlayState.anySheet) return;
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
        greenTarget={greenTarget}
        onGreenTargetChange={setGreenTarget}
        manualMode={manualMode}
        manualYardage={manualYardage}
        onManualYardageChange={setManualYardage}
        onNextHole={() => {
          const advance = () => {
            if (currentHoleIndex >= visibleHoles.length - 1) {
              handleFinishRound();
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
        isPlacing={overlayState.shotFlow === 'placing' || overlayState.shotFlow === 'confirming'}
        showPlacementInstruction={!overlayState.anySheet && overlayState.shotFlow === 'placing'}
        placementClub={overlayState.activeClub}
        placementLie={overlayState.activeLie}
        placementDistance={overlayState.targetDistance}
        onCancelPlacement={() => {
          setMeasurePin(null);
          overlayRef.current?.resetOverlay?.();
        }}
        onConfirmPlacement={() => {
          setMeasurePin(null);
          overlayRef.current?.confirmAndLog?.();
        }}
        onCycleLie={() => overlayRef.current?.cycleLie?.()}
        onOpenClubPicker={() => overlayRef.current?.openClubPicker?.()}
      />
      </View>
      </View>

      <View
        style={[
          styles.rightMapStack,
          { bottom: insets.bottom + GPS_BAR.BOTTOM_ACTION + GPS_ABOVE_BAR.RIGHT_MAP_STACK },
        ]}
        pointerEvents="box-none"
      >
        <TouchableOpacity style={[styles.greenPill, greenMapOnly && styles.greenPillActive]} onPress={handleGreenMapToggle}>
          <Ionicons name="golf-outline" size={14} color={greenMapOnly ? '#fff' : colors.brand.primary} />
          <Text style={[styles.greenPillText, greenMapOnly && styles.greenPillTextActive]}>
            {greenMapOnly ? 'Overview' : greenTarget === 'front' ? 'Front' : greenTarget === 'back' ? 'Back' : 'Green'}
          </Text>
        </TouchableOpacity>
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
                <Text style={styles.historyTitle}>{holeSuggestion?.title || 'Hole tip'}</Text>
                <Text style={styles.historySubtitle}>{holeSuggestion?.support || 'Hole history'}</Text>
              </View>
              <TouchableOpacity style={styles.historyClose} onPress={() => setShowSuggestionModal(false)}>
                <Text style={styles.historyCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.suggestionModalBody}>
              <CoachingInsightCard suggestion={holeSuggestion} holeNumber={currentHole?.hole || currentHoleIndex + 1} />
            </View>
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
                      currentHoleSummary.putts === putts && styles.greenChoiceChipActive,
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
                      currentHoleSummary.putts === putts && styles.greenChoiceTextActive,
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
          return {
            hole: reviewHole,
            par: holeData?.par ?? 4,
            hcp: holeData?.hcp ?? holeData?.handicap ?? 0,
            score: summary.score ?? (shots.length > 0 ? shots.length : (summary.putts != null ? 1 : 0)) + (summary.putts || 0) + shots.reduce((sum, s) => sum + (s.penaltyStrokes || 0), 0),
            putts: summary.putts ?? 0,
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
  tee: {
    circleRadius: 6,
    circleColor: '#FFFFFF',
    circleStrokeWidth: 2,
    circleStrokeColor: '#111827',
  },
  green: {
    circleRadius: ['interpolate', ['linear'], ['zoom'], 14, 3, 16, 5, 18, 8],
    circleColor: 'rgba(16,185,129,0.0)',
    circleStrokeWidth: 2,
    circleStrokeColor: '#10B981',
  },
  user: {
    circleRadius: 8,
    circleColor: '#1ac855',
    circleStrokeWidth: 2.5,
    circleStrokeColor: '#FFFFFF',
  },
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  screenShell: { flex: 1, backgroundColor: 'transparent' },
  /** Top chrome: safe-area top inset applied here (not SafeAreaView). */
  gpsTopChromeWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    zIndex: GPS_Z.TOP_CHROME,
  },
  /** HUD fills the screen; bottom safe area via paddingBottom on this wrapper. */
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
  // ─── Placement marker (centered club circle) ──────
  placementMarkerWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: GPS_Z.PLACEMENT_MARKER,
  },
  placementClubCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 20, 25, 0.92)',
    borderWidth: 2.5,
    borderColor: colors.brand.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  placementClubCircleText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  placementPinLine: {
    width: 2,
    height: 14,
    backgroundColor: colors.brand.primary,
  },
  placementPinDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brand.primary,
  },
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
    width: 52,
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(5,10,8,0.9)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
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
    backgroundColor: 'rgba(15,15,15,0.92)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.4)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
    marginBottom: 4,
    gap: 1,
  },
  measurePinFromYou: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 12,
    fontWeight: '600',
  },
  measurePinText: {
    color: '#FBBF24',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  measurePinDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FBBF24',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.5)',
  },
  mapShotClubDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brand.primary,
    marginRight: 6,
  },
  mapShotClubText: {
    color: colors.text.primary,
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 20,
    marginRight: 8,
  },
  mapShotYardsText: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  playerDotWrap: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
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
  suggestionModalBody: {
    paddingHorizontal: 18,
    paddingBottom: 24,
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
