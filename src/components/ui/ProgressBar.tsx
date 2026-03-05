import React from 'react';
import { StyleSheet, View } from 'react-native';
import { colors, radius } from '../../theme/tokens';

interface ProgressBarProps {
  current: number;
  total: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ current, total }) => {
  const progress = total > 0 ? Math.min(current / total, 1) : 0;
  const pct = Math.round(progress * 100);
  return (
    <View style={styles.track}>
      {pct > 0 && (
        <View style={[styles.fill, { width: `${pct}%` }]} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  track: {
    height: 8,
    backgroundColor: '#1F2937',
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.brand.primary,
    borderRadius: radius.full,
  },
});
