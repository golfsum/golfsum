import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getCourse, saveCourse } from '../services/courseCache';
import { fetchCourseHolesFromBackend } from '../services/golfApi';
import { haversineYards } from '../services/haversine';
import { HoleHeader } from '../components/gps/HoleHeader';
import { HoleDots } from '../components/gps/HoleDots';
import { YardagePanel } from '../components/gps/YardagePanel';
import { getMockGpsCourse } from '../services/gpsMockCourses';
import { MAPBOX_PUBLIC_TOKEN } from '../config/mapbox';
import { getStaticMapCameraConfig } from '../services/mapFraming';
import { buildInRoundNudge } from '../services/inRoundNudgeService';
import { getRecentHoleNote } from '../services/holeNotesService';
import { colors } from '../theme/tokens';

const CLUB_PATTERN = /\b(driver|3w|3 wood|5w|5 wood|2i|3i|4i|5i|6i|7i|8i|9i|pw|gw|aw|sw|lw|60|58|56|54|52|50|48|lob wedge|gap wedge|pitching wedge|sand wedge)\b/i;

function extractClubFromNote(noteText) {
  if (!noteText) return null;
  const match = noteText.match(CLUB_PATTERN);
  return match ? match[0] : null;
}

function buildGreenStaticMapUrl(greenPoi, imageWidth, imageHeight) {
  if (!MAPBOX_PUBLIC_TOKEN || !greenPoi) return null;
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${greenPoi.Longitude},${greenPoi.Latitude},19.5,0/${imageWidth}x${imageHeight}?access_token=${MAPBOX_PUBLIC_TOKEN}&attribution=false`;
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
  tee: { x: 0.52, y: 0.84 },
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

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function distanceBetweenPoints(a, b) {
  return Math.hypot((a?.x ?? 0) - (b?.x ?? 0), (a?.y ?? 0) - (b?.y ?? 0));
}

function getBestClub(targetYards) {
  if (!Number.isFinite(targetYards)) return CLUB_OPTIONS[3];
  return CLUB_OPTIONS.reduce((best, club) => (
    Math.abs(club.yards - targetYards) < Math.abs(best.yards - targetYards) ? club : best
  ), CLUB_OPTIONS[0]);
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

function getYardageMarkers(hole) {
  if (!hole || hole.par === 3) return [];
  return hole.par === 5
    ? [
        { yds: 100, color: '#F87171', top: '68%', left: '53%' },
        { yds: 150, color: '#FFFFFF', top: '56%', left: '51%' },
        { yds: 200, color: '#60A5FA', top: '44%', left: '49%' },
        { yds: 250, color: '#F6C90E', top: '32%', left: '47%' },
      ]
    : [
        { yds: 100, color: '#F87171', top: '66%', left: '53%' },
        { yds: 150, color: '#FFFFFF', top: '53%', left: '50%' },
        { yds: 200, color: '#60A5FA', top: '39%', left: '47%' },
      ];
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

function buildStaticMapUrl(hole, imageWidth, imageHeight) {
  if (!MAPBOX_PUBLIC_TOKEN || !hole) return null;
  const frame = getStaticMapCameraConfig(hole, imageWidth, imageHeight);
  if (!frame) return null;
  return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/${frame.centerLng},${frame.centerLat},${frame.zoom},${frame.heading}/${frame.pixelWidth}x${frame.pixelHeight}?access_token=${MAPBOX_PUBLIC_TOKEN}&attribution=false`;
}

export function WebGpsRoundPreview({
  courseId,
  courseName,
  teeColor = 'Blue',
  startingHole = 1,
  tournamentMode = false,
  onBack,
  onSwitchToManual,
}) {
  const { width, height } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cached, setCached] = useState(false);
  const [course, setCourse] = useState(null);
  const [currentHoleIndex, setCurrentHoleIndex] = useState(Math.max(0, (startingHole || 1) - 1));
  const [mapLoadError, setMapLoadError] = useState('');
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
  const [holeNoteClub, setHoleNoteClub] = useState(null);
  const [holeNoteText, setHoleNoteText] = useState(null);
  const [showCourseNotes, setShowCourseNotes] = useState(false);
  const [gpsActive, setGpsActive] = useState(true);

  const currentHole = course?.holes?.[currentHoleIndex] || null;
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
      if (local) {
        setCourse(local);
        setCached(true);
      } else {
        try {
          const remote = await fetchCourseHolesFromBackend(courseId);
          await saveCourse(courseId, remote);
          setCourse(remote);
          setCached(false);
        } catch (remoteErr) {
          const mockCourse = getMockGpsCourse(courseId);
          if (!mockCourse) throw remoteErr;
          await saveCourse(courseId, mockCourse);
          setCourse(mockCourse);
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

  useEffect(() => {
    setCurrentHoleIndex(Math.max(0, (startingHole || 1) - 1));
  }, [startingHole, courseId]);

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
      .map((key) => Number(key) + 1),
    [holePutts, loggedShotsByHole]
  );

  const selectedTee = useMemo(
    () => currentHole?.tees?.find((tee) => normalizeTeeName(tee.name) === normalizeTeeName(teeColor)) || currentHole?.tees?.[0] || null,
    [currentHole, teeColor]
  );
  const yardageMarkers = useMemo(() => getYardageMarkers(currentHole), [currentHole]);
  const hazardCarryLabels = useMemo(() => getHazardCarryLabels(currentHole, yardages), [currentHole, yardages]);
  const suggestedClub = useMemo(() => {
    if (holeNoteClub) {
      const noteClubLower = holeNoteClub.toLowerCase();
      const match = CLUB_OPTIONS.find((c) => c.name.toLowerCase() === noteClubLower || c.abbr.toLowerCase() === noteClubLower);
      if (match) return { ...match, fromNote: true };
      return { id: 'note', abbr: holeNoteClub.slice(0, 3).toUpperCase(), name: holeNoteClub, yards: null, color: '#10B981', fromNote: true };
    }
    return getBestClub(yardages.center);
  }, [holeNoteClub, yardages.center]);

  const activeNudge = useMemo(() => coachingEnabled ? buildInRoundNudge({
    holeNumber: currentHole?.hole || currentHoleIndex + 1,
    holePar: currentHole?.par || 4,
    liveLie: liveLie?.lie || null,
    selectedClub: selectedClub?.name || null,
    suggestedClub: suggestedClub?.name || null,
    centerYards: Number.isFinite(yardages.center) ? yardages.center : null,
    playingYards: tournamentMode ? (Number.isFinite(yardages.center) ? yardages.center : null) : (Number.isFinite(yardages.center) ? yardages.center + 2 : null),
    tournamentMode,
    weather: tournamentMode ? null : { windMph: 14 },
    hazardCarries: hazardCarryLabels.map((label) => ({ label: label.color === '#60A5FA' ? 'Water' : 'FW Bkr', actual: Number(label.text.slice(0, -1)) })),
    currentRoundShots,
    greenSummary: currentHoleSummary,
    context: PREVIEW_NUDGE_CONTEXT,
  }) : null, [coachingEnabled, currentHole?.hole, currentHole?.par, currentHoleIndex, currentHoleSummary, currentRoundShots, hazardCarryLabels, liveLie?.lie, selectedClub?.name, suggestedClub?.name, tournamentMode, yardages.center]);

  const isCompact = width < 700;
  const horizontalPadding = isCompact ? 16 : 28;
  const mapAspectRatio = 0.58; // width / height
  const maxMapWidth = isCompact ? 460 : 720;
  const mapWidth = Math.min(width - horizontalPadding * 2, maxMapWidth);
  const mapHeight = Math.round(mapWidth / mapAspectRatio);
  const holeImageUrl = useMemo(
    () => buildStaticMapUrl(currentHole, mapWidth, mapHeight),
    [currentHole, mapWidth, mapHeight]
  );
  const greenStaticUrl = useMemo(
    () => buildGreenStaticMapUrl(greenCenter, mapWidth, mapHeight),
    [greenCenter, mapWidth, mapHeight]
  );

  useEffect(() => {
    setMapLoadError('');
  }, [holeImageUrl, greenStaticUrl, showGreenView, currentHoleIndex, mapWidth, mapHeight]);

  useEffect(() => {
    setShotFlow('idle');
    setSelectedClub(null);
    setShowGreenSheet(false);
    setShowGreenView(false);
  }, [currentHoleIndex]);

  useEffect(() => {
    let active = true;
    if (!courseId || !currentHole?.hole) { setHoleNoteClub(null); return undefined; }
    getRecentHoleNote(courseId, currentHole.hole)
      .then((note) => {
        if (active) {
          setHoleNoteClub(note ? extractClubFromNote(note.text) : null);
          setHoleNoteText(note?.text || null);
        }
      })
      .catch(() => { if (active) { setHoleNoteClub(null); setHoleNoteText(null); } });
    return () => { active = false; };
  }, [courseId, currentHole?.hole]);

  const handleSelectHole = useCallback((nextIndex) => {
    setCurrentHoleIndex(nextIndex);
  }, []);

  const handleStartShot = useCallback(() => {
    setClubPickerOpen(true);
  }, []);

  const handlePickClub = useCallback((club) => {
    setSelectedClub(club);
    setClubPickerOpen(false);
    setShotFlow('mark');
  }, []);

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
  }, [baseYardages.center, currentHole, currentHoleIndex, mapLayout.height, mapLayout.width, playerPoint, selectedClub, shotFlow, tournamentMode]);

  const handleResetHole = useCallback(() => {
    setLoggedShotsByHole((prev) => ({ ...prev, [currentHoleIndex]: [] }));
    setHolePutts((prev) => ({ ...prev, [currentHoleIndex]: 0 }));
    setPlayerPositionsByHole((prev) => ({ ...prev, [currentHoleIndex]: PREVIEW_POINTS.tee }));
    setShotFlow('idle');
    setSelectedClub(null);
  }, [currentHoleIndex]);

  const handleAdvanceHole = useCallback((direction = 1) => {
    setShotFlow('idle');
    setSelectedClub(null);
    setCurrentHoleIndex((prev) => clamp(prev + direction, 0, (course?.holes?.length || 1) - 1));
  }, [course?.holes?.length]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#10B981" />
          <Text style={styles.loadingText}>Loading GPS preview…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !course?.holes?.length) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
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
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onBack} style={styles.iconBtn}>
            <Ionicons name="arrow-back" size={20} color="#E5E7EB" />
          </TouchableOpacity>
          <View style={styles.topBarCenter}>
            <Text style={styles.courseName} numberOfLines={1}>{courseName || course.courseName || 'GPS Preview'}</Text>
            <Text style={styles.subMeta}>
              {cached ? 'Cached on device' : course?.source === 'LOCAL_SAMPLE' ? 'Local sample data' : 'Loaded now'} • {selectedTee?.name || teeColor} • Hole {currentHoleIndex + 1}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.gpsPill, !gpsActive && styles.gpsPillOff]}
            onPress={() => setGpsActive((v) => !v)}
          >
            <Ionicons name="navigate" size={11} color="#FFFFFF" />
            <Text style={styles.gpsPillText}>{gpsActive ? 'GPS' : 'Manual'}</Text>
          </TouchableOpacity>
        </View>

        <HoleHeader hole={currentHole} hazardTags={hazardTags} liveLie={liveLie} />
        <HoleDots holes={course.holes} currentHole={currentHoleIndex} onSelect={handleSelectHole} loggedHoles={loggedHoles} />

        <View
          style={[styles.mapWrap, { width: mapWidth, minHeight: mapHeight }]}
          onLayout={(event) => setMapLayout({
            width: event.nativeEvent.layout.width,
            height: event.nativeEvent.layout.height,
          })}
        >
          {(showGreenView ? greenStaticUrl : holeImageUrl) && !mapLoadError ? (
            <Image
              source={{ uri: showGreenView ? greenStaticUrl : holeImageUrl }}
              style={[styles.mapImage, { height: mapHeight }]}
              resizeMode="cover"
              onError={() => setMapLoadError('Mapbox image failed to load. Check token validity and any token URL restrictions.')}
            />
          ) : (
            <View style={[styles.mapFallback, { minHeight: mapHeight }]}>
              <Ionicons name="image-outline" size={28} color="#6B7280" />
              <Text style={styles.mapFallbackTitle}>Map Preview Unavailable</Text>
              <Text style={styles.mapFallbackBody}>
                {mapLoadError || 'Add EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN to load satellite hole imagery in the browser preview.'}
              </Text>
              {!!holeImageUrl && (
                <Text style={styles.mapFallbackUrl} numberOfLines={2}>
                  {holeImageUrl}
                </Text>
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
          {yardageMarkers.map((marker) => (
            <View
              key={`marker-${marker.yds}`}
              pointerEvents="none"
              style={[styles.ydMarkerWrap, { top: marker.top, left: marker.left }]}
            >
              <View style={[styles.ydLine, { borderColor: marker.color }]} />
              <View style={[styles.ydDiamond, { borderColor: marker.color, backgroundColor: `${marker.color}2E` }]}>
                <Text style={[styles.ydNum, { color: marker.color }]}>{marker.yds}</Text>
              </View>
            </View>
          ))}
          {hazardCarryLabels.map((label) => (
            <View
              key={`${label.text}-${label.top}-${label.left}`}
              pointerEvents="none"
              style={[styles.carryWrap, { top: label.top, left: label.left }]}
            >
              <View style={styles.carryPill}>
                <Text style={[styles.carryTxt, { color: label.color }]}>
                  {label.text.slice(0, -1)}
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
          {shotFlow === 'mark' && (
            <Pressable style={styles.mapTapCatcher} onPress={handleMapShotPlacement}>
              <View style={styles.mapTapScrim}>
                <Text style={styles.mapTapPrompt}>Tap where {selectedClub?.name || suggestedClub.name} finishes</Text>
                <Text style={styles.mapTapSubprompt}>This will log the shot and move you there.</Text>
              </View>
            </Pressable>
          )}
          <View style={styles.weatherStrip}>
            {!tournamentMode ? (
              <>
                <Ionicons
                  name="navigate"
                  size={12}
                  color="rgba(255,255,255,0.7)"
                  style={{ transform: [{ rotate: getWindArrowRotation(35) }] }}
                />
                <Text style={styles.weatherText}>14 mph</Text>
                <View style={styles.weatherDivider} />
                <Text style={styles.weatherText}>62F</Text>
                <View style={styles.weatherDivider} />
                <Ionicons name="water-outline" size={12} color="rgba(255,255,255,0.7)" />
                <Text style={styles.weatherText}>71%</Text>
              </>
            ) : (
              <Text style={styles.weatherText}>Tournament mode</Text>
            )}
          </View>
          <View style={styles.distanceBadge}>
            <Text style={styles.distanceBadgeLabel}>{tournamentMode ? 'GPS' : 'PLAYING'}</Text>
            <Text style={styles.distanceValue}>{tournamentMode ? yardages.center : Math.max(0, yardages.center + 2)}</Text>
            <Text style={styles.distGps}>GPS {yardages.center}</Text>
            <Text style={styles.distanceUnit}>yds</Text>
            {!tournamentMode && <Text style={styles.distanceAdjust}>W +4 · T -2</Text>}
          </View>
          <TouchableOpacity style={[styles.suggestedChip, suggestedClub?.fromNote && styles.suggestedChipNote]} onPress={handleStartShot}>
            <Text style={styles.suggestedLabel}>{suggestedClub?.fromNote ? '📝 FROM NOTE' : 'SUGGESTED'}</Text>
            <Text style={styles.suggestedClub}>{suggestedClub.name}</Text>
            {suggestedClub.yards ? <Text style={styles.suggestedMeta}>{suggestedClub.yards}y</Text> : null}
            <Text style={styles.suggestedChevron}>›</Text>
          </TouchableOpacity>
          {!clubPickerOpen && shotFlow === 'idle' && currentHoleShots.length > 0 && !activeNudge && (
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
          {activeNudge && shotFlow === 'idle' && !clubPickerOpen && !showGreenSheet && (
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
          )}
          <View style={styles.bottomMapBar}>
            {/* Suggested club — tapping toggles course note */}
            <TouchableOpacity
              style={[styles.suggestedBarChip, suggestedClub?.fromNote && styles.suggestedBarChipNote]}
              onPress={() => setShowCourseNotes((v) => !v)}
            >
              <Text style={styles.suggestedBarLabel}>{suggestedClub?.fromNote ? '📝' : '⭐'}</Text>
              <Text style={styles.suggestedBarClub}>{suggestedClub.abbr}</Text>
              {suggestedClub.yards ? <Text style={styles.suggestedBarMeta}>{suggestedClub.yards}y</Text> : null}
            </TouchableOpacity>

            {/* Putts stepper */}
            <View style={styles.bottomPuttStepper}>
              <TouchableOpacity
                style={styles.bottomPuttBtn}
                onPress={() => setHolePutts((prev) => ({ ...prev, [currentHoleIndex]: Math.max(0, currentPutts - 1) }))}
              >
                <Text style={styles.bottomPuttBtnText}>−</Text>
              </TouchableOpacity>
              <View style={styles.bottomPuttValueWrap}>
                <Text style={styles.bottomPuttValue}>{currentPutts}</Text>
                <Text style={styles.bottomPuttLabel}>PUTTS</Text>
              </View>
              <TouchableOpacity
                style={styles.bottomPuttBtn}
                onPress={() => setHolePutts((prev) => ({ ...prev, [currentHoleIndex]: currentPutts + 1 }))}
              >
                <Text style={styles.bottomPuttBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            {/* Right column: Green toggle (top) + Add Shot (bottom) */}
            <View style={styles.bottomRightStack}>
              <TouchableOpacity
                style={[styles.greenViewBtn, showGreenView && styles.greenViewBtnActive]}
                onPress={() => setShowGreenView((v) => !v)}
              >
                <Ionicons name="map" size={12} color={showGreenView ? colors.brand.primary : 'rgba(255,255,255,0.55)'} />
                <Text style={[styles.greenViewBtnText, showGreenView && { color: colors.brand.primary }]}>Green</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addShotButton} onPress={handleStartShot}>
                <Ionicons name="add" size={18} color="#FFFFFF" />
                <Text style={[styles.addShotButtonText, { color: '#FFFFFF' }]}>Add Shot</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {showCourseNotes && (
          <View style={styles.courseNotePanel}>
            <Text style={styles.courseNoteTitle}>📝 Hole Note</Text>
            <Text style={styles.courseNoteBody}>{holeNoteText || `Suggested: ${suggestedClub.name}`}</Text>
          </View>
        )}

        <YardagePanel yardages={yardages} />

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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  scrollContent: { paddingBottom: 28 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, backgroundColor: colors.bg.primary },
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
    marginHorizontal: 16,
    marginTop: 0,
    marginBottom: 0,
    alignSelf: 'center',
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#111827',
    position: 'relative',
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  ydNum: {
    fontSize: 6,
    fontWeight: '800',
    transform: [{ rotate: '-45deg' }],
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
    top: 10,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  weatherText: { color: colors.text.primary, fontSize: 11, fontWeight: '500' },
  weatherDivider: { width: 1, height: 10, backgroundColor: 'rgba(255,255,255,0.12)', marginHorizontal: 6 },
  distanceBadge: {
    position: 'absolute',
    right: 10,
    top: 10,
    backgroundColor: colors.bg.secondary,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.brand.primaryBorder,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 58,
    alignItems: 'center',
  },
  distanceBadgeLabel: { color: colors.text.tertiary, fontSize: 8, fontWeight: '700', letterSpacing: 1.2, marginBottom: 2 },
  distanceValue: { color: colors.text.primary, fontSize: 28, fontWeight: '700', lineHeight: 28, letterSpacing: -0.5 },
  distGps: { color: 'rgba(255,255,255,0.38)', fontSize: 11, fontWeight: '600', marginTop: 2 },
  distanceUnit: { color: colors.text.secondary, fontSize: 9, letterSpacing: 1, marginBottom: 3 },
  distanceAdjust: { color: colors.brand.primary, fontSize: 8, fontWeight: '600', lineHeight: 11, textAlign: 'center' },
  suggestedChip: {
    position: 'absolute',
    left: 10,
    bottom: 92,
    backgroundColor: colors.bg.secondary,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    paddingTop: 6,
    paddingBottom: 6,
    paddingLeft: 9,
    paddingRight: 22,
  },
  suggestedChipNote: { borderColor: colors.brand.primaryBorder },
  suggestedLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 8, fontWeight: '700', letterSpacing: 1.2, marginBottom: 1 },
  suggestedClub: { color: colors.text.primary, fontSize: 12, fontWeight: '600' },
  suggestedMeta: { color: 'rgba(255,255,255,0.28)', fontSize: 10, marginTop: 1 },
  suggestedChevron: { position: 'absolute', right: 7, top: 14, color: 'rgba(255,255,255,0.3)', fontSize: 14 },
  playerRing: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    marginLeft: -12,
    marginTop: -12,
    backgroundColor: 'rgba(66,153,225,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  playerDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: -5,
    marginTop: -5,
    backgroundColor: '#4299E1',
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
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  mapTapPrompt: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  mapTapSubprompt: {
    color: 'rgba(255,255,255,0.74)',
    fontSize: 12,
    marginTop: 6,
    textAlign: 'center',
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
    bottom: 70,
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
  nudgeCard: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 64,
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.bg.secondary,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    paddingVertical: 10,
    paddingRight: 12,
    zIndex: 9,
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
  bottomMapBar: { position: 'absolute', left: 10, right: 10, bottom: 10, flexDirection: 'row', alignItems: 'stretch', gap: 6 },
  // Suggested club chip in bottom bar
  suggestedBarChip: { flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.subtle, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, minWidth: 52 },
  suggestedBarChipNote: { borderColor: colors.brand.primaryBorder, backgroundColor: colors.brand.primaryMuted },
  suggestedBarLabel: { fontSize: 10 },
  suggestedBarClub: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  suggestedBarMeta: { color: colors.text.secondary, fontSize: 9, fontWeight: '600' },
  // Putts stepper in bottom bar
  bottomPuttStepper: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.subtle, borderRadius: 10, paddingVertical: 6, gap: 8 },
  bottomPuttBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.bg.elevated, borderWidth: 1, borderColor: colors.border.subtle, alignItems: 'center', justifyContent: 'center' },
  bottomPuttBtnText: { color: '#E5E7EB', fontSize: 16, fontWeight: '700', lineHeight: 20 },
  bottomPuttValueWrap: { alignItems: 'center', minWidth: 28 },
  bottomPuttValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', lineHeight: 22 },
  bottomPuttLabel: { color: colors.text.secondary, fontSize: 8, fontWeight: '700', letterSpacing: 0.8 },
  // Right stack: Green button + Add Shot
  bottomRightStack: { flexDirection: 'column', gap: 4, alignItems: 'stretch' },
  greenViewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.subtle, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  greenViewBtnActive: { borderColor: colors.brand.primaryBorder },
  greenViewBtnText: { color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: '600' },
  addShotButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.subtle, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
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
