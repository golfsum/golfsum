import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface TotalScoreFooterProps {
  score: number;
  toPar: string;
  roundPar: number;
}

export const TotalScoreFooter: React.FC<TotalScoreFooterProps> = ({
  score,
  toPar,
  roundPar,
}) => {
  const numericDiff = toPar === 'E' ? 0 : parseInt(toPar, 10);
  const diffColor = numericDiff < 0 ? styles.textGreen : numericDiff > 0 ? styles.textRed : styles.textGray;

  return (
    <View style={styles.totalFooter}>
      <View style={styles.totalLeft}>
        <Text style={styles.totalLabel}>Total Score</Text>
        <Text style={styles.totalValue}>{score}</Text>
      </View>
      <View style={styles.totalRight}>
        <Text style={[styles.totalDiff, diffColor]}>{toPar}</Text>
        <Text style={styles.totalVsPar}>vs Par {roundPar}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  totalFooter: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  totalLeft: {},
  totalLabel: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },
  totalValue: {
    fontSize: 42,
    fontWeight: '800',
    color: '#10B981',
  },
  totalRight: {
    alignItems: 'flex-end',
  },
  totalDiff: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 2,
  },
  totalVsPar: {
    fontSize: 12,
    color: '#6B7280',
  },
  textGreen: {
    color: '#10B981',
  },
  textRed: {
    color: '#E07575',
  },
  textGray: {
    color: '#9CA3AF',
  },
});
