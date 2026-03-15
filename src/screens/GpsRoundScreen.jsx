import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getCourse, saveCourse } from '../services/courseCache';
import { fetchCourseHolesFromBackend } from '../services/golfApi';
import { requestGpsPermission, watchUserPosition } from '../services/gps';
import { haversineYards } from '../services/haversine';
import { MAPBOX_PUBLIC_TOKEN } from '../config/mapbox';
import { HoleHeader } from '../components/gps/HoleHeader';
import { HoleDots } from '../components/gps/HoleDots';
import { YardagePanel } from '../components/gps/YardagePanel';
import GpsOverlay from '../components/gps/GpsOverlay';
import { getUserProfile } from '../services/userService';
import { getNativeHoleCameraConfig, isCoordWithinBounds } from '../services/mapFraming';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { getElevationFeet } from '../services/weatherService';
import { endLiveActivity, isLiveActivitySupported, upsertLiveActivity } from '../services/liveActivityService';
import { getRounds } from '../services/roundsService';
import { buildInRoundNudge, buildInRoundNudgeContext } from '../services/inRoundNudgeService';
import { getRecentHoleNote } from '../services/holeNotesService';
import { fetchCourseStats, getSuggestedClub } from '../services/courseStatsService';
import { ClubHistorySheet } from '../components/gps/ClubHistorySheet';
import { getCurrentUser } from '../services/firebaseAuthService';
import { colors, radius, spacing, typography } from '../theme/tokens';
import {
  buildShotLineCoords,
  distanceYardsBetween,
  getBestApproachDistance,
  getPar5Marker2Info,
  getSafeModeDistance,
  lineMidpoint,
  pointAtDistanceAlongLine,
  pointAtDistanceFromEnd,
} from '../services/shotLineUtils';
import { LayupMarkerView } from '../components/gps/LayupMarkerView';
import { ModeToggle } from '../components/gps/ModeToggle';

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
  lie: 'Locating...',
  color: null,
  showDot: false,
};

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
  const teePois = pois.filter((poi) => poi.POI === 'Tee Back' || poi.POI === 'Tee Middle' || poi.POI === 'Tee Front');
  const bunkerPois = pois.filter((poi) => poi.POI === 'Fairway Bunker' || poi.POI === 'Green Bunker');
  const waterPois = pois.filter((poi) => poi.POI === 'Water');
  const treePois = pois.filter((poi) => poi.POI === 'Trees');

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

  const metrics = getSegmentMetrics(userPos, teePoi, greenPoi);
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

function pickSuggestedClub(targetYards, userClubs, holeNoteClub) {
  const entries = Object.entries(userClubs || {})
    .filter(([, yards]) => Number.isFinite(yards))
    .map(([club, yards]) => ({ club, yards: Number(yards) }))
    .sort((a, b) => b.yards - a.yards);
  if (!entries.length || !Number.isFinite(targetYards)) return null;

  // If a hole note mentions a specific club, prefer it if it's in the user's bag
  if (holeNoteClub) {
    const noteNorm = holeNoteClub.toLowerCase().replace(/[-\s]/g, '');
    const noteMatch = entries.find((e) => e.club.toLowerCase().replace(/[-\s]/g, '') === noteNorm);
    if (noteMatch) return { ...noteMatch, fromNote: true };
  }

  return entries.reduce((best, entry) => {
    if (!best) return entry;
    return Math.abs(entry.yards - targetYards) < Math.abs(best.yards - targetYards) ? entry : best;
  }, null);
}

const CLUB_PATTERN = /\b(driver|3w|3-wood|3 wood|5w|5-wood|5 wood|7w|7-wood|7 wood|2h|3h|4h|5h|2-hybrid|3-hybrid|4-hybrid|5-hybrid|2 hybrid|3 hybrid|4 hybrid|5 hybrid|1i|2i|3i|4i|5i|6i|7i|8i|9i|1-iron|2-iron|3-iron|4-iron|5-iron|6-iron|7-iron|8-iron|9-iron|1 iron|2 iron|3 iron|4 iron|5 iron|6 iron|7 iron|8 iron|9 iron|pw|pitching wedge|gw|gap wedge|52|50|aw|sw|sand wedge|54|56|lw|lob wedge|58|60)\b/i;

// Normalise verbose club names from notes to the short keys used in clubDistances
// e.g. "7 iron" → "7i", "pitching wedge" → "PW", "3-wood" → "3W", "driver" → "Driver"
function normalizeClubName(raw) {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s === 'driver') return 'Driver';
  // "7 iron" / "7-iron" → "7i"
  const ironMatch = s.match(/^(\d)\s*[-\s]?\s*iron$/);
  if (ironMatch) return `${ironMatch[1]}i`;
  // "3 wood" / "3-wood" → "3W"
  const woodMatch = s.match(/^(\d)\s*[-\s]?\s*wood$/);
  if (woodMatch) return `${woodMatch[1]}W`;
  // "3 hybrid" / "3-hybrid" → "3H"
  const hybridMatch = s.match(/^(\d)\s*[-\s]?\s*hybrid$/);
  if (hybridMatch) return `${hybridMatch[1]}H`;
  // "pitching wedge" → "PW", "gap wedge" → "GW", "sand wedge" → "SW", "lob wedge" → "LW"
  const wedgeMap = { pitching: 'PW', gap: 'GW', sand: 'SW', lob: 'LW' };
  const wedgeMatch = s.match(/^(pitching|gap|sand|lob)\s+wedge$/);
  if (wedgeMatch) return wedgeMap[wedgeMatch[1]];
  // Degree-based wedges: "52" → "52", "56" → "56"
  if (/^\d{2}$/.test(s)) return s;
  // Already short form — uppercase first letter: "pw" → "PW", "7i" → "7i", "3w" → "3W"
  return raw.toUpperCase();
}

function extractClubFromNote(noteText) {
  if (!noteText) return null;
  const match = noteText.match(CLUB_PATTERN);
  return match ? normalizeClubName(match[1]) : null;
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

function walkBackFromGreen(greenLat, greenLng, teeLat, teeLng, yards) {
  const bearing = bearingDeg(greenLat, greenLng, teeLat, teeLng);
  const distanceMeters = yards * 0.9144;
  const earthRadius = 6371000;
  const angularDistance = distanceMeters / earthRadius;
  const lat1 = toRadians(greenLat);
  const lng1 = toRadians(greenLng);
  const brng = toRadians(bearing);

  const lat2 = Math.asin(
    (Math.sin(lat1) * Math.cos(angularDistance)) +
    (Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(brng))
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(brng) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - (Math.sin(lat1) * Math.sin(lat2))
  );

  return { lat: toDegrees(lat2), lng: toDegrees(lng2) };
}

function getYardageMarkers(hole, teePoi, greenPoi) {
  if (!hole || !teePoi || !greenPoi || hole.par === 3) return [];
  const yardages = hole.par === 5 ? [100, 150, 200, 250] : [100, 150, 200];
  const colorMap = { 100: '#F87171', 150: '#FFFFFF', 200: '#60A5FA', 250: '#F6C90E' };
  return yardages.map((yds) => ({
    yds,
    color: colorMap[yds],
    ...walkBackFromGreen(greenPoi.Latitude, greenPoi.Longitude, teePoi.Latitude, teePoi.Longitude, yds),
  }));
}

function getHazardCarries(hole, userPos, weather, shotBearingDeg, elevationFt = 0) {
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
    const elevAdj = Math.round(((elevationFt || 0) / 100) * actual * 0.01);
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

export function GpsRoundScreen({
  courseId,
  courseName,
  teeColor = 'Blue',
  startingHole = 1,
  tournamentMode = false,
  onBack,
  onFinishRound,
  onSwitchToManual,
}) {
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
  const [userClubs, setUserClubs] = useState(null);
  const [activeBag, setActiveBag] = useState(null); // BagItem[] for club rail
  const [liveLie, setLiveLie] = useState(LIVE_LIE_DEFAULT);
  const [overlayState, setOverlayState] = useState({ anySheet: false, shotFlow: 'idle', selectedClub: null });
  const [weather, setWeather] = useState(null);
  const [loggedShotsByHole, setLoggedShotsByHole] = useState({});
  const [holeSummariesByHole, setHoleSummariesByHole] = useState({});
  const [lieToast, setLieToast] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [historyHoleIndex, setHistoryHoleIndex] = useState(null);
  const [elevationFt, setElevationFt] = useState(0);
  const [liveActivityEnabled, setLiveActivityEnabled] = useState(false);
  const [coachingEnabled, setCoachingEnabled] = useState(true);
  const [showGreenSheet, setShowGreenSheet] = useState(false);
  const [recentRounds, setRecentRounds] = useState([]);
  const [holeNoteClub, setHoleNoteClub] = useState(null);
  const [courseStats, setCourseStats] = useState({});
  const [showClubHistory, setShowClubHistory] = useState(false);
  // Shot line / lay-up marker state
  const [shotLineMode, setShotLineMode] = useState('scoring'); // 'scoring' | 'safe'
  const [layup1Position, setLayup1Position] = useState(null);
  const [layup1DistFromTee, setLayup1DistFromTee] = useState(null);
  const [layup1DistToNext, setLayup1DistToNext] = useState(null);
  const [layup2Position, setLayup2Position] = useState(null);
  const [layup2DistFromM1, setLayup2DistFromM1] = useState(null);
  const [layup2DistToGreen, setLayup2DistToGreen] = useState(null);
  const [layup2Type, setLayup2Type] = useState('layup'); // 'layup' | 'go_for_it'
  const [approachClub, setApproachClub] = useState(null);
  const lieToastTimeoutRef = useRef(null);
  const roundStartedAtRef = useRef(Date.now());

  // Dynamic map height — fills exact available space without scrolling on any device.
  // Use onLayout on each zone to verify these constants on physical hardware,
  // then remove the onLayout handlers once confirmed.
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const NAV_BAR_HEIGHT = 120;    // topBar(~46) + HoleHeader(~30) + HoleDots(~44)
  const YARDAGE_BAR_HEIGHT = 64; // YardagePanel
  const HELPER_BAR_HEIGHT = 28;  // helperBar hint text
  const mapHeight = Math.max(
    200,
    screenHeight - insets.top - insets.bottom - NAV_BAR_HEIGHT - YARDAGE_BAR_HEIGHT - HELPER_BAR_HEIGHT
  );

  const currentHole = course?.holes?.[currentHoleIndex] || null;
  const selectedTee = useMemo(() => {
    const tees = Array.isArray(currentHole?.tees) ? currentHole.tees : [];
    return tees.find((tee) => normalizeTeeName(tee?.name) === normalizeTeeName(teeColor)) || tees[0] || null;
  }, [currentHole, teeColor]);
  const hazardTags = useMemo(() => getHazardTags(currentHole), [currentHole]);
  const teeBack = useMemo(
    () => findPoi(currentHole, 'Tee Back', 'C') || findPoi(currentHole, 'Tee Front', 'C'),
    [currentHole]
  );
  const greenCenter = useMemo(
    () => findPoi(currentHole, 'Green', 'C'),
    [currentHole]
  );
  const greenFront = useMemo(() => findPoi(currentHole, 'Green', 'F'), [currentHole]);
  const greenBack = useMemo(() => findPoi(currentHole, 'Green', 'B'), [currentHole]);
  const shotBearingDeg = useMemo(() => {
    if (!userPos || !greenCenter) return null;
    const dy = (greenCenter.Latitude - userPos.lat) * (Math.PI / 180);
    const dx = ((greenCenter.Longitude - userPos.lng) * (Math.PI / 180)) * Math.cos(((greenCenter.Latitude + userPos.lat) / 2) * (Math.PI / 180));
    return normalizeDegrees(Math.atan2(dx, dy) * (180 / Math.PI));
  }, [greenCenter, userPos]);
  const centerYards = Number.isFinite(yardages.center) ? yardages.center : null;
  const playingDistance = useMemo(() => {
    if (tournamentMode || !Number.isFinite(centerYards) || !Number.isFinite(shotBearingDeg)) return null;
    const base = getPlayingAdjustment(centerYards, weather, shotBearingDeg);
    const elevAdj = Math.round(((elevationFt || 0) / 100) * centerYards * 0.01);
    return {
      adjustedYards: Math.max(0, Math.round(centerYards + (base?.windAdj ?? 0) + (base?.tempAdj ?? 0) + elevAdj)),
      tempAdj: base?.tempAdj ?? 0,
      windAdj: base?.windAdj ?? 0,
      elevAdj,
    };
  }, [centerYards, elevationFt, shotBearingDeg, tournamentMode, weather]);
  const suggestedClub = useMemo(
    () => pickSuggestedClub(tournamentMode ? centerYards : playingDistance?.adjustedYards, userClubs, holeNoteClub),
    [centerYards, holeNoteClub, playingDistance?.adjustedYards, tournamentMode, userClubs]
  );
  // Per-hole club suggestion (data-backed or distance-based fallback)
  const holeNumber = (currentHole?.hole || currentHoleIndex + 1);
  const holeDoc = courseStats[String(holeNumber)] || null;
  const suggestion = useMemo(
    () => getSuggestedClub(holeDoc, suggestedClub?.club || null, suggestedClub?.yards || null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [holeNumber, holeDoc, suggestedClub?.club, suggestedClub?.yards]
  );
  const currentHoleShots = loggedShotsByHole[currentHoleIndex] || [];
  const currentHoleSummary = holeSummariesByHole[currentHoleIndex] || { firstPuttDistance: null, pinLocation: 'middle', putts: null };
  const currentRoundShots = useMemo(
    () => Object.values(loggedShotsByHole).flatMap((shots) => shots || []),
    [loggedShotsByHole]
  );
  const yardageMarkers = useMemo(() => getYardageMarkers(currentHole, teeBack, greenCenter), [currentHole, teeBack, greenCenter]);
  const hazardCarries = useMemo(
    () => getHazardCarries(currentHole, userPos, weather, shotBearingDeg, elevationFt),
    [currentHole, elevationFt, shotBearingDeg, userPos, weather]
  );
  const nudgeContext = useMemo(() => buildInRoundNudgeContext(recentRounds), [recentRounds]);
  const activeNudge = useMemo(() => {
    if (!coachingEnabled || overlayState.anySheet || overlayState.shotFlow !== 'idle' || showGreenSheet) return null;
    return buildInRoundNudge({
      holeNumber: currentHole?.hole || currentHoleIndex + 1,
      holePar: currentHole?.par || 4,
      liveLie: liveLie?.lie || null,
      selectedClub: overlayState.selectedClub || null,
      suggestedClub: suggestedClub?.club || null,
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
    suggestedClub?.club,
    tournamentMode,
    weather,
    showGreenSheet,
  ]);

  // ---------------------------------------------------------------------------
  // Shot line and lay-up marker geometry
  // ---------------------------------------------------------------------------

  /** [lng, lat] pairs, tee-first. null when tee/green POIs are missing. */
  const shotLineCoords = useMemo(
    () => buildShotLineCoords(teeBack, greenCenter, currentHole?.fairwayCenterline),
    [currentHole?.fairwayCenterline, greenCenter, teeBack],
  );

  /** GeoJSON FeatureCollection for the dashed shot line layer. */
  const shotLineGeoJSON = useMemo(() => {
    if (!shotLineCoords) return null;
    return {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: shotLineCoords },
        properties: { kind: 'shot-line' },
      }],
    };
  }, [shotLineCoords]);

  /** Derived: true once the tee shot has been logged on this hole. */
  const teeShottLogged = currentHoleShots.length > 0;

  /** Par 3 badge position — midpoint of the shot line. */
  const par3BadgeCoord = useMemo(
    () => (currentHole?.par === 3 && shotLineCoords ? lineMidpoint(shotLineCoords) : null),
    [currentHole?.par, shotLineCoords],
  );

  /** Par 3 yardage to pin (or green center). */
  const par3DistToPin = useMemo(() => {
    if (currentHole?.par !== 3 || !teeBack || !greenCenter) return null;
    return Math.round(distanceYardsBetween(
      [teeBack.Longitude, teeBack.Latitude],
      [greenCenter.Longitude, greenCenter.Latitude],
    ));
  }, [currentHole?.par, greenCenter, teeBack]);

  // Initialise / re-initialise lay-up markers whenever the hole or mode changes.
  useEffect(() => {
    if (!shotLineCoords || !teeBack || !greenCenter || currentHole?.par === 3) {
      setLayup1Position(null);
      setLayup2Position(null);
      return;
    }

    const teeCoord  = [teeBack.Longitude, teeBack.Latitude];
    const greenCoord = [greenCenter.Longitude, greenCenter.Latitude];

    let m1Pos;
    if (shotLineMode === 'scoring') {
      const { distanceFromGreen, club } = getBestApproachDistance(userClubs);
      setApproachClub(club);
      m1Pos = pointAtDistanceFromEnd(shotLineCoords, distanceFromGreen);
    } else {
      setApproachClub(null);
      const safeYards = getSafeModeDistance(userClubs);
      m1Pos = pointAtDistanceAlongLine(shotLineCoords, safeYards);
    }

    setLayup1Position(m1Pos);
    setLayup1DistFromTee(Math.round(distanceYardsBetween(teeCoord, m1Pos)));

    if (currentHole?.par === 5) {
      const { reachable } = getPar5Marker2Info(m1Pos, greenCoord, userClubs);
      let m2Pos;
      if (reachable) {
        setLayup2Type('go_for_it');
        m2Pos = greenCoord;
      } else {
        setLayup2Type('layup');
        const { distanceFromGreen } = getBestApproachDistance(userClubs);
        m2Pos = pointAtDistanceFromEnd(shotLineCoords, distanceFromGreen);
      }
      setLayup2Position(m2Pos);
      setLayup1DistToNext(Math.round(distanceYardsBetween(m1Pos, m2Pos)));
      setLayup2DistFromM1(Math.round(distanceYardsBetween(m1Pos, m2Pos)));
      setLayup2DistToGreen(Math.round(distanceYardsBetween(m2Pos, greenCoord)));
    } else {
      // Par 4: Marker 1's "distToNext" is the distance to the green
      setLayup2Position(null);
      setLayup1DistToNext(Math.round(distanceYardsBetween(m1Pos, greenCoord)));
    }

  }, [currentHole?.par, currentHoleIndex, shotLineCoords, shotLineMode, teeBack, greenCenter, userClubs]);

  // ---------------------------------------------------------------------------
  // Live activity, GPS, and other existing effects
  // ---------------------------------------------------------------------------

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

  const resetHoleCamera = useCallback((includeUser = !!userPos) => {
    if (!MapboxGL || !currentHole || !cameraRef.current) return;
    const frame = getNativeHoleCameraConfig(currentHole, includeUser ? userPos : null, { includeUser });
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
  }, [currentHole, userPos]);

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
      setError(err instanceof Error ? err.message : 'Unable to load course');
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadCourse();
  }, [loadCourse]);

  // Fetch per-hole club history for the suggestion engine
  useEffect(() => {
    const uid = getCurrentUser()?.uid;
    if (!uid || !courseId || !teeColor) return;
    fetchCourseStats(uid, courseId, teeColor)
      .then(stats => setCourseStats(stats))
      .catch(() => {});
  }, [courseId, teeColor]);

  useEffect(() => {
    setCurrentHoleIndex(Math.max(0, (startingHole || 1) - 1));
  }, [startingHole, courseId]);

  useEffect(() => {
    let active = true;
    getUserProfile()
      .then((profile) => {
        if (!active) return;
        setUserClubs(profile?.clubDistances ?? null);
        const bag = profile?.clubBag;
        if (Array.isArray(bag) && bag.length > 0) {
          setActiveBag(bag.filter((item) => item.enabled));
        }
      })
      .catch(() => {
        if (active) setUserClubs(null);
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

  useEffect(() => {
    let active = true;
    const holeNum = currentHole?.hole || currentHoleIndex + 1;
    if (!courseId || !holeNum) {
      setHoleNoteClub(null);
      return undefined;
    }
    getRecentHoleNote(courseId, holeNum)
      .then((note) => {
        if (!active) return;
        setHoleNoteClub(note ? extractClubFromNote(note.text) : null);
      })
      .catch(() => {
        if (active) setHoleNoteClub(null);
      });
    return () => {
      active = false;
    };
  }, [courseId, currentHole?.hole, currentHoleIndex]);

  useEffect(() => () => {
    if (lieToastTimeoutRef.current) clearTimeout(lieToastTimeoutRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!userPos || tournamentMode) {
      setWeather(null);
      return undefined;
    }
    getGpsWeather(userPos.lat, userPos.lng)
      .then((next) => {
        if (!cancelled) setWeather(next);
      })
      .catch(() => {
        if (!cancelled) setWeather(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tournamentMode, userPos]);

  useEffect(() => {
    let cancelled = false;
    if (!teeBack) {
      setElevationFt(0);
      return undefined;
    }
    getElevationFeet(teeBack.Latitude, teeBack.Longitude)
      .then((next) => {
        if (!cancelled) setElevationFt(next ?? 0);
      })
      .catch(() => {
        if (!cancelled) setElevationFt(0);
      });
    return () => {
      cancelled = true;
    };
  }, [teeBack]);

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
        },
        () => setError('GPS signal unavailable.')
      );
    };

    start().catch(() => setError('Failed to start GPS.'));
    return () => {
      mounted = false;
      locationSubRef.current?.remove?.();
    };
  }, []);

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
  }, [currentHole, resetHoleCamera]);

  useEffect(() => {
    if (!MapboxGL || !currentHole || !cameraRef.current || !userPos) return;
    const currentBounds = frameBoundsRef.current;
    const userCoord = [userPos.lng, userPos.lat];
    if (currentBounds && isCoordWithinBounds(userCoord, currentBounds)) return;
    resetHoleCamera(true);
  }, [currentHole, resetHoleCamera, userPos]);

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
        geometry: {
          type: 'LineString',
          coordinates: [
            [tee.Longitude, tee.Latitude],
            [green.Longitude, green.Latitude],
          ],
        },
        properties: { kind: 'line' },
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [tee.Longitude, tee.Latitude] },
        properties: { kind: 'tee' },
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [green.Longitude, green.Latitude] },
        properties: { kind: 'green' },
      },
    ];

    if (userPos) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [userPos.lng, userPos.lat] },
        properties: { kind: 'user' },
      });
    }

    return { type: 'FeatureCollection', features };
  }, [currentHole, greenCenter, teeBack, userPos]);

  const jumpToPoi = useCallback((poi, zoomLevel = 17) => {
    if (!poi || !cameraRef.current) return;
    cameraRef.current?.setCamera({
      centerCoordinate: [poi.Longitude, poi.Latitude],
      zoomLevel,
      animationDuration: 800,
      animationMode: 'flyTo',
    });
  }, []);

  const handleMapPress = useCallback(() => {
    const now = Date.now();
    if (now - lastMapTapRef.current <= 280) {
      resetHoleCamera(true);
    }
    lastMapTapRef.current = now;
  }, [resetHoleCamera]);

  const handleSelectHole = useCallback((nextIndex) => {
    setCurrentHoleIndex(nextIndex);
    setLiveLie(LIVE_LIE_DEFAULT);
    setShowGreenSheet(false);
    setOverlayState({ anySheet: false, shotFlow: 'idle', selectedClub: null });
    overlayRef.current?.resetOverlay?.();
  }, []);

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
      startedAt: roundStartedAtRef.current,
      endedAt: Date.now(),
      gpsShots,
      gpsHoleSummaries,
    };

    Alert.alert(
      'Finish GPS Round',
      'Continue to score entry and save this round with the logged GPS shots?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: () => onFinishRound?.(payload),
        },
      ]
    );
  }, [course?.courseName, course?.name, courseId, courseName, holeSummariesByHole, loggedShotsByHole, onFinishRound, selectedTee?.name, startingHole, teeColor]);

  if (!MapboxGL) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.fallbackCenter}>
          <Text style={styles.errorText}>@rnmapbox/maps is not installed yet.</Text>
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.fallbackCenter}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>Downloading course…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.fallbackCenter}>
          <Text style={styles.errorText}>{error || 'Course data unavailable'}</Text>
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onBack} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={20} color="#E5E7EB" />
        </TouchableOpacity>
        <View style={styles.topBarCenter}>
          <Text style={styles.courseName} numberOfLines={1}>{courseName || course.courseName || 'GPS Round'}</Text>
          <Text style={styles.subMeta}>
            {cached ? 'Cached on device' : course?.source === 'LOCAL_SAMPLE' ? 'Local sample data' : 'Downloaded now'} • {selectedTee?.name || teeColor} • {selectedTee?.yards ? `${selectedTee.yards}c` : '--'}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.iconBtn, coachingEnabled && styles.iconBtnActive]}
          onPress={() => setCoachingEnabled((value) => !value)}
        >
          <Ionicons name="bulb-outline" size={16} color={coachingEnabled ? colors.brand.primary : 'rgba(255,255,255,0.55)'} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => setShowHistory(true)}>
          <Ionicons name="time-outline" size={16} color="rgba(255,255,255,0.55)" />
        </TouchableOpacity>
        {onSwitchToManual && (
          <TouchableOpacity style={styles.gpsPill} onPress={onSwitchToManual}>
            <Ionicons name="navigate" size={11} color="#FFFFFF" />
            <Text style={styles.gpsPillText}>GPS</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[
            styles.scorePill,
            currentHoleShots.length > 0 ? styles.scorePillHot : styles.scorePillMuted,
          ]}
          onPress={handleFinishRound}
        >
          <Text
            style={[
              styles.scorePillText,
              currentHoleShots.length > 0 ? styles.scorePillTextHot : styles.scorePillTextMuted,
            ]}
          >
            {currentHoleShots.length > 0 ? `Finish (${currentHoleShots.length})` : 'Finish'}
          </Text>
        </TouchableOpacity>
      </View>

      <HoleHeader hole={currentHole} hazardTags={hazardTags} liveLie={liveLie} />
      <HoleDots holes={course?.holes || []} currentHole={currentHoleIndex} onSelect={handleSelectHole} />

      <View style={[styles.mapWrap, { height: mapHeight }]}>
        <MapboxGL.MapView
          onPress={handleMapPress}
          onLongPress={(event) => overlayRef.current?.handleLongPress(event)}
          style={styles.map}
          styleURL={MapboxGL.StyleURL.SatelliteStreet}
          logoEnabled={false}
          attributionEnabled={false}
          logoPosition={{ bottom: 8, left: 8 }}
          attributionPosition={{ bottom: 8, right: 8 }}
        >
          <MapboxGL.Camera ref={cameraRef} zoomLevel={16.2} />
          {geo && (
            <MapboxGL.ShapeSource id="hole-shapes" shape={geo}>
              <MapboxGL.LineLayer id="line" filter={['==', ['get', 'kind'], 'line']} style={stylesMap.line} />
              <MapboxGL.CircleLayer id="tee" filter={['==', ['get', 'kind'], 'tee']} style={stylesMap.tee} />
              <MapboxGL.CircleLayer id="green" filter={['==', ['get', 'kind'], 'green']} style={stylesMap.green} />
              <MapboxGL.CircleLayer id="user" filter={['==', ['get', 'kind'], 'user']} style={stylesMap.user} />
            </MapboxGL.ShapeSource>
          )}

          {/* Dashed shot-planning line — visible until tee shot is logged */}
          {shotLineGeoJSON && !teeShottLogged && (
            <MapboxGL.ShapeSource id="shot-line-src" shape={shotLineGeoJSON}>
              <MapboxGL.LineLayer
                id="shot-line-layer"
                style={{
                  lineColor: 'rgba(255,255,255,0.45)',
                  lineWidth: 2,
                  lineDasharray: [6, 4],
                }}
              />
            </MapboxGL.ShapeSource>
          )}

          {/* Lay-up Marker 1 — par 4 and par 5 */}
          {layup1Position && !teeShottLogged && currentHole?.par !== 3 && (
            <MapboxGL.PointAnnotation
              id="layup1"
              coordinate={layup1Position}
              draggable
              onDrag={(e) => {
                const snapped = e.geometry.coordinates;
                if (!shotLineCoords) return;
                setLayup1Position(snapped);
                const teeCoord = teeBack ? [teeBack.Longitude, teeBack.Latitude] : snapped;
                const greenCoord = greenCenter ? [greenCenter.Longitude, greenCenter.Latitude] : snapped;
                setLayup1DistFromTee(Math.round(distanceYardsBetween(teeCoord, snapped)));
                if (currentHole?.par === 5 && layup2Position) {
                  setLayup1DistToNext(Math.round(distanceYardsBetween(snapped, layup2Position)));
                } else {
                  setLayup1DistToNext(Math.round(distanceYardsBetween(snapped, greenCoord)));
                }
              }}
            >
              <LayupMarkerView
                distFromTee={layup1DistFromTee}
                distToNext={layup1DistToNext}
                nextLabel={currentHole?.par === 5 ? 'to M2' : 'to pin'}
                colour="white"
                mode={shotLineMode}
                approachClub={shotLineMode === 'scoring' ? approachClub : null}
              />
            </MapboxGL.PointAnnotation>
          )}

          {/* Lay-up Marker 2 — par 5 only */}
          {layup2Position && !teeShottLogged && currentHole?.par === 5 && (
            <MapboxGL.PointAnnotation
              id="layup2"
              coordinate={layup2Position}
              draggable
              onDrag={(e) => {
                const snapped = e.geometry.coordinates;
                setLayup2Position(snapped);
                const greenCoord = greenCenter ? [greenCenter.Longitude, greenCenter.Latitude] : snapped;
                setLayup2DistFromM1(layup1Position ? Math.round(distanceYardsBetween(layup1Position, snapped)) : null);
                setLayup1DistToNext(layup1Position ? Math.round(distanceYardsBetween(layup1Position, snapped)) : null);
                setLayup2DistToGreen(Math.round(distanceYardsBetween(snapped, greenCoord)));
              }}
            >
              <LayupMarkerView
                distFromTee={layup2DistFromM1}
                distToNext={layup2DistToGreen}
                nextLabel="to pin"
                colour="gold"
                type={layup2Type}
                mode={shotLineMode}
                approachClub={shotLineMode === 'scoring' ? approachClub : null}
              />
            </MapboxGL.PointAnnotation>
          )}

          {/* Par 3 — single distance badge at line midpoint, no lay-up markers */}
          {par3BadgeCoord && !teeShottLogged && (
            <MapboxGL.PointAnnotation
              id="par3-badge"
              coordinate={par3BadgeCoord}
            >
              <View style={styles.par3Badge}>
                <Text style={styles.par3BadgeText}>{par3DistToPin ?? '--'}y</Text>
                <Text style={styles.par3BadgeLabel}>to green</Text>
              </View>
            </MapboxGL.PointAnnotation>
          )}

          {yardageMarkers.map((marker) => (
            <MapboxGL.PointAnnotation
              key={`yd-${marker.yds}`}
              id={`yd-${marker.yds}`}
              coordinate={[marker.lng, marker.lat]}
            >
              <View style={styles.ydMarkerWrap}>
                <View style={[styles.ydLine, { borderColor: marker.color }]} />
                <View style={[styles.ydDiamond, { borderColor: marker.color, backgroundColor: `${marker.color}2E` }]} />
                <Text style={[styles.ydNum, { color: marker.color }]}>{marker.yds}</Text>
              </View>
            </MapboxGL.PointAnnotation>
          ))}
          {hazardCarries.map((hazard) => (
            <MapboxGL.PointAnnotation
              key={hazard.id}
              id={`haz-${hazard.id}`}
              coordinate={[hazard.lng, hazard.lat]}
            >
              <View style={styles.carryWrap}>
                <View style={styles.carryPill}>
                  <Text style={[styles.carryTxt, { color: hazard.color }]}>
                    {hazard.actual}
                    <Text style={styles.carrySuffix}>y</Text>
                  </Text>
                </View>
              </View>
            </MapboxGL.PointAnnotation>
          ))}
          <GpsOverlay
            ref={overlayRef}
            userPos={userPos}
            greenCenter={greenCenter}
            teePoi={teeBack}
            holePar={currentHole?.par}
            userClubs={userClubs}
            activeBag={activeBag}
            tournamentMode={tournamentMode}
            onOverlayStateChange={setOverlayState}
            onShotLogged={(shot) => {
              const clubLabel = String(shot.club || '');
              const abbr = clubLabel.length <= 3
                ? clubLabel
                : clubLabel.split(/\s+/).map((part) => part[0]).join('').slice(0, 3).toUpperCase();
              const lie = detectLiveLie(userPos, currentHole, teeBack, greenCenter);
              setLoggedShotsByHole((prev) => {
                const existing = prev[currentHoleIndex] || [];
                return {
                  ...prev,
                  [currentHoleIndex]: [
                    ...existing,
                    {
                      id: shot.loggedAt || `${Date.now()}`,
                      num: existing.length + 1,
                      abbr,
                      actualYards: shot.actualYards,
                      playingYards: shot.playingYards,
                      from: shot.from || null,
                      to: shot.to || null,
                      weather: shot.weather || null,
                      loggedAt: shot.loggedAt || null,
                      lie: lie.lie,
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
                    },
                  ],
                };
              });
              setLieToast(lie);
              if (lieToastTimeoutRef.current) clearTimeout(lieToastTimeoutRef.current);
              lieToastTimeoutRef.current = setTimeout(() => setLieToast(null), 2500);
            }}
          />
        </MapboxGL.MapView>
        {!overlayState.anySheet && (
          <View style={styles.weatherStrip}>
            {!tournamentMode ? (
              <>
                <Ionicons
                  name="navigate"
                  size={12}
                  color="rgba(255,255,255,0.7)"
                  style={{ transform: [{ rotate: getWindArrowRotation(weather?.windDegrees) }] }}
                />
                <Text style={styles.weatherText}>{getWindText(weather?.windMph)}</Text>
                <View style={styles.weatherDivider} />
                <Text style={styles.weatherText}>{Number.isFinite(weather?.tempF) ? `${Math.round(weather.tempF)}F` : '--'}</Text>
                <View style={styles.weatherDivider} />
                <Ionicons name="water-outline" size={12} color="rgba(255,255,255,0.7)" />
                <Text style={styles.weatherText}>{Number.isFinite(weather?.humidity) ? `${Math.round(weather.humidity)}%` : '--'}</Text>
              </>
            ) : (
              <Text style={styles.weatherText}>Tournament mode</Text>
            )}
          </View>
        )}
        {!overlayState.anySheet && overlayState.shotFlow === 'idle' && (
          <>
            <View style={styles.distanceBadge}>
              <Text style={styles.distanceBadgeLabel}>{tournamentMode ? 'GPS' : 'PLAYING'}</Text>
              <Text style={styles.distanceValue}>
                {tournamentMode ? centerYards ?? '--' : playingDistance?.adjustedYards ?? centerYards ?? '--'}
              </Text>
              <Text style={styles.distGps}>GPS {centerYards ?? '--'}</Text>
              <Text style={styles.distanceUnit}>yds</Text>
              {!tournamentMode && (
                <Text style={styles.distanceAdjust}>
                  {`W ${(playingDistance?.windAdj ?? 0) > 0 ? '+' : ''}${playingDistance?.windAdj ?? 0} · T ${(playingDistance?.tempAdj ?? 0) > 0 ? '+' : ''}${playingDistance?.tempAdj ?? 0} · E +${playingDistance?.elevAdj ?? 0}`}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={[
                styles.suggestedChip,
                suggestion?.state === 'data_backed' && styles.suggestedChipDataBacked,
                suggestion?.state === 'tied' && styles.suggestedChipTied,
              ]}
              onPress={() => {
                if (suggestion?.state === 'data_backed' || suggestion?.state === 'tied') {
                  setShowClubHistory(true);
                } else {
                  overlayRef.current?.openClubPicker?.();
                }
              }}
            >
              <Text style={styles.suggestedLabel}>SUGGESTED</Text>
              {suggestion?.state === 'tied' ? (
                <>
                  <Text style={styles.suggestedClub}>{suggestion.club} or {suggestion.tiedClub}</Text>
                  <Text style={styles.suggestedMeta}>Similar results. Your call.</Text>
                </>
              ) : (
                <>
                  <Text style={styles.suggestedClub}>{suggestion?.club || suggestedClub?.club || 'Pick club'}</Text>
                  {suggestion?.state === 'data_backed' ? (
                    <Text style={[styles.suggestedMeta, { color: '#4CAF7D' }]}>
                      avg {suggestion.avgDelta >= 0 ? '+' : ''}{suggestion.avgDelta?.toFixed(1)} · {suggestion.rounds} rounds
                    </Text>
                  ) : suggestion?.state === 'building' ? (
                    <Text style={styles.suggestedMeta}>
                      {suggestion.roundsLogged}/{suggestion.roundsNeeded} rounds
                    </Text>
                  ) : (
                    suggestedClub?.yards ? <Text style={styles.suggestedMeta}>{suggestedClub.yards}y</Text> : null
                  )}
                </>
              )}
              <Text style={styles.suggestedChevron}>›</Text>
            </TouchableOpacity>
          </>
        )}
        {!overlayState.anySheet && overlayState.shotFlow === 'idle' && currentHoleShots.length > 0 && !lieToast && !activeNudge && (
          <View style={styles.shotRow}>
            {currentHoleShots.map((shot) => (
              <View key={shot.id} style={[styles.shotPill, shot.color ? { borderColor: shot.color } : null]}>
                <View style={[styles.shotNumber, shot.color ? { backgroundColor: shot.color } : null]}>
                  <Text style={styles.shotNumberText}>{shot.num}</Text>
                </View>
                <Text style={styles.shotClubText}>{shot.abbr}</Text>
                {shot.lieIcon ? (
                  <Text style={[styles.shotLieIcon, shot.lieColor ? { color: shot.lieColor } : null]}>{shot.lieIcon}</Text>
                ) : null}
              </View>
            ))}
            <TouchableOpacity
              style={styles.clearShotsButton}
              onPress={() => setLoggedShotsByHole((prev) => ({ ...prev, [currentHoleIndex]: [] }))}
            >
              <Text style={styles.clearShotsButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        {lieToast ? (
          <View style={[styles.lieToast, lieToast.color ? { borderColor: lieToast.color } : null]}>
            <View style={[styles.lieToastDot, lieToast.color ? { backgroundColor: lieToast.color } : null]} />
            <Text style={styles.lieToastText}>{lieToast.lie}</Text>
            <Text style={styles.lieToastSubtext}>detected</Text>
          </View>
        ) : null}
        {overlayState.shotFlow === 'mark' && !overlayState.anySheet ? (
          <View style={styles.markBanner}>
            <View style={styles.markBannerPulse}>
              <View style={styles.markBannerDot} />
            </View>
            <View style={styles.markBannerCopy}>
              <Text style={styles.markBannerTitle}>Tap and hold to mark the shot</Text>
              <Text style={styles.markBannerSubtitle}>
                {overlayState.selectedClub ? `${overlayState.selectedClub} selected` : 'Club selected'} · then long-press your landing spot
              </Text>
            </View>
            <TouchableOpacity style={styles.markBannerClose} onPress={() => overlayRef.current?.resetOverlay?.()}>
              <Text style={styles.markBannerCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {activeNudge ? (
          <View style={[
            styles.nudgeCard,
            activeNudge.tone === 'green' ? styles.nudgeCardGreen : activeNudge.tone === 'red' ? styles.nudgeCardRed : styles.nudgeCardAmber,
          ]}>
            <View style={[
              styles.nudgeAccent,
              activeNudge.tone === 'green' ? styles.nudgeAccentGreen : activeNudge.tone === 'red' ? styles.nudgeAccentRed : styles.nudgeAccentAmber,
            ]} />
            <View style={styles.nudgeCopy}>
              <Text style={styles.nudgeTitle}>{activeNudge.title}</Text>
              <Text style={styles.nudgeBody}>{activeNudge.body}</Text>
              {activeNudge.support ? <Text style={styles.nudgeSupport}>{activeNudge.support}</Text> : null}
            </View>
          </View>
        ) : null}
        {/* Shot line mode toggle — Scoring (green) / Safe (amber) */}
        {!teeShottLogged && currentHole?.par !== 3 && shotLineCoords && (
          <View style={styles.modeToggleWrap} pointerEvents="box-none">
            <ModeToggle mode={shotLineMode} onToggle={setShotLineMode} />
          </View>
        )}

        <View style={styles.bottomMapBar}>
          <TouchableOpacity style={styles.teeJumpButton} onPress={() => jumpToPoi(teeBack)}>
            <Text style={styles.teeJumpText}>🏌️ Tee</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.greenJumpButton} onPress={() => jumpToPoi(greenCenter, 19.2)}>
            <Text style={styles.greenJumpText}>⛳ Green</Text>
          </TouchableOpacity>
          {liveLie?.lie === 'Green' && (
            <TouchableOpacity style={styles.greenMarkButton} onPress={() => setShowGreenSheet(true)}>
              <Text style={styles.greenMarkText}>Mark Green</Text>
            </TouchableOpacity>
          )}
          <View style={styles.bottomSpacer} />
          {!overlayState.anySheet && overlayState.shotFlow === 'idle' && (
            <TouchableOpacity style={styles.addShotButton} onPress={() => overlayRef.current?.openClubPicker?.()}>
              <Ionicons name="add" size={22} color="#FFFFFF" />
              <Text style={styles.addShotButtonText}>Add Shot</Text>
            </TouchableOpacity>
          )}
        </View>
        <View pointerEvents="none" style={styles.mapboxWordmark}>
          <Text style={styles.mapboxWordmarkText}>mapbox</Text>
        </View>
      </View>

      <YardagePanel yardages={yardages} />
      <View style={styles.helperBar}>
        <Text style={styles.helperText}>
          {coachingEnabled
            ? 'Coaching is on • Tap bulb to hide • Double tap to reset • Hold to measure'
            : 'Coaching is off • Tap bulb to show • Double tap to reset • Hold to measure'}
        </Text>
      </View>

      <ClubHistorySheet
        visible={showClubHistory}
        onClose={() => setShowClubHistory(false)}
        holeNumber={holeNumber}
        holePar={currentHole?.par || 4}
        tees={teeColor}
        courseName={course?.courseName || course?.name || ''}
        allClubs={suggestion?.allClubs || []}
        holeDoc={holeDoc}
      />

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
                <Text style={styles.historySubtitle}>Track the first putt, hole location, and putts on this green.</Text>
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
    </SafeAreaView>
  );
}

const stylesMap = {
  line: {
    lineColor: '#F3F4F6',
    lineWidth: 1.5,
    lineDasharray: [1.2, 1.2],
  },
  tee: {
    circleRadius: 6,
    circleColor: '#FFFFFF',
    circleStrokeWidth: 2,
    circleStrokeColor: '#111827',
  },
  green: {
    circleRadius: 10,
    circleColor: '#10B981',
    circleStrokeWidth: 2,
    circleStrokeColor: '#064E3B',
  },
  user: {
    circleRadius: 7,
    circleColor: '#3B82F6',
    circleStrokeWidth: 2,
    circleStrokeColor: '#DBEAFE',
  },
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: colors.bg.primary,
  },
  topBarCenter: { flex: 1, paddingHorizontal: 10 },
  courseName: { color: colors.text.primary, fontSize: 13, fontWeight: '600', letterSpacing: -0.2 },
  subMeta: { color: colors.text.secondary, fontSize: 10, marginTop: 1 },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg.elevated,
  },
  iconBtnActive: {
    borderWidth: 1,
    borderColor: colors.brand.primaryBorder,
  },
  gpsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    borderRadius: 15,
    paddingHorizontal: 10,
    backgroundColor: colors.brand.primary,
    marginLeft: 2,
  },
  gpsPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  scorePill: {
    minWidth: 42,
    height: 30,
    borderRadius: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  mapWrap: { position: 'relative' },
  map: { flex: 1 },
  weatherStrip: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 4,
    zIndex: 10,
  },
  weatherText: {
    color: colors.text.primary,
    fontSize: 11,
    fontWeight: '500',
  },
  weatherDivider: {
    width: 1,
    height: 10,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginHorizontal: 6,
  },
  distanceBadge: {
    position: 'absolute',
    right: 10,
    top: 10,
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.md + 1,
    borderWidth: 1,
    borderColor: colors.brand.primaryBorder,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 58,
    alignItems: 'center',
    zIndex: 10,
  },
  distanceBadgeLabel: {
    color: colors.text.tertiary,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  distGps: {
    color: 'rgba(255,255,255,0.30)',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  distanceValue: {
    color: colors.text.primary,
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 28,
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
  suggestedChip: {
    position: 'absolute',
    left: 10,
    bottom: 92,
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 9,
    paddingRight: 22,
    zIndex: 10,
  },
  suggestedChipDataBacked: {
    borderColor: '#4CAF7D',
  },
  suggestedChipTied: {
    borderColor: '#F5A623',
  },
  suggestedLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 1,
  },
  suggestedClub: {
    color: colors.text.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  suggestedMeta: {
    color: 'rgba(255,255,255,0.28)',
    fontSize: 10,
    marginTop: 1,
  },
  suggestedChevron: {
    position: 'absolute',
    right: 7,
    top: 14,
    color: 'rgba(255,255,255,0.3)',
    fontSize: 14,
  },
  shotRow: {
    position: 'absolute',
    bottom: 54,
    left: 10,
    right: 84,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    zIndex: 10,
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
    bottom: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    zIndex: 25,
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
  markBanner: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.brand.primaryBorder,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    zIndex: 20,
  },
  markBannerPulse: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.primaryMuted,
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
    fontWeight: '600',
  },
  markBannerSubtitle: {
    color: colors.brand.primary,
    fontSize: 10,
    marginTop: 1,
  },
  markBannerClose: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markBannerCloseText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
  },
  nudgeCard: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 62,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    paddingVertical: 10,
    paddingRight: 12,
    zIndex: 10,
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
  bottomMapBar: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    zIndex: 10,
  },
  teeJumpButton: {
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  teeJumpText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '500',
  },
  greenJumpButton: {
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  greenJumpText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  greenMarkButton: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  greenMarkText: {
    color: '#E5E7EB',
    fontSize: 11,
    fontWeight: '600',
  },
  bottomSpacer: {
    flex: 1,
  },
  addShotButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand.primary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    shadowColor: colors.brand.primary,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  addShotButtonText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.3,
  },
  mapboxWordmark: {
    position: 'absolute',
    left: 8,
    bottom: 44,
    paddingHorizontal: 2,
    paddingVertical: 1,
  },
  // Shot line mode toggle
  modeToggleWrap: {
    position: 'absolute',
    top: 52,
    right: 10,
    zIndex: 20,
  },
  // Par 3 distance badge (at shot line midpoint)
  par3Badge: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.76)',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  par3BadgeText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  par3BadgeLabel: {
    color: '#9CA3AF',
    fontSize: 10,
    fontWeight: '600',
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
    width: 28,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    opacity: 0.45,
  },
  ydDiamond: {
    width: 12,
    height: 12,
    borderWidth: 1.2,
    transform: [{ rotate: '45deg' }],
  },
  ydNum: {
    position: 'absolute',
    fontSize: 6,
    fontWeight: '800',
  },
  carryWrap: {
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
