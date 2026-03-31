import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HoleSelectorBar } from './HoleSelectorBar';
import { haversineYards } from '../../services/haversine';
import { colors, radius, spacing } from '../../theme/tokens';
import { rs } from '../../utils/responsive';
import { GPS_CHROME, GPS_Z } from '../../constants/gpsLayout';
import { unitSuffix, yardsToDisplay } from '../../utils/units';

export function GpsGlassChrome({
  courseName,
  cachedLabel,
  selectedTeeName,
  selectedTeeYardage,
  routeLabel,
  hole,
  currentHoleIndex,
  holes = [],
  holeNumbers = null,
  loggedHoles = [],
  onSelectHole,
  onBack,
  onGpsPress,
  gpsLabel = 'GPS',
  gpsIcon = 'navigate',
  onCardPress,
  onFinishRound,
  weatherText = '',
  weatherIcon = null,
  showOffCourse = true,
  yardages = { front: '--', center: '--', back: '--' },
  playingDistance = null,
  tournamentMode = false,
  topInset = 0,
  holeScores = {},
  isOffCourse = false,
  teeYardage = null,
  teeBack = null,
  greenFront = null,
  greenBack = null,
  lastShotFrom = null,
  currentHoleShotCount = 0,
  distanceUnit = 'yards',
}) {
  const [chromeBottom, setChromeBottom] = useState(0);

  if (!hole) return null;

  const selectorSource = Array.isArray(holes) && holes.length > 0
    ? holes
    : Array.isArray(holeNumbers) && holeNumbers.length > 0
      ? holeNumbers.map((holeNumber) => ({
          hole: Number(holeNumber),
          number: Number(holeNumber),
        }))
      : [];

  const currentSelectorIndex = Math.max(0, Number.isFinite(currentHoleIndex) ? currentHoleIndex : 0);
  const selectorHoleNumbers = selectorSource.length > 0
    ? selectorSource.map((entry, index) => Number(entry?.hole ?? entry?.number ?? index + 1))
    : undefined;
  const selectorLoggedHoles = selectorHoleNumbers && selectorHoleNumbers.length > 0
    ? (loggedHoles || [])
        .map((holeIndex) => Number(holeIndex))
        .filter((holeIndex) => Number.isFinite(holeIndex))
        .filter((holeIndex) => holeIndex >= 0 && holeIndex < selectorSource.length)
        .map((holeIndex) => {
          const pageEntry = selectorSource[holeIndex];
          return Number(pageEntry?.hole ?? pageEntry?.number ?? holeIndex + 1);
        })
    : loggedHoles;
  const selectorSelectedHole = currentSelectorIndex + 1;
  const handleSelectHolePage = (position1Based) => {
    if (!onSelectHole) return;
    onSelectHole(position1Based - 1);
  };
  const selectorHoleScores = selectorHoleNumbers && selectorHoleNumbers.length > 0
    ? selectorHoleNumbers.reduce((acc, holeNumber, pageIndex) => {
        const scoreEntry = holeScores[holeNumber] || holeScores[pageIndex];
        if (scoreEntry) acc[holeNumber] = scoreEntry;
        return acc;
      }, {})
    : holeScores;

  const playingValue = tournamentMode ? yardages.center : playingDistance?.adjustedYards ?? yardages.center;
  const playingGpsYards = Number.isFinite(selectedTeeYardage) ? selectedTeeYardage : yardages.center;
  const windAdj = playingDistance?.windAdj;
  const tempAdj = playingDistance?.tempAdj;
  const elevAdj = playingDistance?.elevAdj;
  const formatWte = (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${Math.round(v)}` : '—');
  const suffix = unitSuffix(distanceUnit);
  const playingDetailText = `GPS ${Number.isFinite(playingGpsYards) ? yardsToDisplay(playingGpsYards, distanceUnit) : '--'} ${suffix === 'y' ? 'yds' : 'm'}`;
  const distanceFromLabel = lastShotFrom
    ? `From shot ${Math.max(1, Number(currentHoleShotCount) || 1)}`
    : isOffCourse
      ? 'From tee'
      : 'From your position';

  const teeBase = Number.isFinite(teeYardage) ? Math.round(teeYardage) : null;
  const displayFront = isOffCourse && teeBack && greenFront
    ? Math.round(haversineYards(teeBack.Latitude, teeBack.Longitude, greenFront.Latitude, greenFront.Longitude))
    : (Number.isFinite(yardages.front) ? Math.round(yardages.front) : '--');
  const displayCenter = isOffCourse
    ? (teeBase || (Number.isFinite(yardages.center) ? Math.round(yardages.center) : '--'))
    : (Number.isFinite(yardages.center) ? Math.round(yardages.center) : '--');
  const displayBack = isOffCourse && teeBack && greenBack
    ? Math.round(haversineYards(teeBack.Latitude, teeBack.Longitude, greenBack.Latitude, greenBack.Longitude))
    : (Number.isFinite(yardages.back) ? Math.round(yardages.back) : '--');
  const displayPlaying = Number.isFinite(playingValue) ? Math.round(playingValue) : '--';
  const selectorHoleContext = `H${hole.hole} · P${hole.par} · ${selectedTeeYardage ? `${yardsToDisplay(selectedTeeYardage, distanceUnit)}${suffix}` : '--'} · HCP ${hole.handicap ?? '-'}`;

  return (
    <View style={styles.chrome} pointerEvents="box-none">
      <View style={[styles.headerBar, { marginTop: topInset + 4, paddingTop: 4 }]}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.78}>
            <Ionicons name="arrow-back" size={20} color="#E5E7EB" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text
              style={styles.courseName}
              numberOfLines={2}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {courseName || 'GPS Round'}
            </Text>
            <Text style={styles.subMeta} numberOfLines={2}>
              {cachedLabel} • {selectedTeeName || '--'}{routeLabel ? ` • ${routeLabel}` : ''} • {selectedTeeYardage ? `${yardsToDisplay(selectedTeeYardage, distanceUnit)}${suffix}` : '--'}
            </Text>
            <Text style={styles.selectorHoleContextTop} numberOfLines={1}>{selectorHoleContext}</Text>
          </View>
          {(onCardPress || onGpsPress || onFinishRound || showOffCourse) ? (
            <View style={styles.actionStack}>
              <View style={styles.actionRow}>
                {onGpsPress ? (
                  <TouchableOpacity style={[styles.modePill, gpsLabel === 'GPS' && styles.modePillActive]} onPress={onGpsPress} activeOpacity={0.8}>
                    <Ionicons name={gpsIcon} size={11} color="#FFFFFF" />
                    <Text style={styles.modeText}>{gpsLabel}</Text>
                  </TouchableOpacity>
                ) : null}
                {showOffCourse ? (
                  <View style={styles.offCourseBadge}>
                    <Text style={styles.offCourseText}>Off Course</Text>
                  </View>
                ) : null}
                {onCardPress ? (
                  <TouchableOpacity style={styles.modePill} onPress={onCardPress} activeOpacity={0.8}>
                    <Ionicons name="grid-outline" size={11} color="rgba(255,255,255,0.65)" />
                    <Text style={styles.modeTextMuted}>Card</Text>
                  </TouchableOpacity>
                ) : null}
                {onFinishRound ? (
                  <TouchableOpacity style={styles.finishPill} onPress={onFinishRound} activeOpacity={0.8}>
                    <Text style={styles.finishText}>End</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      </View>

      <View
        style={styles.selectorRow}
        onLayout={(e) => setChromeBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
      >
        <View style={styles.selectorRowInner}>
          <HoleSelectorBar
            totalHoles={selectorSource.length || 18}
            holeNumbers={selectorHoleNumbers}
            selectedHole={selectorSelectedHole}
            onSelect={handleSelectHolePage}
            holesWithData={selectorLoggedHoles}
            holeScores={selectorHoleScores}
            style={styles.selector}
            contentContainerStyle={styles.selectorContent}
          />
        </View>
      </View>

      {weatherText ? (
        <View style={[styles.weatherWrap, { marginTop: GPS_CHROME.WEATHER_BELOW_HEADER_GAP }]}>
          <View style={styles.weatherPill}>
            {weatherIcon ? weatherIcon : <Ionicons name="navigate" size={12} color="#fff" />}
            <Text style={styles.weatherText}>{weatherText}</Text>
          </View>
        </View>
      ) : null}

      <View style={[styles.rightColumn, { top: Math.max(chromeBottom, topInset + GPS_CHROME.HEADER_FALLBACK_HEIGHT) + GPS_CHROME.RIGHT_COLUMN_BELOW_CHROME_GAP }]}>
        <View style={styles.yardageCard}>
          <Text style={styles.playingLabel}>PLAYING</Text>
          <Text style={styles.playingValue}>{displayPlaying}</Text>
          <Text style={styles.playingSub}>{distanceFromLabel}</Text>
          {!lastShotFrom ? <Text style={styles.playingSub}>{playingDetailText}</Text> : null}
          {!tournamentMode ? (
            <Text style={styles.playingAdjust}>
              W {formatWte(windAdj)} • T {formatWte(tempAdj)} • E {formatWte(elevAdj)}
            </Text>
          ) : null}
          <View style={styles.fcbRow}>
            <View style={styles.fcbCell}>
              <Text style={styles.fcbLabel} numberOfLines={1}>FRT</Text>
              <Text style={styles.fcbValue}>{displayFront}</Text>
            </View>
            <View style={styles.fcbDivider} />
            <View style={styles.fcbCell}>
              <Text style={[styles.fcbLabel, styles.fcbLabelCenter]} numberOfLines={1}>CTR</Text>
              <Text style={[styles.fcbValue, styles.fcbValueCenter]}>{displayCenter}</Text>
            </View>
            <View style={styles.fcbDivider} />
            <View style={styles.fcbCell}>
              <Text style={styles.fcbLabel} numberOfLines={1}>BCK</Text>
              <Text style={styles.fcbValue}>{displayBack}</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    zIndex: GPS_Z.TOP_CHROME,
  },
  headerBar: {
    flexDirection: 'column',
    marginHorizontal: 10,
    backgroundColor: 'rgba(6,6,6,0.86)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 10,
    paddingBottom: 6,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionStack: {
    alignItems: 'flex-end',
    gap: 4,
    minWidth: 0,
    marginTop: 0,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  headerCenter: {
    flex: 1,
    minWidth: 0,
    paddingTop: 0,
  },
  courseName: {
    color: '#FFFFFF',
    fontSize: rs(14),
    fontWeight: '600',
    lineHeight: rs(16),
  },
  subMeta: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: rs(9),
    marginTop: 0,
    lineHeight: rs(10),
  },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  modePillActive: {
    backgroundColor: 'rgba(26,200,85,0.18)',
    borderColor: 'rgba(26,200,85,0.5)',
  },
  modeText: {
    color: '#FFFFFF',
    fontSize: rs(11),
    fontWeight: '700',
  },
  modeTextMuted: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: rs(11),
    fontWeight: '700',
  },
  finishPill: {
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  finishText: {
    color: '#FFFFFF',
    fontSize: rs(11),
    fontWeight: '700',
  },
  offCourseBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,180,0,0.5)',
    backgroundColor: 'rgba(255,180,0,0.2)',
  },
  offCourseText: {
    color: '#FFB400',
    fontSize: rs(10),
    fontWeight: '600',
  },
  selectorRow: {
    marginTop: 0,
    marginHorizontal: 10,
    backgroundColor: 'rgba(6,6,6,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  selector: {
    backgroundColor: 'transparent',
    flex: 1,
  },
  selectorContent: {
    paddingHorizontal: spacing.sm,
  },
  selectorRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 8,
    paddingRight: 6,
    paddingVertical: 4,
  },
  selectorHoleContextTop: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: rs(10),
    fontWeight: '600',
    flexShrink: 0,
    marginTop: 1,
  },
  weatherWrap: {
    alignItems: 'flex-start',
    paddingLeft: 10,
  },
  weatherPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  weatherText: {
    color: '#F3F4F6',
    fontSize: rs(10),
    fontWeight: '700',
  },
  rightColumn: {
    position: 'absolute',
    right: GPS_CHROME.RIGHT_COLUMN_EDGE,
    zIndex: GPS_Z.CHROME_COLUMN,
  },
  yardageCard: {
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    paddingVertical: 9,
    paddingHorizontal: 10,
    alignItems: 'center',
  },
  playingLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: rs(7),
    fontWeight: '700',
    letterSpacing: 0.9,
    textAlign: 'center',
    width: '100%',
  },
  playingValue: {
    color: '#1ac855',
    fontSize: rs(32),
    fontWeight: '800',
    lineHeight: rs(34),
    marginTop: 1,
    letterSpacing: -1.5,
    textAlign: 'center',
    width: '100%',
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  playingSub: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: rs(9),
    fontWeight: '500',
    lineHeight: rs(10),
    textAlign: 'center',
    width: '100%',
  },
  playingAdjust: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: rs(7),
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 2,
    textAlign: 'center',
    width: '100%',
  },
  fcbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
    paddingTop: 5,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.1)',
    gap: 2,
  },
  fcbCell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  fcbDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  fcbLabel: {
    color: 'rgba(255,255,255,0.38)',
    fontSize: rs(7),
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  fcbLabelCenter: {
    color: 'rgba(26,200,85,0.6)',
  },
  fcbValue: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: rs(12),
    fontWeight: '700',
    lineHeight: rs(13),
    marginTop: 1,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    textAlign: 'center',
    letterSpacing: -0.1,
  },
  fcbValueCenter: {
    color: '#1ac855',
  },
});

export default GpsGlassChrome;
