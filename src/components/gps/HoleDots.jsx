import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../../theme/tokens';
import { HoleSelectorBar } from './HoleSelectorBar';

export function HoleDots({ holes = [], currentHole, onSelect, loggedHoles = [], holeNumbers = null, holeScores = {} }) {
  const totalHoles = Array.isArray(holes) ? holes.length : 0;
  const firstHoleNumber = Number(holes?.[0]?.hole);
  const holeOffset = Number.isFinite(firstHoleNumber) ? Math.max(0, firstHoleNumber - 1) : 0;
  const selectedHole = Array.isArray(holeNumbers) && holeNumbers.length > 0
    ? (currentHole ?? 0) + 1
    : (currentHole ?? 0) + 1 + holeOffset;
  const holesWithData = Array.isArray(holeNumbers) && holeNumbers.length > 0
    ? (loggedHoles || []).map((index) => Number(holeNumbers[index])).filter(Number.isFinite)
    : (loggedHoles || []).map((index) => Number(index) + 1).filter(Number.isFinite);

  return (
    <View style={styles.wrap}>
      <HoleSelectorBar
        totalHoles={Math.max(1, totalHoles)}
        holeNumbers={holeNumbers || undefined}
        holeOffset={holeOffset}
        selectedHole={selectedHole}
        onSelect={(hole) => onSelect?.(Array.isArray(holeNumbers) && holeNumbers.length > 0 ? hole - 1 : hole - 1 - holeOffset)}
        holesWithData={holesWithData}
        holeScores={holeScores}
        contentContainerStyle={styles.row}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: 'transparent',
  },
  row: {
    paddingLeft: spacing.md,
    paddingRight: spacing.md - 2,
  },
});

export default HoleDots;
