import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/tokens';

interface ScoringDistributionProps {
  eagles: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubles: number;
  scorecardColorsEnabled?: boolean;
}

const ScoreBox: React.FC<{ label: string; count: number; color: string }> = ({ label, count, color }) => (
  <View style={styles.scoreBox}>
    <View style={[styles.scoreBoxInner, { backgroundColor: color + '20', borderColor: color + '40' }]}>
      <Text style={styles.scoreBoxCount}>{count}</Text>
    </View>
    <Text style={styles.scoreBoxLabel}>{label}</Text>
  </View>
);

export const ScoringDistribution: React.FC<ScoringDistributionProps> = ({
  eagles,
  birdies,
  pars,
  bogeys,
  doubles,
  scorecardColorsEnabled = true,
}) => {
  const scoreColors = scorecardColorsEnabled
    ? {
        eagle: '#EF4444',
        birdie: '#EF4444',
        par: colors.text.primary,
        bogey: '#2563EB',
        double: '#6B7280',
      }
    : {
        eagle: '#374151',
        birdie: '#374151',
        par: '#374151',
        bogey: '#374151',
        double: '#374151',
      };

  return (
    <View style={styles.distributionSection}>
      <View style={styles.sectionHeader}>
        <Ionicons name="bar-chart" size={18} color={colors.brand.primary} />
        <Text style={styles.sectionTitle}>Scoring Distribution</Text>
      </View>
      <View style={styles.distributionGrid}>
        <ScoreBox label="Eagles" count={eagles} color={scoreColors.eagle} />
        <ScoreBox label="Birdies" count={birdies} color={scoreColors.birdie} />
        <ScoreBox label="Pars" count={pars} color={scoreColors.par} />
        <ScoreBox label="Bogeys" count={bogeys} color={scoreColors.bogey} />
        <ScoreBox label="Doubles+" count={doubles} color={scoreColors.double} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  distributionSection: {
    backgroundColor: colors.bg.secondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.bg.elevated,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  distributionGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scoreBox: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  scoreBoxInner: {
    width: '100%',
    height: 56,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    marginBottom: 6,
  },
  scoreBoxCount: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text.primary,
  },
  scoreBoxLabel: {
    fontSize: 11,
    color: colors.text.tertiary,
  },
});
