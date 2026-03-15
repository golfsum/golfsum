import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

/**
 * LayupMarkerView
 * Renders the lay-up marker ring, centre dot, and two yardage badges.
 * Used inside a MapboxGL.PointAnnotation.
 *
 * Props:
 *   distFromTee   number  — yards from tee to this marker (badge above)
 *   distToNext    number  — yards from here to the next target (badge below)
 *   nextLabel     string  — label for the distance-below badge ('to pin', 'to M2', etc.)
 *   colour        'white'|'gold'
 *   type          'layup'|'go_for_it'  — go_for_it shows 'Reachable in 2' instead
 *   mode          'scoring'|'safe'
 *   approachClub  string|null  — club name for the approach (Scoring mode badge)
 *   girPct        number|null  — GIR percentage (future use; currently null)
 */
export function LayupMarkerView({
  distFromTee,
  distToNext,
  nextLabel = 'to pin',
  colour = 'white',
  type = 'layup',
  mode = 'scoring',
  approachClub = null,
}) {
  const ringColor = colour === 'gold' ? '#F6C90E' : '#FFFFFF';

  // Subtle pulse animation on the outer ring
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.35, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1.0, duration: 900, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulse]);

  return (
    <View style={styles.container}>
      {/* Badge above: distance to hit from tee/previous marker */}
      {Number.isFinite(distFromTee) && (
        <View style={styles.badgeAbove}>
          <Text style={styles.badgeText}>{distFromTee}y</Text>
        </View>
      )}

      {/* Pulsing ring + centre dot */}
      <View style={styles.markerWrap}>
        <Animated.View
          style={[
            styles.pulseRing,
            { borderColor: ringColor, transform: [{ scale: pulse }] },
          ]}
        />
        <View style={[styles.centreDot, { backgroundColor: ringColor }]} />
      </View>

      {/* Badge below: distance to the next target */}
      {type === 'go_for_it' ? (
        <View style={[styles.badgeBelow, styles.badgeGoForIt]}>
          <Text style={[styles.badgeText, styles.badgeGoForItText]}>Reachable in 2</Text>
        </View>
      ) : Number.isFinite(distToNext) ? (
        <View style={styles.badgeBelow}>
          <Text style={styles.badgeArrow}>→ </Text>
          <Text style={styles.badgeText}>
            {distToNext}y {nextLabel}
            {mode === 'scoring' && approachClub ? `  ${approachClub.toUpperCase()}` : ''}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  badgeAbove: {
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginBottom: 5,
  },
  badgeBelow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginTop: 5,
    alignItems: 'center',
  },
  badgeGoForIt: {
    borderLeftColor: '#F6C90E',
    backgroundColor: 'rgba(246,201,14,0.18)',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  badgeGoForItText: {
    color: '#F6C90E',
  },
  badgeArrow: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '700',
  },
  markerWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  centreDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});

export default LayupMarkerView;
