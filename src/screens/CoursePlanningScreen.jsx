import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getCourse, isCourseCached, downloadCourse } from '../services/courseCache';
import { fetchCourseHolesFromBackend } from '../services/golfApi';
import { haversineYards } from '../services/haversine';
import { MAPBOX_PUBLIC_TOKEN } from '../config/mapbox';
import { HoleHeader } from '../components/gps/HoleHeader';
import { HoleDots } from '../components/gps/HoleDots';
import { savePlan, loadPlan } from '../services/CoursePlanningService';
import { colors, radius, spacing, typography } from '../theme/tokens';

let MapboxGL;
try { MapboxGL = require('@rnmapbox/maps').default; } catch { MapboxGL = null; }

async function fetchPlanWeather(lat, lng) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,wind_direction_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return {
    tempF: Number(data?.current?.temperature_2m ?? NaN),
    windMph: Number(data?.current?.wind_speed_10m ?? NaN),
    windDegrees: Number(data?.current?.wind_direction_10m ?? NaN),
  };
}

function getPlayingAdjustment(baseYards, weather, shotBearingDeg) {
  const tempAdj = Number.isFinite(weather?.tempF) ? Math.round((70 - weather.tempF) * 0.35) : 0;
  let windAdj = 0;
  if (Number.isFinite(weather?.windMph) && Number.isFinite(weather?.windDegrees) && Number.isFinite(shotBearingDeg)) {
    const windToShot = Math.abs(((weather.windDegrees - shotBearingDeg + 180) % 360) - 180);
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

function findPoi(hole, type, subType) {
  return hole?.pois?.find(p => p.POI === type && p.SubType === subType) || null;
}

function normalizeDegrees(deg) {
  return ((deg % 360) + 360) % 360;
}

export function CoursePlanningScreen({
  courseId,
  courseName,
  teeColor,
  uid,
  onBack,
  onStartGpsRound,
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const cameraRef = useRef(null);

  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentHoleIndex, setCurrentHoleIndex] = useState(0);
  const [weather, setWeather] = useState(null);
  const [planHoles, setPlanHoles] = useState({});
  const [markedShot, setMarkedShot] = useState(null);
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);

  const visibleHoles = course?.holes || [];
  const currentHole = visibleHoles[currentHoleIndex] || null;
  const currentHoleNumber = currentHole?.hole ?? currentHole?.number ?? currentHoleIndex + 1;

  const teeBack = useMemo(() => findPoi(currentHole, 'Tee', 'B'), [currentHole]);
  const greenCenter = useMemo(() => findPoi(currentHole, 'Green', 'C'), [currentHole]);
  const greenFront = useMemo(() => findPoi(currentHole, 'Green', 'F'), [currentHole]);
  const greenBack = useMemo(() => findPoi(currentHole, 'Green', 'B'), [currentHole]);

  // Set Mapbox access token
  useEffect(() => {
    if (MapboxGL && MAPBOX_PUBLIC_TOKEN) {
      MapboxGL.setAccessToken(MAPBOX_PUBLIC_TOKEN);
    }
  }, []);

  // Load course data
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        let data = await getCourse(courseId);
        if (!data) {
          data = await fetchCourseHolesFromBackend(courseId, courseName);
        }
        setCourse(data);
      } catch (err) {
        setError('Could not load course data.');
      } finally {
        setLoading(false);
      }
    })();
  }, [courseId, courseName]);

  // Load existing plan
  useEffect(() => {
    if (!courseId || !teeColor) return;
    loadPlan(uid, courseId, teeColor).then(plan => {
      if (plan?.holes) setPlanHoles(plan.holes);
    }).catch(() => {});
  }, [courseId, teeColor, uid]);

  // Fetch weather once
  useEffect(() => {
    if (!teeBack) return;
    fetchPlanWeather(teeBack.Latitude, teeBack.Longitude)
      .then(setWeather)
      .catch(() => {});
  }, [teeBack]);

  // Load saved note/marker for current hole
  useEffect(() => {
    const holeKey = String(currentHoleNumber);
    const holePlan = planHoles[holeKey];
    setMarkedShot(holePlan?.markedShot || null);
    setNoteText(holePlan?.note || '');
  }, [currentHoleNumber, planHoles]);

  // Distance from tee to green
  const teeYardage = useMemo(() => {
    if (!teeBack || !greenCenter) return null;
    const y = haversineYards(teeBack.Latitude, teeBack.Longitude, greenCenter.Latitude, greenCenter.Longitude);
    return Number.isFinite(y) ? Math.round(y) : null;
  }, [teeBack, greenCenter]);

  // Bearing for wind adjustment
  const shotBearingDeg = useMemo(() => {
    if (!teeBack || !greenCenter) return null;
    const dy = (greenCenter.Latitude - teeBack.Latitude) * (Math.PI / 180);
    const dx = ((greenCenter.Longitude - teeBack.Longitude) * (Math.PI / 180)) *
      Math.cos(((greenCenter.Latitude + teeBack.Latitude) / 2) * (Math.PI / 180));
    return normalizeDegrees(Math.atan2(dx, dy) * (180 / Math.PI));
  }, [teeBack, greenCenter]);

  // Playing distance with adjustments
  const playingDistance = useMemo(() => {
    if (!Number.isFinite(teeYardage) || !Number.isFinite(shotBearingDeg)) return null;
    const base = getPlayingAdjustment(teeYardage, weather, shotBearingDeg);
    return {
      adjustedYards: Math.max(0, Math.round(teeYardage + (base?.windAdj ?? 0) + (base?.tempAdj ?? 0))),
      windAdj: base?.windAdj ?? 0,
      tempAdj: base?.tempAdj ?? 0,
    };
  }, [teeYardage, shotBearingDeg, weather]);

  // Distance from marked shot to green
  const markedShotDistance = useMemo(() => {
    if (!markedShot || !greenCenter) return null;
    const y = haversineYards(markedShot.lat, markedShot.lng, greenCenter.Latitude, greenCenter.Longitude);
    return Number.isFinite(y) ? Math.round(y) : null;
  }, [markedShot, greenCenter]);

  const handleSelectHole = useCallback((index) => {
    // Save current hole's plan before switching
    saveHolePlan();
    setCurrentHoleIndex(index);
  }, [currentHoleNumber, markedShot, noteText]);

  const saveHolePlan = useCallback(() => {
    const holeKey = String(currentHoleNumber);
    setPlanHoles(prev => ({
      ...prev,
      [holeKey]: {
        markedShot: markedShot || null,
        note: noteText || null,
        planningYardage: playingDistance?.adjustedYards ?? teeYardage ?? null,
      },
    }));
  }, [currentHoleNumber, markedShot, noteText, playingDistance, teeYardage]);

  const handleSavePlan = useCallback(async () => {
    saveHolePlan();
    setSaving(true);
    try {
      const allHoles = {
        ...planHoles,
        [String(currentHoleNumber)]: {
          markedShot: markedShot || null,
          note: noteText || null,
          planningYardage: playingDistance?.adjustedYards ?? teeYardage ?? null,
        },
      };
      await savePlan(uid, courseId, teeColor, allHoles, weather ? {
        tempF: weather.tempF,
        windMph: weather.windMph,
        windDegrees: weather.windDegrees,
      } : null);
      // Auto-download course data if not already cached
      const cached = await isCourseCached(courseId);
      if (!cached && teeBack) {
        downloadCourse(courseId, courseName, teeBack.Latitude, teeBack.Longitude).catch(() => {});
      }
      Alert.alert('Plan saved', 'Your course plan has been saved.');
    } catch {
      Alert.alert('Save failed', 'Could not save your plan. Try again.');
    } finally {
      setSaving(false);
    }
  }, [planHoles, currentHoleNumber, markedShot, noteText, playingDistance, teeYardage, uid, courseId, teeColor, weather, saveHolePlan]);

  const handleMarkTeeShot = useCallback(() => {
    if (!teeBack) return;
    // Place marker at a default position (60% of the way from tee to green)
    if (!greenCenter) return;
    const lat = teeBack.Latitude + (greenCenter.Latitude - teeBack.Latitude) * 0.6;
    const lng = teeBack.Longitude + (greenCenter.Longitude - teeBack.Longitude) * 0.6;
    setMarkedShot({ lat, lng });
  }, [teeBack, greenCenter]);

  // Camera: center on tee
  const resetCamera = useCallback(() => {
    if (!cameraRef.current || !teeBack || !greenCenter) return;
    const minLat = Math.min(teeBack.Latitude, greenCenter.Latitude);
    const maxLat = Math.max(teeBack.Latitude, greenCenter.Latitude);
    const minLng = Math.min(teeBack.Longitude, greenCenter.Longitude);
    const maxLng = Math.max(teeBack.Longitude, greenCenter.Longitude);
    cameraRef.current.fitBounds(
      [minLng - 0.0005, minLat - 0.0005],
      [maxLng + 0.0005, maxLat + 0.0005],
      [40, 40, 40, 40],
      600
    );
  }, [teeBack, greenCenter]);

  useEffect(() => { resetCamera(); }, [currentHole, resetCamera]);

  const isLastHole = currentHoleIndex >= visibleHoles.length - 1;
  const isFirstHole = currentHoleIndex <= 0;

  if (!MapboxGL) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.errorText}>Maps not available.</Text>
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
        <View style={styles.center}>
          <Text style={styles.loadingText}>Loading course...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !course) {
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
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <View style={{ height: insets.top, backgroundColor: colors.bg.primary }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.headerBack}>
          <Ionicons name="chevron-back" size={24} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {courseName || 'Course Plan'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {teeColor || 'Planning'} tees
          </Text>
        </View>
        <TouchableOpacity onPress={handleSavePlan} style={styles.saveBtn} disabled={saving}>
          <Text style={styles.saveBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      {/* Hole selector */}
      <HoleDots
        holes={visibleHoles}
        currentHoleIndex={currentHoleIndex}
        onSelect={handleSelectHole}
        loggedHoles={[]}
      />

      {/* Map */}
      <View style={styles.mapContainer}>
        <MapboxGL.MapView
          style={styles.map}
          styleURL="mapbox://styles/mapbox/satellite-v9"
          compassEnabled={false}
          logoEnabled={false}
          attributionEnabled={false}
          scaleBarEnabled={false}
        >
          <MapboxGL.Camera
            ref={cameraRef}
            defaultSettings={{
              centerCoordinate: [-122.4, 37.8],
              zoomLevel: 16,
            }}
            {...(teeBack && greenCenter ? {
              bounds: {
                ne: [Math.max(teeBack.Longitude, greenCenter.Longitude) + 0.0005, Math.max(teeBack.Latitude, greenCenter.Latitude) + 0.0005],
                sw: [Math.min(teeBack.Longitude, greenCenter.Longitude) - 0.0005, Math.min(teeBack.Latitude, greenCenter.Latitude) - 0.0005],
                paddingLeft: 40, paddingRight: 40, paddingTop: 40, paddingBottom: 40,
              },
              animationDuration: 600,
            } : {})}
          />

          {/* Marked tee shot */}
          {markedShot && (
            <>
              {teeBack && (
                <MapboxGL.ShapeSource
                  id="plan-shot-line"
                  shape={{
                    type: 'Feature',
                    geometry: {
                      type: 'LineString',
                      coordinates: [
                        [teeBack.Longitude, teeBack.Latitude],
                        [markedShot.lng, markedShot.lat],
                      ],
                    },
                  }}
                >
                  <MapboxGL.LineLayer
                    id="plan-shot-line-layer"
                    style={{
                      lineColor: 'rgba(16,185,129,0.7)',
                      lineWidth: 2,
                      lineDasharray: [3, 2],
                    }}
                  />
                </MapboxGL.ShapeSource>
              )}
              <MapboxGL.PointAnnotation
                id="plan-shot-marker"
                coordinate={[markedShot.lng, markedShot.lat]}
                draggable
                onDragEnd={(e) => {
                  const coords = e?.geometry?.coordinates;
                  if (Array.isArray(coords) && coords.length >= 2) {
                    setMarkedShot({ lat: coords[1], lng: coords[0] });
                  }
                }}
              >
                <View style={styles.planMarker}>
                  <View style={styles.planDiamond} />
                  <Text style={styles.planMarkerLabel}>
                    {markedShotDistance ? `${markedShotDistance}y` : 'P'}
                  </Text>
                </View>
              </MapboxGL.PointAnnotation>
            </>
          )}
        </MapboxGL.MapView>

        {/* Distance badge */}
        <View style={styles.distanceBadge}>
          <Text style={styles.distanceBadgeLabel}>PLAN</Text>
          <Text style={styles.distanceValue}>
            {playingDistance?.adjustedYards ?? teeYardage ?? '--'}
          </Text>
          <Text style={styles.distanceSub}>Today's conditions</Text>
          <Text style={styles.distGps}>GPS {teeYardage ?? '--'}</Text>
          {playingDistance && (
            <Text style={styles.distAdj}>
              W {(playingDistance.windAdj ?? 0) > 0 ? '+' : ''}{playingDistance.windAdj ?? 0}
              {' '} T {(playingDistance.tempAdj ?? 0) > 0 ? '+' : ''}{playingDistance.tempAdj ?? 0}
            </Text>
          )}
        </View>

        {/* Hole info */}
        <View style={styles.holeInfoChip}>
          <Text style={styles.holeInfoText}>
            Hole {currentHoleNumber} · Par {currentHole?.par ?? 4}
            {currentHole?.hcp ? ` · HCP ${currentHole.hcp}` : ''}
          </Text>
        </View>
      </View>

      {/* Bottom controls */}
      <View style={styles.bottomBar}>
        <View style={styles.navRow}>
          <TouchableOpacity
            style={[styles.navBtn, isFirstHole && styles.navBtnDisabled]}
            onPress={() => !isFirstHole && handleSelectHole(currentHoleIndex - 1)}
            disabled={isFirstHole}
          >
            <Ionicons name="chevron-back" size={18} color={isFirstHole ? '#555' : '#fff'} />
            <Text style={[styles.navBtnText, isFirstHole && styles.navBtnTextDisabled]}>Prev</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.markBtn}
            onPress={markedShot ? () => setMarkedShot(null) : handleMarkTeeShot}
          >
            <Ionicons
              name={markedShot ? 'close-circle-outline' : 'flag-outline'}
              size={18}
              color={markedShot ? '#EF4444' : colors.brand.primary}
            />
            <Text style={[styles.markBtnText, markedShot && { color: '#EF4444' }]}>
              {markedShot ? 'Clear' : 'Mark Tee Shot'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.navBtn, isLastHole && styles.navBtnDisabled]}
            onPress={() => !isLastHole && handleSelectHole(currentHoleIndex + 1)}
            disabled={isLastHole}
          >
            <Text style={[styles.navBtnText, isLastHole && styles.navBtnTextDisabled]}>Next</Text>
            <Ionicons name="chevron-forward" size={18} color={isLastHole ? '#555' : '#fff'} />
          </TouchableOpacity>
        </View>

        {/* Note field */}
        <TextInput
          style={styles.noteInput}
          value={noteText}
          onChangeText={setNoteText}
          placeholder="Add a note for this hole..."
          placeholderTextColor="rgba(255,255,255,0.3)"
          maxLength={80}
          returnKeyType="done"
        />

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.savePlanBtn} onPress={handleSavePlan} disabled={saving}>
            <Ionicons name="save-outline" size={18} color="#fff" />
            <Text style={styles.savePlanBtnText}>{saving ? 'Saving...' : 'Save Plan'}</Text>
          </TouchableOpacity>
          {onStartGpsRound && (
            <TouchableOpacity
              style={styles.startRoundBtn}
              onPress={() => onStartGpsRound(courseId, courseName, teeColor)}
            >
              <Ionicons name="navigate-circle" size={18} color={colors.brand.primary} />
              <Text style={styles.startRoundBtnText}>Start GPS Round</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={{ height: insets.bottom, backgroundColor: colors.bg.primary }} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg.primary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  errorText: { color: colors.text.secondary, fontSize: 14, textAlign: 'center' },
  loadingText: { color: colors.text.secondary, fontSize: 14 },
  backBtn: { marginTop: 12, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.bg.secondary },
  backBtnText: { color: colors.text.primary, fontSize: 14, fontWeight: '600' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.bg.primary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  headerBack: { padding: 4 },
  headerCenter: { flex: 1, marginLeft: 8 },
  headerTitle: { color: colors.text.primary, fontSize: 16, fontWeight: '700' },
  headerSubtitle: { color: colors.text.tertiary, fontSize: 11, marginTop: 1 },
  saveBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.brand.primaryMuted },
  saveBtnText: { color: colors.brand.primary, fontSize: 13, fontWeight: '700' },

  mapContainer: { flex: 1 },
  map: { flex: 1 },

  distanceBadge: {
    position: 'absolute',
    right: 10,
    top: 8,
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.md + 1,
    borderWidth: 1,
    borderColor: colors.brand.primaryBorder,
    paddingHorizontal: 9,
    paddingVertical: 7,
    minWidth: 54,
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
  distanceValue: {
    color: colors.text.primary,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 24,
  },
  distanceSub: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.5,
    marginTop: -1,
  },
  distGps: {
    color: 'rgba(255,255,255,0.30)',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  distAdj: {
    color: colors.brand.primary,
    fontSize: 8,
    fontWeight: '600',
    marginTop: 2,
  },

  holeInfoChip: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    zIndex: 10,
  },
  holeInfoText: {
    color: colors.text.primary,
    fontSize: 12,
    fontWeight: '600',
  },

  planMarker: { alignItems: 'center' },
  planDiamond: {
    width: 16,
    height: 16,
    backgroundColor: 'rgba(16,185,129,0.5)',
    borderWidth: 2,
    borderColor: colors.brand.primary,
    transform: [{ rotate: '45deg' }],
  },
  planMarkerLabel: {
    fontSize: 10,
    color: colors.brand.primary,
    fontWeight: '700',
    marginTop: 2,
  },

  bottomBar: {
    backgroundColor: colors.bg.primary,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  navBtnDisabled: { opacity: 0.3 },
  navBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  navBtnTextDisabled: { color: '#555' },
  markBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.brand.primaryMuted,
    borderWidth: 1,
    borderColor: colors.brand.primaryBorder,
  },
  markBtnText: { color: colors.brand.primary, fontSize: 13, fontWeight: '700' },
  noteInput: {
    color: colors.text.primary,
    fontSize: 13,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  savePlanBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.bg.secondary,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },
  savePlanBtnText: { color: colors.text.primary, fontSize: 13, fontWeight: '600' },
  startRoundBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.brand.primaryMuted,
    borderWidth: 1,
    borderColor: colors.brand.primaryBorder,
  },
  startRoundBtnText: { color: colors.brand.primary, fontSize: 13, fontWeight: '700' },
});
