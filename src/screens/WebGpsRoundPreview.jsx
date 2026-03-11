import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import { colors } from '../theme/tokens';

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
}) {
  const { width, height } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cached, setCached] = useState(false);
  const [course, setCourse] = useState(null);
  const [currentHoleIndex, setCurrentHoleIndex] = useState(Math.max(0, (startingHole || 1) - 1));
  const [mapLoadError, setMapLoadError] = useState('');
  const [loggedHoles] = useState([1, 3]);

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

  const yardages = useMemo(() => {
    if (!teeBack || !greenFront || !greenCenter || !greenBack) {
      return { front: '--', center: '--', back: '--' };
    }
    return {
      front: haversineYards(teeBack.Latitude, teeBack.Longitude, greenFront.Latitude, greenFront.Longitude) ?? '--',
      center: haversineYards(teeBack.Latitude, teeBack.Longitude, greenCenter.Latitude, greenCenter.Longitude) ?? '--',
      back: haversineYards(teeBack.Latitude, teeBack.Longitude, greenBack.Latitude, greenBack.Longitude) ?? '--',
    };
  }, [teeBack, greenFront, greenCenter, greenBack]);

  const selectedTee = useMemo(
    () => currentHole?.tees?.find((tee) => normalizeTeeName(tee.name) === normalizeTeeName(teeColor)) || currentHole?.tees?.[0] || null,
    [currentHole, teeColor]
  );
  const yardageMarkers = useMemo(() => getYardageMarkers(currentHole), [currentHole]);
  const hazardCarryLabels = useMemo(() => getHazardCarryLabels(currentHole, yardages), [currentHole, yardages]);

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

  useEffect(() => {
    setMapLoadError('');
  }, [holeImageUrl, currentHoleIndex, mapWidth, mapHeight]);

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
          <View style={styles.scorePill}>
            <Text style={styles.scorePillText}>GPS</Text>
          </View>
        </View>

        <HoleHeader hole={currentHole} hazardTags={hazardTags} liveLie={{ lie: 'Tee Box', color: '#60A5FA', showDot: true }} />
        <HoleDots holes={course.holes} currentHole={currentHoleIndex} onSelect={setCurrentHoleIndex} loggedHoles={loggedHoles} />

        <View style={[styles.mapWrap, { width: mapWidth, minHeight: mapHeight }]}>
          {holeImageUrl && !mapLoadError ? (
            <Image
              source={{ uri: holeImageUrl }}
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
            <Text style={styles.distanceValue}>{yardages.center}</Text>
            <Text style={styles.distanceUnit}>yds</Text>
            {!tournamentMode && <Text style={styles.distanceAdjust}>W +4 · T -2</Text>}
          </View>
          <View style={styles.suggestedChip}>
            <Text style={styles.suggestedLabel}>SUGGESTED</Text>
            <Text style={styles.suggestedClub}>7 Iron</Text>
            <Text style={styles.suggestedMeta}>142y</Text>
            <Text style={styles.suggestedChevron}>›</Text>
          </View>
          <View style={styles.bottomMapBar}>
            <TouchableOpacity style={styles.teeJumpButton}>
              <Text style={styles.teeJumpText}>🏌️ Tee</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.greenJumpButton}>
              <Text style={styles.greenJumpText}>⛳ Green</Text>
            </TouchableOpacity>
            <View style={styles.bottomSpacer} />
            <TouchableOpacity style={styles.logShotButton}>
              <Text style={styles.logShotButtonText}>+ Log Shot</Text>
            </TouchableOpacity>
          </View>
        </View>

        <YardagePanel yardages={yardages} />
        <View style={styles.helperBar}>
          <Text style={styles.helperText}>Tap dots to switch holes • Preview mirrors native GPS chrome</Text>
        </View>

        <View style={styles.previewCard}>
          <Text style={styles.previewTitle}>Web GPS Preview</Text>
          <Text style={styles.previewBody}>
            Browser preview uses Pebble sample coordinates and static values, but the screen chrome now mirrors the native GPS round layout.
          </Text>
          <View style={styles.metricRow}>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Selected Tee</Text>
              <Text style={styles.metricValue}>{selectedTee?.name || teeColor}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Scorecard Yards</Text>
              <Text style={styles.metricValue}>{selectedTee?.yards ? `${selectedTee.yards}c` : '--'}</Text>
            </View>
          </View>
          <View style={styles.metricRow}>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Tournament</Text>
              <Text style={styles.metricValue}>{tournamentMode ? 'On' : 'Off'}</Text>
            </View>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Tee</Text>
              <Text style={styles.coordText}>
                {teeBack ? `${teeBack.Latitude.toFixed(6)}, ${teeBack.Longitude.toFixed(6)}` : '--'}
              </Text>
            </View>
          </View>
          <View style={styles.metricRow}>
            <View style={styles.metric}>
              <Text style={styles.metricLabel}>Green Center</Text>
              <Text style={styles.coordText}>
                {greenCenter ? `${greenCenter.Latitude.toFixed(6)}, ${greenCenter.Longitude.toFixed(6)}` : '--'}
              </Text>
            </View>
          </View>
        </View>
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
  courseName: { color: colors.text.primary, fontSize: 13, fontWeight: '600', letterSpacing: -0.2 },
  subMeta: { color: colors.text.secondary, fontSize: 10, marginTop: 1 },
  scorePill: { minWidth: 42, height: 30, borderRadius: 8, paddingHorizontal: 10, backgroundColor: colors.bg.elevated, borderWidth: 1, borderColor: colors.border.subtle, alignItems: 'center', justifyContent: 'center' },
  scorePillText: { color: colors.text.secondary, fontSize: 13, fontWeight: '700' },
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
  suggestedLabel: { color: 'rgba(255,255,255,0.3)', fontSize: 8, fontWeight: '700', letterSpacing: 1.2, marginBottom: 1 },
  suggestedClub: { color: colors.text.primary, fontSize: 12, fontWeight: '600' },
  suggestedMeta: { color: 'rgba(255,255,255,0.28)', fontSize: 10, marginTop: 1 },
  suggestedChevron: { position: 'absolute', right: 7, top: 14, color: 'rgba(255,255,255,0.3)', fontSize: 14 },
  bottomMapBar: { position: 'absolute', left: 10, right: 10, bottom: 28, flexDirection: 'row', alignItems: 'center', gap: 6 },
  teeJumpButton: { backgroundColor: colors.bg.secondary, borderWidth: 1, borderColor: colors.border.subtle, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  teeJumpText: { color: colors.text.secondary, fontSize: 11, fontWeight: '500' },
  greenJumpButton: { backgroundColor: colors.brand.primaryMuted, borderWidth: 1, borderColor: colors.brand.primaryBorder, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  greenJumpText: { color: colors.brand.primary, fontSize: 11, fontWeight: '500' },
  bottomSpacer: { flex: 1 },
  logShotButton: { backgroundColor: colors.brand.primary, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
  logShotButtonText: { color: colors.text.inverse, fontSize: 11, fontWeight: '700' },
  helperBar: { backgroundColor: colors.bg.primary, paddingTop: 4, paddingBottom: 10, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border.subtle },
  helperText: { color: 'rgba(255,255,255,0.20)', fontSize: 10, letterSpacing: 0.2, textAlign: 'center' },
  previewCard: {
    marginHorizontal: 14,
    marginTop: 4,
    marginBottom: 10,
    backgroundColor: '#111827',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 16,
    gap: 12,
  },
  previewTitle: { color: '#E5E7EB', fontSize: 18, fontWeight: '700' },
  previewBody: { color: '#9CA3AF', fontSize: 13, lineHeight: 20 },
  metricRow: { flexDirection: 'row', gap: 12 },
  metric: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1F2937',
    padding: 12,
  },
  metricLabel: { color: '#6B7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 },
  metricValue: { color: '#E5E7EB', fontSize: 18, fontWeight: '700' },
  coordText: { color: '#CBD5E1', fontSize: 12, lineHeight: 18 },
});

export default WebGpsRoundPreview;
