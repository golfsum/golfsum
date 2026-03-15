import React, { useEffect, useRef } from 'react';
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, radius } from '../../theme/tokens';

const CHIP_WIDTH = 60;   // width of each club chip
const CHIP_GAP = 8;      // gap between chips
const CHIP_STRIDE = CHIP_WIDTH + CHIP_GAP;

/**
 * Horizontal scrollable club row for the Add Shot panel.
 *
 * Props:
 *   activeBag      BagItem[]   Ordered, enabled-only clubs from user profile
 *   selectedClub   string|null Currently selected club key
 *   bestClub       string|null Distance-suggested best club (gets BEST badge)
 *   onSelectClub   (club: string) => void
 */
export function ClubScrollRow({ activeBag = [], selectedClub, bestClub, onSelectClub }) {
  const scrollRef = useRef(null);
  const screenWidth = Dimensions.get('window').width;

  // Scroll the pre-selected club to centre on mount.
  useEffect(() => {
    if (!scrollRef.current || !activeBag.length) return;
    const target = selectedClub || bestClub;
    const idx = activeBag.findIndex((c) => c.club === target);
    if (idx < 0) return;
    const offset = Math.max(0, idx * CHIP_STRIDE - screenWidth / 2 + CHIP_WIDTH / 2);
    // Small delay so the ScrollView has laid out before scrolling.
    setTimeout(() => scrollRef.current?.scrollTo({ x: offset, animated: false }), 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount — deliberate

  if (!activeBag.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No clubs in bag. Set up your bag in Profile › My Golf Bag.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
      keyboardShouldPersistTaps="handled"
    >
      {activeBag.map((item) => {
        const isSelected = selectedClub === item.club || (!selectedClub && bestClub === item.club);
        const isBest = item.club === bestClub;
        return (
          <TouchableOpacity
            key={item.club}
            style={[
              styles.chip,
              isSelected && styles.chipSelected,
              isSelected && { borderColor: item.color },
            ]}
            onPress={() => onSelectClub(item.club)}
            activeOpacity={0.75}
          >
            {isBest && <Text style={[styles.bestLabel, { color: item.color }]}>BEST</Text>}
            <View style={[styles.colorDot, { backgroundColor: item.color }]} />
            <Text style={[styles.clubName, isSelected && styles.clubNameSelected]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  rail: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: CHIP_GAP,
  },
  chip: {
    width: CHIP_WIDTH,
    height: 68,
    borderRadius: radius.md,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  chipSelected: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1.5,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  clubName: {
    color: colors.text.secondary,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  clubNameSelected: {
    color: colors.text.primary,
  },
  bestLabel: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.8,
    position: 'absolute',
    top: 5,
  },
  empty: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  emptyText: {
    color: colors.text.secondary,
    fontSize: 12,
    textAlign: 'center',
  },
});
