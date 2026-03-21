import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { haversineYards } from '../../services/haversine';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { colors, radius } from '../../theme/tokens';
import { GPS_MAP_OVERLAY } from '../../constants/gpsLayout';

let MapboxGL = null;
try {
  // eslint-disable-next-line global-require
  MapboxGL = require('@rnmapbox/maps');
} catch {
  MapboxGL = null;
}

const weatherCache = new Map();

const toRad = (deg) => (deg * Math.PI) / 180;
const normalizeDegrees = (deg) => ((deg % 360) + 360) % 360;

const directionDelta = (a, b) => {
  const delta = Math.abs(normalizeDegrees(a) - normalizeDegrees(b));
  return Math.min(delta, 360 - delta);
};

const getWindText = (speed) => {
  if (!Number.isFinite(speed)) return 'Wind --';
  return `${Math.round(speed)} mph`;
};

const getWindArrow = (degrees) => {
  if (!Number.isFinite(degrees)) return 'compass-outline';
  return 'navigate';
};

async function getOverlayWeather(lat, lng) {
  const cacheKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  if (weatherCache.has(cacheKey)) {
    return weatherCache.get(cacheKey);
  }

  const response = await fetchWithTimeout(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,wind_speed_10m,wind_direction_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`
  );
  if (!response.ok) {
    throw new Error(`Weather lookup failed (${response.status})`);
  }

  const data = await response.json();
  const next = {
    tempF: Number(data?.current?.temperature_2m ?? NaN),
    windMph: Number(data?.current?.wind_speed_10m ?? NaN),
    windDegrees: Number(data?.current?.wind_direction_10m ?? NaN),
  };
  weatherCache.set(cacheKey, next);
  return next;
}

function getPlayingAdjustment(baseYards, weather, shotBearingDeg) {
  const tempAdj = Number.isFinite(weather?.tempF) ? Math.round((70 - weather.tempF) * 0.35) : 0;
  let windAdj = 0;
  if (Number.isFinite(weather?.windMph) && Number.isFinite(weather?.windDegrees) && Number.isFinite(shotBearingDeg)) {
    const windToShot = directionDelta(weather.windDegrees, shotBearingDeg);
    if (windToShot <= 45) {
      windAdj = Math.round(weather.windMph * 0.6);
    } else if (windToShot >= 135) {
      windAdj = Math.round(weather.windMph * -0.45);
    } else {
      windAdj = Math.round(weather.windMph * 0.1);
    }
  }
  return {
    adjustedYards: Math.max(0, Math.round(baseYards + tempAdj + windAdj)),
    tempAdj,
    windAdj,
  };
}

function pickSuggestedClub(targetYards, userClubs) {
  const entries = Object.entries(userClubs || {})
    .filter(([, yards]) => Number.isFinite(yards))
    .map(([club, yards]) => ({ club, yards: Number(yards) }))
    .sort((a, b) => b.yards - a.yards);

  if (!entries.length || !Number.isFinite(targetYards)) {
    return { best: null, ranked: [] };
  }

  const ranked = entries
    .map((entry) => ({
      ...entry,
      diff: Math.round(targetYards - entry.yards),
      absDiff: Math.abs(targetYards - entry.yards),
    }))
    .sort((a, b) => a.absDiff - b.absDiff);

  return { best: ranked[0], ranked };
}

const lieChoicesMap = {
  'Tee Box': '#60A5FA',
  'Fairway': '#4CAF7D',
  'Left Rough': '#A3E635',
  'Right Rough': '#A3E635',
  'Sand': '#FBBF24',
  'Green': '#34D399',
  'Trees': '#86EFAC',
  'Water': '#60A5FA',
};

export const GpsOverlay = forwardRef(function GpsOverlay(
  {
    userPos,
    startPoint,
    greenCenter,
    teePoi,
    holePar,
    userClubs = null,
    activeBagClubs = [],
    tournamentMode = false,
    detectLieAtCoordinate,
    onOverlayStateChange,
    onShotLogged,
    shotNumber = 1,
    previousLie = null,
  },
  ref
) {
  const [weather, setWeather] = useState(null);
  const [weatherError, setWeatherError] = useState('');
  // NOTE: This component previously used `targetPoint` as the implicit "in-progress shot".
  // We now treat shot tracking as an explicit state machine so shot coords come ONLY from map tap.
  const [targetPoint, setTargetPoint] = useState(null); // { lng, lat } derived from shotInProgress.coords
  const [shotInProgress, setShotInProgress] = useState(null); // { id, coords:{latitude,longitude}|null, club:string|null }
  const shotInProgressRef = useRef(null);
  const [mapMode, setMapMode] = useState('gps'); // 'gps' | 'placing' | 'confirming'
  const mapModeRef = useRef('gps');
  const [clubPickerOpen, setClubPickerOpen] = useState(false);
  const [selectedClub, setSelectedClub] = useState(null);
  const [manualLie, setManualLie] = useState(null);
  const [penalty, setPenalty] = useState(null); // null | 'OB' | 'Water' | 'Unplayable'
  const logShotRef = useRef(null);
  const cycleLieRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (!userPos?.lat || !userPos?.lng) return undefined;
    if (tournamentMode) {
      setWeather(null);
      setWeatherError('');
      return undefined;
    }

    getOverlayWeather(userPos.lat, userPos.lng)
      .then((next) => {
        if (!cancelled) {
          setWeather(next);
          setWeatherError('');
        }
      })
      .catch(() => {
        if (!cancelled) setWeatherError('Weather unavailable');
      });

    return () => {
      cancelled = true;
    };
  }, [tournamentMode, userPos?.lat, userPos?.lng]);

  useImperativeHandle(ref, () => ({
    openClubPicker() {
      setClubPickerOpen(true);
    },
    getMapMode() {
      return mapModeRef.current;
    },
    handleShotMapTap(tapCoords) {
      // Move the shot marker using tap coordinates.
      // In `placing`, we transition to `confirming` and open the club picker.
      if (mapModeRef.current !== 'placing' && mapModeRef.current !== 'confirming') return false;
      if (!tapCoords || !Number.isFinite(tapCoords.latitude) || !Number.isFinite(tapCoords.longitude)) return false;
      const currentShot = shotInProgressRef.current;
      if (!currentShot?.id) return false;

      const nextCoords = {
        latitude: tapCoords.latitude,
        longitude: tapCoords.longitude,
      };

      // Keep existing overlay logic working by deriving targetPoint for distance/lie suggestions.
      const nextTargetPoint = { lng: nextCoords.longitude, lat: nextCoords.latitude };
      setTargetPoint(nextTargetPoint);

      if (mapModeRef.current === 'placing') {
        mapModeRef.current = 'confirming';
        setMapMode('confirming');

        const nextShot = currentShot ? ({
          ...currentShot,
          coords: nextCoords,
          club: null,
        }) : currentShot;

        shotInProgressRef.current = nextShot;
        setShotInProgress(nextShot);

        setSelectedClub(null);
        setClubPickerOpen(true);
      } else {
        // confirming: just move the marker; keep club selection
        const nextShot = currentShot ? ({
          ...currentShot,
          coords: nextCoords,
        }) : currentShot;
        shotInProgressRef.current = nextShot;
        setShotInProgress(nextShot);
      }
      return true;
    },
    startShotEntry() {
      // IDLE → PLACING (fresh shot object + fresh ID)
      if (mapModeRef.current !== 'gps') return;

      const shotId =
        typeof Crypto.randomUUID === 'function'
          ? Crypto.randomUUID()
          : `shot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

      const origin =
        Number.isFinite(startPoint?.lat) && Number.isFinite(startPoint?.lng)
          ? startPoint
          : null;
      const initialCoords = origin ? { latitude: origin.lat, longitude: origin.lng } : null;

      const nextShot = {
        id: shotId,
        coords: initialCoords,
        club: null,
      };

      shotInProgressRef.current = nextShot;
      setShotInProgress(nextShot);
      mapModeRef.current = 'placing';
      setMapMode('placing');

      // Clear previous shot state so each shot starts completely fresh
      setSelectedClub(null);
      setClubPickerOpen(false);
      setPenalty(null);
      setTargetPoint(initialCoords ? { lng: initialCoords.longitude, lat: initialCoords.latitude } : null);

      // Smart lie defaults: shot 1 = Tee, shot 2 = Fairway, shot 3+ = inherit previous
      if (shotNumber <= 1) {
        setManualLie({ lie: 'Tee Box', color: '#60A5FA' });
      } else if (shotNumber === 2) {
        setManualLie({ lie: 'Fairway', color: '#4CAF7D' });
      } else if (previousLie) {
        setManualLie({ lie: previousLie, color: lieChoicesMap[previousLie] || '#9CA3AF' });
      } else {
        setManualLie(null);
      }
    },
    handleCameraChanged(event) {
      // Pan-to-place: while placing/confirming, keep marker aligned to camera center.
      if (mapModeRef.current === 'gps') return;

      const center = event?.properties?.center ?? event?.properties?.centerCoordinate ?? event?.geometry?.coordinates;
      if (!Array.isArray(center) || center.length < 2) return;

      const currentShot = shotInProgressRef.current;
      if (!currentShot?.id) return;

      const nextTargetPoint = { lng: center[0], lat: center[1] };
      const nextCoords = { latitude: nextTargetPoint.lat, longitude: nextTargetPoint.lng };

      setTargetPoint(nextTargetPoint);
      shotInProgressRef.current = { ...currentShot, coords: nextCoords };
    },
    resetOverlay() {
      mapModeRef.current = 'gps';
      setMapMode('gps');
      shotInProgressRef.current = null;
      setShotInProgress(null);
      setTargetPoint(null);
      setClubPickerOpen(false);
      setSelectedClub(null);
      setManualLie(null);
      setPenalty(null);
    },
    confirmAndLog() {
      logShotRef.current?.();
    },
    cycleLie() {
      cycleLieRef.current?.();
    },
  }));

  // Overlay state is reported in a single effect below (after computed values are ready)

  const greenDistance = useMemo(() => {
    if (!userPos || !greenCenter) return null;
    return haversineYards(userPos.lat, userPos.lng, greenCenter.Latitude, greenCenter.Longitude);
  }, [greenCenter, userPos]);

  const shotBearingDeg = useMemo(() => {
    if (!userPos || !greenCenter) return null;
    const dy = toRad(greenCenter.Latitude - userPos.lat);
    const dx = toRad(greenCenter.Longitude - userPos.lng) * Math.cos(toRad((greenCenter.Latitude + userPos.lat) / 2));
    const angle = Math.atan2(dx, dy) * (180 / Math.PI);
    return normalizeDegrees(angle);
  }, [greenCenter, userPos]);

  const greenPlaying = useMemo(() => {
    if (!Number.isFinite(greenDistance) || !Number.isFinite(shotBearingDeg)) return null;
    return getPlayingAdjustment(greenDistance, weather, shotBearingDeg);
  }, [greenDistance, shotBearingDeg, weather]);

  const targetDistance = useMemo(() => {
    if (!targetPoint || !greenCenter) return null;
    return haversineYards(targetPoint.lat, targetPoint.lng, greenCenter.Latitude, greenCenter.Longitude);
  }, [greenCenter, targetPoint]);

  const targetBearingDeg = useMemo(() => {
    if (!targetPoint || !greenCenter) return null;
    const dy = toRad(greenCenter.Latitude - targetPoint.lat);
    const dx = toRad(greenCenter.Longitude - targetPoint.lng) * Math.cos(toRad((greenCenter.Latitude + targetPoint.lat) / 2));
    const angle = Math.atan2(dx, dy) * (180 / Math.PI);
    return normalizeDegrees(angle);
  }, [greenCenter, targetPoint]);

  const targetPlaying = useMemo(() => {
    if (!Number.isFinite(targetDistance) || !Number.isFinite(targetBearingDeg)) return null;
    return getPlayingAdjustment(targetDistance, weather, targetBearingDeg);
  }, [targetDistance, targetBearingDeg, weather]);

  const clubSuggestion = useMemo(() => {
    const target = targetPoint
      ? (tournamentMode ? targetDistance : targetPlaying?.adjustedYards)
      : (tournamentMode ? greenDistance : greenPlaying?.adjustedYards);
    return pickSuggestedClub(target, userClubs);
  }, [
    greenDistance,
    greenPlaying?.adjustedYards,
    targetDistance,
    targetPlaying?.adjustedYards,
    targetPoint,
    tournamentMode,
    userClubs,
  ]);

  const activeClub = selectedClub || clubSuggestion.best?.club || null;
  const autoLie = useMemo(() => {
    if (!targetPoint || !detectLieAtCoordinate) return null;
    return detectLieAtCoordinate(targetPoint);
  }, [detectLieAtCoordinate, targetPoint]);
  const activeLie = manualLie || autoLie || null;
  const lieChoices = useMemo(() => ([
    { lie: 'Tee Box', color: '#60A5FA' },
    { lie: 'Fairway', color: '#4CAF7D' },
    { lie: 'Left Rough', color: '#A3E635' },
    { lie: 'Right Rough', color: '#A3E635' },
    { lie: 'Sand', color: '#FBBF24' },
    { lie: 'Green', color: '#34D399' },
    { lie: 'Trees', color: '#86EFAC' },
    { lie: 'Water', color: '#60A5FA' },
  ]), []);

  const targetGeo = useMemo(() => {
    if (!MapboxGL || !userPos || !targetPoint) return null;
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: [
              [userPos.lng, userPos.lat],
              [targetPoint.lng, targetPoint.lat],
            ],
          },
          properties: { kind: 'target-line' },
        },
        {
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [targetPoint.lng, targetPoint.lat],
          },
          properties: { kind: 'target-point' },
        },
      ],
    };
  }, [targetPoint, userPos]);

  const logShot = () => {
    // CONFIRMING → IDLE
    const currentShot = shotInProgressRef.current;
    // Use ref coords (synchronously updated by handleCameraChanged) as authoritative position,
    // falling back to targetPoint React state
    const shotCoords = currentShot?.coords
      ? { lat: currentShot.coords.latitude, lng: currentShot.coords.longitude }
      : targetPoint;
    if (!shotCoords || !activeClub || !currentShot?.id) return;
    onShotLogged?.({
      id: currentShot.id,
      club: activeClub,
      holePar,
      from: { ...shotCoords },
      to: greenCenter ? { lat: greenCenter.Latitude, lng: greenCenter.Longitude } : null,
      actualYards: null,              // calculated post-round from consecutive shot.from coords
      playingYards: tournamentMode ? targetDistance : targetPlaying?.adjustedYards ?? targetDistance,
      weather: tournamentMode ? null : weather,
      lie: activeLie?.lie || null,
      lieColor: activeLie?.color || null,
      tee: teePoi
        ? { lat: teePoi.Latitude, lng: teePoi.Longitude }
        : null,
      targetKind: 'map',
      penalty: penalty || null,
      penaltyStrokes: penalty ? 1 : 0,
      loggedAt: new Date().toISOString(),
    });
    setTargetPoint(null);
    setManualLie(null);
    setPenalty(null);
    setShotInProgress(null);
    shotInProgressRef.current = null;
    mapModeRef.current = 'gps';
    setMapMode('gps');
    setClubPickerOpen(false);
    setSelectedClub(null);
  };

  // Keep refs in sync for imperative access
  logShotRef.current = logShot;
  cycleLieRef.current = () => {
    const lieList = [
      { lie: 'Tee Box', color: '#60A5FA' },
      { lie: 'Fairway', color: '#4CAF7D' },
      { lie: 'Left Rough', color: '#A3E635' },
      { lie: 'Right Rough', color: '#A3E635' },
      { lie: 'Sand', color: '#FBBF24' },
      { lie: 'Green', color: '#34D399' },
    ];
    const currentIdx = lieList.findIndex(l => l.lie === (activeLie?.lie));
    const nextIdx = (currentIdx + 1) % lieList.length;
    setManualLie(lieList[nextIdx]);
  };

  // Report overlay state to parent (single effect with all computed values)
  useEffect(() => {
    // While adding a shot, mapMode is the source of truth: placing vs confirming.
    // Do not collapse confirming into placing — parent HUD uses this for copy + chrome.
    const shotFlow =
      mapModeRef.current === 'gps'
        ? selectedClub
          ? 'mark'
          : clubPickerOpen
            ? 'club'
            : 'idle'
        : mapModeRef.current;
    onOverlayStateChange?.({
      anySheet: clubPickerOpen,
      shotFlow,
      hasPlacementCoords: Boolean(targetPoint),
      selectedClub,
      activeClub: activeClub,
      activeLie: activeLie,
      targetDistance: targetDistance,
      targetPlaying: tournamentMode ? targetDistance : targetPlaying?.adjustedYards ?? targetDistance,
    });
  }, [activeClub, activeLie, clubPickerOpen, onOverlayStateChange, selectedClub, targetDistance, targetPlaying?.adjustedYards, targetPoint, tournamentMode, mapMode]);

  return (
    <>
      {targetGeo && MapboxGL && (
        <MapboxGL.ShapeSource id="gps-overlay-target" shape={targetGeo}>
          <MapboxGL.LineLayer
            id="gps-overlay-target-line"
            filter={['==', ['get', 'kind'], 'target-line']}
            style={mapStyles.targetLine}
          />
          <MapboxGL.CircleLayer
            id="gps-overlay-target-point"
            filter={['==', ['get', 'kind'], 'target-point']}
            style={mapStyles.targetPoint}
          />
          <MapboxGL.CircleLayer
            id="gps-overlay-target-point-core"
            filter={['==', ['get', 'kind'], 'target-point']}
            style={mapStyles.targetPointCore}
          />
        </MapboxGL.ShapeSource>
      )}

      <Modal visible={clubPickerOpen} transparent animationType="fade" onRequestClose={() => setClubPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={styles.modalScrim} activeOpacity={1} onPress={() => setClubPickerOpen(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.modalTitle}>Select Club</Text>
                <Text style={styles.sheetSubtitle}>
                  {tournamentMode
                    ? `GPS ${targetDistance ?? '--'} yds`
                    : `Playing ${targetPlaying?.adjustedYards ?? targetDistance ?? '--'} yds`}
                </Text>
              </View>
              <TouchableOpacity style={styles.sheetClose} onPress={() => setClubPickerOpen(false)}>
                <Text style={styles.sheetCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            {(clubSuggestion.ranked || []).length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.clubRail}
              >
                {(clubSuggestion.ranked || []).slice(0, 8).map((entry) => {
                  const active = selectedClub === entry.club || (!selectedClub && clubSuggestion.best?.club === entry.club);
                  return (
                    <TouchableOpacity
                      key={entry.club}
                      style={[styles.clubCard, active && styles.clubCardActive]}
                      onPress={() => {
                        setSelectedClub(entry.club);
                        setClubPickerOpen(false);
                      }}
                    >
                      {clubSuggestion.best?.club === entry.club && (
                        <Text style={styles.clubBestLabel}>BEST</Text>
                      )}
                      <View style={[styles.clubCardAccent, active && styles.clubCardAccentActive]} />
                      <Text style={[styles.clubCardName, active && styles.clubCardNameActive]}>{entry.club}</Text>
                      <Text style={[styles.clubCardYards, active && styles.clubCardYardsActive]}>{entry.yards}y</Text>
                      <Text
                        style={[
                          styles.clubCardDiff,
                          entry.diff > 0 ? styles.clubCardDiffHot : styles.clubCardDiffGood,
                        ]}
                      >
                        {entry.diff > 0 ? '+' : ''}{entry.diff}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : activeBagClubs.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.clubRail}
              >
                {activeBagClubs.map((club) => {
                  const active = selectedClub === club;
                  return (
                    <TouchableOpacity
                      key={club}
                      style={[styles.clubCard, active && styles.clubCardActive]}
                      onPress={() => {
                        setSelectedClub(club);
                        setClubPickerOpen(false);
                      }}
                    >
                      <View style={[styles.clubCardAccent, active && styles.clubCardAccentActive]} />
                      <Text style={[styles.clubCardName, active && styles.clubCardNameActive]}>{club}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={styles.emptyText}>No club distances saved yet.</Text>
            )}
            <TouchableOpacity style={styles.modalClose} onPress={() => setClubPickerOpen(false)}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
});

const mapStyles = {
  targetLine: {
    lineColor: '#FBBF24',
    lineWidth: 1.2,
    lineDasharray: [5, 3],
    lineOpacity: 0.7,
  },
  targetPoint: {
    circleRadius: 12,
    circleColor: 'rgba(246, 201, 14, 0.08)',
    circleStrokeWidth: 1.5,
    circleStrokeColor: '#FBBF24',
  },
  targetPointCore: {
    circleRadius: 3,
    circleColor: '#FBBF24',
    circleStrokeWidth: 0,
  },
};

const styles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
  },
  targetCard: {
    position: 'absolute',
    left: GPS_MAP_OVERLAY.SHOT_ROW_LEFT,
    right: GPS_MAP_OVERLAY.SHOT_ROW_LEFT,
    bottom: GPS_MAP_OVERLAY.FLOATING_PANEL_BOTTOM_OFFSET,
    maxHeight: 200,
    backgroundColor: 'rgba(10, 10, 10, 0.98)',
    borderWidth: 1,
    borderColor: 'rgba(246, 201, 14, 0.15)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  targetCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  targetTitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  targetYardages: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 12,
  },
  targetYardageItem: {
    alignItems: 'center',
  },
  targetYardageLabel: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  targetGpsValue: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 28,
    letterSpacing: -1,
  },
  targetArrow: {
    color: 'rgba(255,255,255,0.12)',
    fontSize: 18,
  },
  targetPlayingWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(246,201,14,0.07)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  targetPlayingValue: {
    color: '#F6C90E',
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 28,
    letterSpacing: -1,
  },
  targetAdjInline: {
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    textAlign: 'center',
    marginBottom: 8,
  },
  targetClubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.brand.primaryMuted,
    borderWidth: 1,
    borderColor: colors.brand.primaryBorder,
    borderRadius: radius.md - 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  targetLieRow: {
    marginTop: 10,
  },
  targetClubLabel: {
    color: colors.brand.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  targetClubValue: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  targetClubMeta: {
    color: '#555555',
    fontSize: 12,
    marginLeft: 6,
  },
  inlineChip: {
    marginLeft: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  lieRail: {
    gap: 8,
    paddingTop: 8,
  },
  lieChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 8,
  },
  lieChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  lieChipText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    fontWeight: '600',
  },
  targetPenaltyRow: {
    marginTop: 10,
  },
  penaltyChips: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  penaltyChip: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  penaltyChipActive: {
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239,68,68,0.15)',
  },
  penaltyChipText: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 11,
    fontWeight: '600',
  },
  penaltyChipTextActive: {
    color: '#EF4444',
  },
  penaltyNote: {
    color: '#EF4444',
    fontSize: 10,
    marginTop: 4,
  },
  targetHint: {
    color: '#9CA3AF',
    fontSize: 10,
    marginTop: 6,
  },
  logButton: {
    marginTop: 10,
    backgroundColor: colors.brand.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: 10,
  },
  logButtonText: {
    color: '#04140D',
    fontSize: 14,
    fontWeight: '800',
  },
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
  clubCardDiff: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  clubCardDiffHot: {
    color: '#F87171',
  },
  clubCardDiffGood: {
    color: colors.brand.primary,
  },
  emptyText: {
    color: '#9CA3AF',
    fontSize: 13,
    lineHeight: 18,
    marginHorizontal: 18,
    marginBottom: 8,
  },
  modalClose: {
    marginTop: 2,
    alignItems: 'center',
    paddingVertical: 10,
  },
  modalCloseText: {
    color: '#E5E7EB',
    fontSize: 14,
    fontWeight: '700',
  },
});

export default GpsOverlay;
