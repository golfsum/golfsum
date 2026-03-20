import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { haversineYards } from '../services/haversine';
import { getCourseDetail } from '../services/golfApiIoService';
import { MAPBOX_PUBLIC_TOKEN } from '../config/mapbox';
import { colors, radius, spacing, typography } from '../theme/tokens';

let MapboxGL = null;
try { MapboxGL = require('@rnmapbox/maps'); } catch { MapboxGL = null; }

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAP_HEIGHT = SCREEN_WIDTH * 0.85;

function scoreColor(score, par) {
  const diff = score - par;
  if (diff <= -2) return colors.score.eagle;
  if (diff === -1) return colors.score.birdie;
  if (diff === 0) return colors.score.par;
  if (diff === 1) return colors.score.bogey;
  if (diff === 2) return colors.score.double;
  return colors.score.triple;
}

function scoreName(score, par) {
  const diff = score - par;
  if (diff <= -2) return 'Eagle';
  if (diff === -1) return 'Birdie';
  if (diff === 0) return 'Par';
  if (diff === 1) return 'Bogey';
  if (diff === 2) return 'Double';
  return `+${diff}`;
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

function HoleMapCard({ holeNumber, par, yardage, score, putts, shots, holeSummary, courseHole }) {
  const cameraRef = useRef(null);
  const sc = score != null ? scoreColor(score, par) : colors.text.secondary;

  // Find tee and green POIs from course hole data
  const teePoi = useMemo(() => {
    if (!courseHole?.pois) return null;
    return courseHole.pois.find(p => p.POI === 'Tee Back' && p.Location === 'C')
      || courseHole.pois.find(p => p.POI === 'Tee Front' && p.Location === 'C');
  }, [courseHole]);

  const greenPoi = useMemo(() => {
    if (!courseHole?.pois) return null;
    return courseHole.pois.find(p => p.POI === 'Green' && p.Location === 'C');
  }, [courseHole]);

  // Build shot path GeoJSON
  const shotPathGeo = useMemo(() => {
    if (!shots?.length) return null;
    const coords = [];
    shots.forEach(s => {
      if (s.from?.lng && s.from?.lat) coords.push([s.from.lng, s.from.lat]);
    });
    // Add last shot's "to" as end point, or green center
    const last = shots[shots.length - 1];
    if (last?.to?.lng && last?.to?.lat) {
      coords.push([last.to.lng, last.to.lat]);
    } else if (greenPoi) {
      coords.push([greenPoi.Longitude, greenPoi.Latitude]);
    }
    if (coords.length < 2) return null;
    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords },
      properties: {},
    };
  }, [shots, greenPoi]);

  // Camera bounds from all shot coordinates + tee + green
  const cameraBounds = useMemo(() => {
    const pts = [];
    if (teePoi) pts.push([teePoi.Longitude, teePoi.Latitude]);
    if (greenPoi) pts.push([greenPoi.Longitude, greenPoi.Latitude]);
    (shots || []).forEach(s => {
      if (s.from?.lng && s.from?.lat) pts.push([s.from.lng, s.from.lat]);
      if (s.to?.lng && s.to?.lat) pts.push([s.to.lng, s.to.lat]);
    });
    if (pts.length < 2) return null;
    const lngs = pts.map(p => p[0]);
    const lats = pts.map(p => p[1]);
    const pad = 0.15;
    const lngSpan = Math.max(...lngs) - Math.min(...lngs);
    const latSpan = Math.max(...lats) - Math.min(...lats);
    return {
      ne: [Math.max(...lngs) + lngSpan * pad, Math.max(...lats) + latSpan * pad],
      sw: [Math.min(...lngs) - lngSpan * pad, Math.min(...lats) - latSpan * pad],
    };
  }, [teePoi, greenPoi, shots]);

  const defaultCenter = teePoi
    ? [teePoi.Longitude, teePoi.Latitude]
    : greenPoi
      ? [greenPoi.Longitude, greenPoi.Latitude]
      : [-122.4, 37.8];

  const hasMap = MapboxGL && (teePoi || greenPoi || shots?.length);

  return (
    <View style={s.holeCard}>
      {/* Hole header strip */}
      <View style={s.holeHeader}>
        <View style={s.holeNumWrap}>
          <Text style={[s.holeNum, { color: sc }]}>{holeNumber}</Text>
        </View>
        <View style={s.holeInfoCol}>
          <Text style={s.holePar}>Par {par}{yardage ? ` · ${yardage}y` : ''}</Text>
          {score != null && (
            <Text style={[s.holeScoreName, { color: sc }]}>{scoreName(score, par)}</Text>
          )}
        </View>
        <View style={s.holeStatsRow}>
          {score != null && (
            <View style={[s.scoreBox, { borderColor: sc }]}>
              <Text style={[s.scoreBoxText, { color: sc }]}>{score}</Text>
            </View>
          )}
          {putts != null && (
            <View style={s.statChip}>
              <Text style={s.statChipLabel}>{putts}</Text>
              <Text style={s.statChipSub}>putts</Text>
            </View>
          )}
        </View>
      </View>

      {/* Satellite map with shot trail */}
      {hasMap ? (
        <View style={s.mapContainer}>
          <MapboxGL.MapView
            style={s.map}
            styleURL="mapbox://styles/mapbox/satellite-v9"
            logoEnabled={false}
            attributionEnabled={false}
            scaleBarEnabled={false}
            compassEnabled={false}
            scrollEnabled={false}
            zoomEnabled={false}
            pitchEnabled={false}
            rotateEnabled={false}
          >
            <MapboxGL.Camera
              ref={cameraRef}
              defaultSettings={{
                centerCoordinate: defaultCenter,
                zoomLevel: 16.5,
              }}
              {...(cameraBounds ? {
                bounds: {
                  ...cameraBounds,
                  paddingLeft: 50, paddingRight: 50, paddingTop: 50, paddingBottom: 50,
                },
              } : {})}
            />

            {/* Shot trail line */}
            {shotPathGeo && (
              <MapboxGL.ShapeSource id={`trail-${holeNumber}`} shape={shotPathGeo}>
                <MapboxGL.LineLayer
                  id={`trail-line-${holeNumber}`}
                  style={{
                    lineColor: 'rgba(255,255,255,0.8)',
                    lineWidth: 2.5,
                    lineCap: 'round',
                    lineJoin: 'round',
                  }}
                />
              </MapboxGL.ShapeSource>
            )}

            {/* Shot markers */}
            {(shots || []).map((shot, i) => (
              shot.from?.lng && shot.from?.lat ? (
                <MapboxGL.MarkerView
                  key={`shot-r-${holeNumber}-${shot.id || i}`}
                  id={`shot-r-${holeNumber}-${shot.id || i}`}
                  coordinate={[shot.from.lng, shot.from.lat]}
                >
                  <View style={s.shotMarker}>
                    <View style={[s.shotDot, { backgroundColor: i === 0 ? '#FFFFFF' : colors.brand.primary }]} />
                    <View style={s.shotLabel}>
                      <Text style={s.shotClub}>{clubAbbr(shot.club)}</Text>
                      {Number.isFinite(shot.actualYards) && (
                        <Text style={s.shotYards}>{shot.actualYards}y</Text>
                      )}
                    </View>
                  </View>
                </MapboxGL.MarkerView>
              ) : null
            ))}

            {/* Green marker */}
            {greenPoi && (
              <MapboxGL.ShapeSource
                id={`green-${holeNumber}`}
                shape={{
                  type: 'Feature',
                  geometry: { type: 'Point', coordinates: [greenPoi.Longitude, greenPoi.Latitude] },
                  properties: {},
                }}
              >
                <MapboxGL.CircleLayer
                  id={`green-circle-${holeNumber}`}
                  style={{
                    circleRadius: 5,
                    circleColor: 'rgba(16,185,129,0.0)',
                    circleStrokeWidth: 2,
                    circleStrokeColor: '#10B981',
                  }}
                />
              </MapboxGL.ShapeSource>
            )}
          </MapboxGL.MapView>

          {/* Shot count overlay */}
          <View style={s.shotCountOverlay}>
            <Text style={s.shotCountText}>{shots?.length || 0} shots</Text>
            {putts != null && <Text style={s.shotCountText}> · {putts} putts</Text>}
          </View>
        </View>
      ) : (
        <View style={s.noMapPlaceholder}>
          <Ionicons name="map-outline" size={24} color={colors.text.tertiary} />
          <Text style={s.noMapText}>No GPS data for this hole</Text>
        </View>
      )}

      {/* Shot detail chips */}
      {shots?.length > 0 && (
        <View style={s.shotChipsRow}>
          {shots.map((shot, i) => (
            <View key={i} style={s.shotChip}>
              <View style={[s.shotChipDot, { backgroundColor: shot.lieColor || colors.brand.primary }]} />
              <Text style={s.shotChipClub}>{clubAbbr(shot.club)}</Text>
              {Number.isFinite(shot.actualYards) && (
                <Text style={s.shotChipYards}>{shot.actualYards}y</Text>
              )}
              {shot.lie && (
                <Text style={s.shotChipLie}>{shot.lie}</Text>
              )}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function GpsRoundReviewScreen({ round, courseData: courseDataProp, onBack }) {
  const insets = useSafeAreaInsets();
  const [loadedCourseData, setLoadedCourseData] = useState(null);
  const courseData = courseDataProp || loadedCourseData;

  useEffect(() => {
    if (MapboxGL && MAPBOX_PUBLIC_TOKEN) {
      MapboxGL.setAccessToken(MAPBOX_PUBLIC_TOKEN);
    }
  }, []);

  // Auto-load course data with POIs if not provided via prop
  useEffect(() => {
    if (courseDataProp) return;
    const courseId = round?.courseId || round?.courseSnapshot?.courseId || round?.courseSnapshot?.externalId;
    if (!courseId) return;
    let cancelled = false;
    getCourseDetail(courseId).then(detail => {
      if (cancelled || !detail?.holesData) return;
      setLoadedCourseData({ holes: detail.holesData });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [courseDataProp, round]);

  const holes = round?.courseSnapshot?.holes || [];
  const gpsShots = round?.gpsShots || [];
  const gpsSummaries = round?.gpsHoleSummaries || [];
  const roundHoles = round?.holes || [];

  // Group shots by hole
  const shotsByHole = useMemo(() => {
    const map = {};
    gpsShots.forEach(shot => {
      const h = shot.holeNumber;
      if (!map[h]) map[h] = [];
      map[h].push(shot);
    });
    return map;
  }, [gpsShots]);

  // Course hole data (with POIs) from courseData prop or auto-loaded
  const courseHolesByNumber = useMemo(() => {
    if (!courseData?.holes) return {};
    const map = {};
    courseData.holes.forEach(h => {
      const num = h.hole ?? h.number;
      if (num) map[num] = h;
    });
    return map;
  }, [courseData]);

  // Summary stats
  const totalScore = round?.score || 0;
  const totalPar = holes.reduce((sum, h) => sum + (h.par || 0), 0);
  const scoreDiff = totalScore - totalPar;
  const totalPutts = roundHoles.reduce((sum, h) => sum + (h.putts || 0), 0);
  const firCount = roundHoles.filter(h => h.fairwayHit === true).length;
  const firEligible = roundHoles.filter(h => h.par >= 4).length;
  const girCount = roundHoles.filter(h => h.greenHit === true).length;
  const duration = round?.roundDurationMinutes;

  const dateStr = round?.date
    ? new Date(round.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <SafeAreaView style={s.container} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={onBack} style={s.backBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.text.primary} />
        </TouchableOpacity>
        <View style={s.headerCenter}>
          <Text style={s.headerTitle} numberOfLines={1}>{round?.courseName || 'Round Review'}</Text>
          <Text style={s.headerSub}>{dateStr}{round?.teeName ? ` · ${round.teeName}` : ''}</Text>
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
        {/* Score summary */}
        <View style={s.summaryCard}>
          <View style={s.scoreBig}>
            <Text style={s.scoreBigNum}>{totalScore}</Text>
            <Text style={[s.scoreBigDiff, { color: scoreDiff <= 0 ? colors.brand.primary : scoreDiff <= 3 ? colors.score.bogey : colors.score.double }]}>
              {scoreDiff > 0 ? `+${scoreDiff}` : scoreDiff === 0 ? 'E' : scoreDiff}
            </Text>
          </View>
          <View style={s.summaryStats}>
            <View style={s.summaryStatItem}>
              <Text style={s.summaryStatVal}>{totalPutts}</Text>
              <Text style={s.summaryStatLabel}>Putts</Text>
            </View>
            <View style={s.summaryStatItem}>
              <Text style={s.summaryStatVal}>{firEligible ? `${Math.round((firCount / firEligible) * 100)}%` : '--'}</Text>
              <Text style={s.summaryStatLabel}>FIR</Text>
            </View>
            <View style={s.summaryStatItem}>
              <Text style={s.summaryStatVal}>{holes.length ? `${Math.round((girCount / holes.length) * 100)}%` : '--'}</Text>
              <Text style={s.summaryStatLabel}>GIR</Text>
            </View>
            {duration ? (
              <View style={s.summaryStatItem}>
                <Text style={s.summaryStatVal}>{Math.floor(duration / 60)}:{String(duration % 60).padStart(2, '0')}</Text>
                <Text style={s.summaryStatLabel}>Time</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Compact scorecard strip */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.scorecardStrip} contentContainerStyle={s.scorecardContent}>
          {holes.map((hole, i) => {
            const rh = roundHoles.find(r => r.number === hole.number);
            const hScore = rh?.score;
            const hPar = hole.par;
            const hc = hScore != null ? scoreColor(hScore, hPar) : colors.text.tertiary;
            return (
              <View key={hole.number} style={s.scorecardCell}>
                <Text style={s.scorecardHoleNum}>{hole.number}</Text>
                <Text style={[s.scorecardScore, { color: hc }]}>{hScore ?? '-'}</Text>
                <Text style={s.scorecardPar}>{hPar}</Text>
              </View>
            );
          })}
        </ScrollView>

        {/* Hole-by-hole maps */}
        {holes.map((hole) => {
          const rh = roundHoles.find(r => r.number === hole.number);
          const holeShots = shotsByHole[hole.number] || [];
          const holeSummary = gpsSummaries.find(gs => gs.holeNumber === hole.number);
          const courseHole = courseHolesByNumber[hole.number];

          return (
            <HoleMapCard
              key={hole.number}
              holeNumber={hole.number}
              par={hole.par}
              yardage={hole.yardage}
              score={rh?.score}
              putts={rh?.putts ?? holeSummary?.putts}
              shots={holeShots}
              holeSummary={holeSummary}
              courseHole={courseHole}
            />
          );
        })}

        {/* GPS shot summary footer */}
        {gpsShots.length > 0 && (
          <View style={s.footerCard}>
            <Ionicons name="navigate" size={14} color={colors.brand.primary} />
            <Text style={s.footerText}>
              {gpsShots.length} shots tracked across {Object.keys(shotsByHole).length} holes
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.subtle,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg.secondary,
  },
  headerCenter: {
    flex: 1,
    marginLeft: 10,
  },
  headerTitle: {
    color: colors.text.primary,
    fontSize: 15,
    fontWeight: '700',
  },
  headerSub: {
    color: colors.text.secondary,
    fontSize: 11,
    marginTop: 1,
  },
  scroll: {
    flex: 1,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: spacing.md,
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    padding: spacing.lg,
  },
  scoreBig: {
    alignItems: 'center',
    marginRight: spacing.xl,
  },
  scoreBigNum: {
    color: colors.text.primary,
    fontSize: 44,
    fontWeight: '800',
    lineHeight: 48,
  },
  scoreBigDiff: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 2,
  },
  summaryStats: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  summaryStatItem: {
    alignItems: 'center',
  },
  summaryStatVal: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  summaryStatLabel: {
    color: colors.text.tertiary,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  scorecardStrip: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  scorecardContent: {
    gap: 2,
  },
  scorecardCell: {
    width: 36,
    alignItems: 'center',
    paddingVertical: 4,
    backgroundColor: colors.bg.secondary,
    borderRadius: 6,
  },
  scorecardHoleNum: {
    color: colors.text.tertiary,
    fontSize: 9,
    fontWeight: '600',
  },
  scorecardScore: {
    fontSize: 16,
    fontWeight: '800',
    marginVertical: 1,
  },
  scorecardPar: {
    color: colors.text.tertiary,
    fontSize: 9,
  },
  holeCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: 'hidden',
  },
  holeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  holeNumWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bg.elevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  holeNum: {
    fontSize: 16,
    fontWeight: '800',
  },
  holeInfoCol: {
    flex: 1,
  },
  holePar: {
    color: colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  holeScoreName: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 1,
  },
  holeStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scoreBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  scoreBoxText: {
    fontSize: 18,
    fontWeight: '800',
  },
  statChip: {
    alignItems: 'center',
  },
  statChipLabel: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  statChipSub: {
    color: colors.text.tertiary,
    fontSize: 9,
  },
  mapContainer: {
    height: MAP_HEIGHT,
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  shotCountOverlay: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  shotCountText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '600',
  },
  noMapPlaceholder: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg.elevated,
    gap: 6,
  },
  noMapText: {
    color: colors.text.tertiary,
    fontSize: 12,
  },
  shotMarker: {
    alignItems: 'center',
  },
  shotDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.4)',
    marginBottom: 2,
  },
  shotLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(5,10,8,0.88)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 4,
  },
  shotClub: {
    color: colors.brand.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  shotYards: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '600',
  },
  shotChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border.subtle,
  },
  shotChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg.elevated,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  shotChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  shotChipClub: {
    color: colors.text.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  shotChipYards: {
    color: colors.text.secondary,
    fontSize: 10,
  },
  shotChipLie: {
    color: colors.text.tertiary,
    fontSize: 9,
  },
  footerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: spacing.md,
    paddingVertical: 12,
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.brand.primaryBorder,
    marginBottom: spacing.md,
  },
  footerText: {
    color: colors.brand.primary,
    fontSize: 12,
    fontWeight: '600',
  },
});

export default GpsRoundReviewScreen;
