import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
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
import { haversineYards } from '../../services/haversine';
import { fetchWithTimeout } from '../../utils/fetchWithTimeout';
import { colors, radius } from '../../theme/tokens';

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

export const GpsOverlay = forwardRef(function GpsOverlay(
  {
    userPos,
    greenCenter,
    teePoi,
    holePar,
    userClubs = null,
    tournamentMode = false,
    detectLieAtCoordinate,
    onOverlayStateChange,
    onShotLogged,
  },
  ref
) {
  const [weather, setWeather] = useState(null);
  const [weatherError, setWeatherError] = useState('');
  const [targetPoint, setTargetPoint] = useState(null);
  const [clubPickerOpen, setClubPickerOpen] = useState(false);
  const [selectedClub, setSelectedClub] = useState(null);
  const [manualLie, setManualLie] = useState(null);

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
    handleLongPress(event) {
      const coordinates = event?.geometry?.coordinates;
      if (!Array.isArray(coordinates) || coordinates.length < 2) return;
      setTargetPoint({
        lng: coordinates[0],
        lat: coordinates[1],
      });
      setManualLie(null);
    },
    openClubPicker() {
      setClubPickerOpen(true);
    },
    startShotEntry() {
      if (!userPos?.lat || !userPos?.lng) return;
      setTargetPoint({
        lng: userPos.lng,
        lat: userPos.lat,
      });
      setManualLie(null);
    },
    handleCameraChanged(event) {
      if (!targetPoint) return;
      const center = event?.properties?.center ?? event?.properties?.centerCoordinate ?? event?.geometry?.coordinates;
      if (!Array.isArray(center) || center.length < 2) return;
      setTargetPoint({
        lng: center[0],
        lat: center[1],
      });
      setManualLie(null);
    },
    resetOverlay() {
      setTargetPoint(null);
      setClubPickerOpen(false);
      setSelectedClub(null);
      setManualLie(null);
    },
  }));

  useEffect(() => {
    onOverlayStateChange?.({
      anySheet: clubPickerOpen,
      shotFlow: targetPoint ? 'draft' : selectedClub ? 'mark' : clubPickerOpen ? 'club' : 'idle',
      selectedClub,
    });
  }, [clubPickerOpen, onOverlayStateChange, selectedClub, targetPoint]);

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
    if (!targetPoint || !userPos || !activeClub) return;
    onShotLogged?.({
      club: activeClub,
      holePar,
      from: { ...targetPoint },
      to: greenCenter ? { lat: greenCenter.Latitude, lng: greenCenter.Longitude } : null,
      actualYards: targetDistance,
      playingYards: tournamentMode ? targetDistance : targetPlaying?.adjustedYards ?? targetDistance,
      weather: tournamentMode ? null : weather,
      lie: activeLie?.lie || null,
      lieColor: activeLie?.color || null,
      tee: teePoi
        ? { lat: teePoi.Latitude, lng: teePoi.Longitude }
        : null,
      targetKind: 'map',
      loggedAt: new Date().toISOString(),
    });
    setTargetPoint(null);
    setManualLie(null);
  };

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

      <View pointerEvents="box-none" style={styles.overlayRoot}>
        {targetPoint && (
          <View style={styles.targetCard}>
            <View style={styles.targetCardHeader}>
              <Text style={styles.targetTitle}>Shot From</Text>
              <TouchableOpacity onPress={() => setTargetPoint(null)}>
                <Ionicons name="close" size={18} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <View style={styles.targetYardages}>
              <View style={styles.targetYardageItem}>
                <Text style={styles.targetYardageLabel}>GPS</Text>
                <Text style={styles.targetGpsValue}>{targetDistance ?? '--'}</Text>
              </View>
              <Text style={styles.targetArrow}>→</Text>
              <View style={styles.targetPlayingWrap}>
                <Text style={styles.targetYardageLabel}>PLAYING</Text>
                <Text style={styles.targetPlayingValue}>
                  {tournamentMode ? targetDistance ?? '--' : targetPlaying?.adjustedYards ?? '--'}
                </Text>
              </View>
            </View>
            {!tournamentMode && (
              <View style={styles.targetBreakdown}>
                <View style={styles.targetBreakdownRow}>
                  <Text style={styles.targetBreakdownLabel}>Wind</Text>
                  <Text style={[
                    styles.targetBreakdownValue,
                    (targetPlaying?.windAdj ?? 0) > 0 ? styles.targetBreakdownValueHot : styles.targetBreakdownValueGood,
                  ]}>
                    {(targetPlaying?.windAdj ?? 0) > 0 ? '+' : ''}{targetPlaying?.windAdj ?? 0} yds
                  </Text>
                </View>
                <View style={styles.targetBreakdownRow}>
                  <Text style={styles.targetBreakdownLabel}>Temp</Text>
                  <Text style={[
                    styles.targetBreakdownValue,
                    (targetPlaying?.tempAdj ?? 0) > 0 ? styles.targetBreakdownValueHot : styles.targetBreakdownValueGood,
                  ]}>
                    {(targetPlaying?.tempAdj ?? 0) > 0 ? '+' : ''}{targetPlaying?.tempAdj ?? 0} yds
                  </Text>
                </View>
              </View>
            )}
            <View style={styles.targetClubRow}>
              <Text style={styles.targetClubLabel}>CLUB</Text>
              <TouchableOpacity style={styles.inlineChip} onPress={() => setClubPickerOpen(true)}>
                <Text style={styles.targetClubValue}>{activeClub || 'Select club'}</Text>
              </TouchableOpacity>
              {clubSuggestion.best?.yards ? (
                <Text style={styles.targetClubMeta}>{clubSuggestion.best.yards}y</Text>
              ) : null}
            </View>
            <View style={styles.targetLieRow}>
              <Text style={styles.targetClubLabel}>LIE</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.lieRail}>
                {lieChoices.map((option) => {
                  const active = activeLie?.lie === option.lie;
                  return (
                    <TouchableOpacity
                      key={option.lie}
                      style={[
                        styles.lieChip,
                        active && { borderColor: option.color, backgroundColor: `${option.color}20` },
                      ]}
                      onPress={() => setManualLie(option)}
                    >
                      <View style={[styles.lieChipDot, { backgroundColor: option.color }]} />
                      <Text style={[styles.lieChipText, active && { color: option.color }]}>{option.lie}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
            <Text style={styles.targetHint}>
              {weatherError ? weatherError : tournamentMode ? 'Tournament mode active' : 'Pan the map to place where you hit from'}
            </Text>
            <Text style={styles.targetFootnote}>The lie auto-updates with the marker. Tap a chip if you need to override it.</Text>
            {activeClub && (
              <TouchableOpacity style={styles.logButton} onPress={logShot}>
                <Text style={styles.logButtonText}>Save Shot</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      <Modal visible={clubPickerOpen} transparent animationType="fade" onRequestClose={() => setClubPickerOpen(false)}>
        <View style={styles.modalBackdrop}>
          <TouchableOpacity style={styles.modalScrim} activeOpacity={1} onPress={() => setClubPickerOpen(false)} />
          <View style={styles.modalSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.modalTitle}>Log Shot</Text>
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
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10, 10, 10, 0.98)',
    borderWidth: 1,
    borderColor: 'rgba(246, 201, 14, 0.15)',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 26,
  },
  targetCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
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
    fontSize: 38,
    fontWeight: '700',
    lineHeight: 38,
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
    fontSize: 38,
    fontWeight: '700',
    lineHeight: 38,
    letterSpacing: -1,
  },
  targetBreakdown: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  targetBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  targetBreakdownLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
  targetBreakdownValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  targetBreakdownValueHot: {
    color: '#F87171',
  },
  targetBreakdownValueGood: {
    color: colors.brand.primary,
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
  targetHint: {
    color: '#9CA3AF',
    fontSize: 12,
    marginTop: 8,
  },
  targetFootnote: {
    color: 'rgba(255,255,255,0.28)',
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
