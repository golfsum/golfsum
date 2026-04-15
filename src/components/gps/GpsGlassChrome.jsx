import React, { useCallback, useRef, useState } from 'react';
import { Animated, LayoutAnimation, Platform, StyleSheet, Text, TouchableOpacity, UIManager, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HoleSelectorBar } from './HoleSelectorBar';
import { haversineYards } from '../../services/haversine';
import { colors, radius, spacing } from '../../theme/tokens';
import { rs } from '../../utils/responsive';
import { GPS_CHROME, GPS_Z } from '../../constants/gpsLayout';
import { unitSuffix, yardsToDisplay } from '../../utils/units';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

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
  onCardPress,
  weatherText = '',
  weatherIcon = null,
  yardages = { front: '--', center: '--', back: '--' },
  playingDistance = null,
  tournamentMode = false,
  topInset = 0,
  holeScores = {},
  isOffCourse = false,
  teeYardage = null,
  teeBack = null,
  greenFront = null,
  greenCenter = null,
  greenBack = null,
  lastShotFrom = null,
  currentHoleShotCount = 0,
  distanceUnit = 'yards',
}) {
  const [headerExpanded, setHeaderExpanded] = useState(false);
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
  const fullHoleNumbers = selectorSource.length > 0
    ? selectorSource.map((entry, index) => Number(entry?.hole ?? entry?.number ?? index + 1))
    : [];

  const currentHoleNumber = Number(
    hole?.hole ?? hole?.number ?? fullHoleNumbers[currentSelectorIndex] ?? currentSelectorIndex + 1,
  );

  let barHoleIndices = selectorSource.map((_, index) => index);
  if (selectorSource.length > 9) {
    const hasLowNine = fullHoleNumbers.some((n) => Number.isFinite(n) && n <= 9);
    const hasHighNine = fullHoleNumbers.some((n) => Number.isFinite(n) && n >= 10);
    if (hasLowNine && hasHighNine) {
      const onFrontNine = Number.isFinite(currentHoleNumber) && currentHoleNumber <= 9;
      barHoleIndices = selectorSource
        .map((_, index) => index)
        .filter((index) => {
          const n = fullHoleNumbers[index];
          if (!Number.isFinite(n)) return onFrontNine ? index < 9 : index >= 9;
          return onFrontNine ? n <= 9 : n >= 10;
        });
    }
  }

  const selectorHoleNumbers = barHoleIndices.length > 0
    ? barHoleIndices.map((index) => fullHoleNumbers[index])
    : undefined;

  const selectorLoggedHoles = selectorHoleNumbers && selectorHoleNumbers.length > 0
    ? (loggedHoles || [])
        .map((holeIndex) => Number(holeIndex))
        .filter((holeIndex) => Number.isFinite(holeIndex))
        .filter((holeIndex) => holeIndex >= 0 && holeIndex < selectorSource.length)
        .filter((holeIndex) => barHoleIndices.includes(holeIndex))
        .map((holeIndex) => {
          const pageEntry = selectorSource[holeIndex];
          return Number(pageEntry?.hole ?? pageEntry?.number ?? holeIndex + 1);
        })
    : loggedHoles;

  const posInBar = barHoleIndices.indexOf(currentSelectorIndex);
  const selectorSelectedHole = posInBar >= 0 ? posInBar + 1 : 1;
  const handleSelectHolePage = (position1Based) => {
    if (!onSelectHole) return;
    const globalIndex = barHoleIndices[position1Based - 1];
    if (!Number.isFinite(globalIndex)) return;
    onSelectHole(globalIndex);
  };
  const selectorHoleScores = selectorHoleNumbers && selectorHoleNumbers.length > 0
    ? selectorHoleNumbers.reduce((acc, holeNumber, pageIndex) => {
        const origIndex = barHoleIndices[pageIndex];
        const scoreEntry = holeScores[holeNumber] || holeScores[origIndex];
        if (scoreEntry) acc[holeNumber] = scoreEntry;
        return acc;
      }, {})
    : holeScores;

  const rawPlaying = tournamentMode ? yardages.center : playingDistance?.adjustedYards ?? yardages.center;
  const suffix = unitSuffix(distanceUnit);
  const teeBase = Number.isFinite(teeYardage) ? Math.round(teeYardage) : null;

  // When off-course: always show tee-to-green distances
  const offCourseRef = isOffCourse && teeBack ? { lat: teeBack.Latitude, lng: teeBack.Longitude } : null;
  const useOverride = Boolean(offCourseRef);

  const displayCenter = useOverride && greenCenter
    ? Math.round(haversineYards(offCourseRef.lat, offCourseRef.lng, greenCenter.Latitude, greenCenter.Longitude))
    : (Number.isFinite(yardages.center) ? Math.round(yardages.center) : '--');
  const displayFront = useOverride && greenFront
    ? Math.round(haversineYards(offCourseRef.lat, offCourseRef.lng, greenFront.Latitude, greenFront.Longitude))
    : (Number.isFinite(yardages.front) ? Math.round(yardages.front) : '--');
  const displayBack = useOverride && greenBack
    ? Math.round(haversineYards(offCourseRef.lat, offCourseRef.lng, greenBack.Latitude, greenBack.Longitude))
    : (Number.isFinite(yardages.back) ? Math.round(yardages.back) : '--');
  const scorecardYardageText = teeBase ? `Scorecard Yardage: ${yardsToDisplay(teeBase, distanceUnit)}${suffix}` : null;
  const distanceFromLabel = lastShotFrom
    ? `From shot ${Math.max(1, Number(currentHoleShotCount) || 1)}`
    : useOverride
      ? 'From tee box'
      : 'From your position';
  const playingValue = useOverride ? displayCenter : (Number.isFinite(rawPlaying) ? Math.round(rawPlaying) : '--');
  const displayPlaying = Number.isFinite(playingValue) ? Math.round(playingValue) : playingValue;
  const windAdj = playingDistance?.windAdj;
  const tempAdj = playingDistance?.tempAdj;
  const elevAdj = playingDistance?.elevAdj;
  const formatWte = (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${Math.round(v)}` : '—');

  const holeSubtitle = `Hole ${hole.hole} · Par ${hole.par} · ${selectedTeeYardage ? `${yardsToDisplay(selectedTeeYardage, distanceUnit)} ${suffix === 'y' ? 'yds' : 'm'}` : '--'}`;

  const toggleExpanded = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setHeaderExpanded((prev) => !prev);
  };

  return (
    <View style={styles.chrome} pointerEvents="box-none">
      <View
        style={[styles.headerBar, { marginTop: topInset + 4, paddingTop: 4 }]}
        onLayout={(e) => setChromeBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
      >
        <View style={styles.headerTopRow}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn} activeOpacity={0.78}>
            <Ionicons name="arrow-back" size={20} color="#E5E7EB" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerCenter} onPress={toggleExpanded} activeOpacity={0.7}>
            <Text
              style={styles.courseName}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {courseName || 'GPS Round'}
            </Text>
            <View style={styles.subtitleRow}>
              <Text style={styles.subtitle} numberOfLines={1}>{holeSubtitle}</Text>
              <Ionicons
                name={headerExpanded ? 'chevron-up' : 'chevron-down'}
                size={12}
                color="rgba(255,255,255,0.5)"
                style={styles.chevron}
              />
            </View>
          </TouchableOpacity>
          {onCardPress ? (
            <TouchableOpacity style={styles.cardBtn} onPress={onCardPress} activeOpacity={0.8}>
              <Ionicons name="grid-outline" size={13} color="rgba(255,255,255,0.65)" />
              <Text style={styles.cardBtnText}>Card</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {headerExpanded ? (
          <View style={styles.expandedContent}>
            <View style={styles.selectorRowInner}>
              <HoleSelectorBar
                totalHoles={barHoleIndices.length || selectorSource.length || 18}
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
        ) : null}
      </View>

      {weatherText ? (
        <View style={[styles.weatherWrap, { top: chromeBottom + 4 }]}>
          <View style={styles.weatherPill}>
            {weatherIcon ? weatherIcon : <Ionicons name="navigate" size={12} color="#fff" />}
            <Text style={styles.weatherText}>{weatherText}</Text>
          </View>
        </View>
      ) : null}

      <View style={[styles.rightColumn, { top: chromeBottom + 6 }]}>
        <View style={styles.yardageCard}>
          <Text style={styles.playingLabel}>PLAYING</Text>
          <Text style={styles.playingValue}>{displayPlaying}</Text>
          <Text style={styles.playingSub}>{distanceFromLabel}</Text>
          {scorecardYardageText ? <Text style={styles.playingSub}>{scorecardYardageText}</Text> : null}
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
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.68)',
    fontSize: rs(10),
    fontWeight: '600',
  },
  chevron: {
    marginTop: 1,
  },
  cardBtn: {
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
  cardBtnText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: rs(11),
    fontWeight: '700',
  },
  expandedContent: {
    marginTop: 6,
  },
  selectorRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 6,
    paddingRight: 4,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.md,
  },
  selector: {
    backgroundColor: 'transparent',
    flex: 1,
  },
  selectorContent: {
    paddingHorizontal: spacing.sm,
  },
  weatherWrap: {
    position: 'absolute',
    left: 10,
    zIndex: GPS_Z.TOP_CHROME,
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
  infoStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingHorizontal: 4,
    paddingVertical: 5,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  infoStripLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoStripText: {
    color: '#F3F4F6',
    fontSize: rs(10),
    fontWeight: '700',
  },
  infoStripPlaying: {
    color: '#1ac855',
    fontSize: rs(10),
    fontWeight: '800',
    letterSpacing: 0.3,
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
