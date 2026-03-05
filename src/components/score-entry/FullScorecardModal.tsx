import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCourseName } from '../../utils/courseName';
import { formatYardage, getYardageUnitLabel, type DistanceUnit } from '../../utils/distance';
import { getPuttColor, getScoreColor } from '../../utils/scoreColors';

interface FullScorecardModalProps {
  visible: boolean;
  courseName?: string | null;
  teeName?: string | null;
  distanceUnit: DistanceUnit;
  holes: Array<{
    hole: number;
    par: number;
    yardage: number;
    handicap: number;
    score: number | null;
    putts: number | null;
    fir: string | null;
    gir: string | null;
  }>;
  onClose: () => void;
  scorecardColorsEnabled?: boolean;
  styles: any;
  generateScorecardHTML: () => string;
  copyScorecardHTML: () => void;
}

export const FullScorecardModal: React.FC<FullScorecardModalProps> = ({
  visible,
  courseName,
  teeName,
  distanceUnit,
  holes,
  onClose,
  scorecardColorsEnabled = true,
  styles,
  generateScorecardHTML,
  copyScorecardHTML,
}) => {
  if (!visible) return null;
  const yardageUnitLabel = getYardageUnitLabel(distanceUnit);

  const renderScoreBadge = (score: number | null, par: number) => {
    if (score === null || score === undefined) {
      return <Text style={styles.fullScorecardScoreMuted}>—</Text>;
    }
    const diff = score - par;
    if (diff === 0) {
      return <Text style={[styles.fullScorecardScorePar, { color: getScoreColor(score, par, scorecardColorsEnabled) }]}>{score}</Text>;
    }
    if (!scorecardColorsEnabled) {
      return <Text style={[styles.fullScorecardScorePar, { color: '#FFFFFF' }]}>{score}</Text>;
    }
    const isCircle = diff <= -1;
    const isDouble = diff <= -2 || diff >= 2;
    const borderColor = diff <= -1 ? '#EF4444' : diff === 1 ? '#2563EB' : '#6B7280';
    return (
      <View style={[
        styles.fullScorecardScoreOuter,
        isCircle ? styles.fullScorecardScoreCircle : styles.fullScorecardScoreSquare,
        { borderColor }
      ]}>
        {isDouble && (
          <View style={[
            styles.fullScorecardScoreInner,
            isCircle ? styles.fullScorecardScoreCircle : styles.fullScorecardScoreSquare,
            { borderColor }
          ]} />
        )}
        <Text style={[styles.fullScorecardScoreText, { color: borderColor }]}>{score}</Text>
      </View>
    );
  };

  const formatFir = (value: string | null, par: number) => {
    if (par === 3) return '—';
    if (value === 'hit') return '✓';
    if (value === 'miss') return '×';
    if (value === 'left') return '←';
    if (value === 'right') return '→';
    if (value === 'short') return '↓';
    if (value === 'long') return '↑';
    return '-';
  };

  const formatGir = (value: string | null) => {
    if (value === 'hit') return '✓';
    if (value === 'miss') return '×';
    if (value === 'left') return '←';
    if (value === 'right') return '→';
    if (value === 'short') return '↓';
    if (value === 'long') return '↑';
    return '-';
  };

  return (
    <View style={styles.fullScorecardModalOverlay}>
      <View style={styles.fullScorecardModal}>
        <View style={styles.fullScorecardHeader}>
          <Text style={styles.fullScorecardTitle}>Full Scorecard</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.fullScorecardContent}>
          <Text style={styles.fullScorecardCourseName}>{formatCourseName(courseName)}</Text>
          <Text style={styles.fullScorecardTeeInfo}>{teeName} Tees</Text>
          <View style={styles.fullScorecardTable}>
            <View style={styles.fullScorecardHeaderRow}>
              <Text style={styles.fullScorecardHeaderCell}>Hole</Text>
              <Text style={styles.fullScorecardHeaderCell}>Par</Text>
              <Text style={styles.fullScorecardHeaderCell}>{yardageUnitLabel}</Text>
              <Text style={styles.fullScorecardHeaderCell}>HCP</Text>
              <Text style={styles.fullScorecardHeaderCell}>Score</Text>
              <Text style={styles.fullScorecardHeaderCell}>Putts</Text>
              <Text style={styles.fullScorecardHeaderCell}>FIR</Text>
              <Text style={styles.fullScorecardHeaderCell}>GIR</Text>
            </View>
            {holes.map(h => (
              <View key={h.hole} style={styles.fullScorecardRow}>
                <Text style={styles.fullScorecardCell}>{h.hole}</Text>
                <Text style={styles.fullScorecardCell}>{h.par}</Text>
                <Text style={styles.fullScorecardCell}>{formatYardage(h.yardage, distanceUnit)}</Text>
                <Text style={styles.fullScorecardCell}>{h.handicap}</Text>
                <View style={styles.fullScorecardCell}>
                  {renderScoreBadge(h.score, h.par)}
                </View>
                <Text
                  style={[
                    styles.fullScorecardCell,
                    h.putts != null ? { color: getPuttColor(h.putts, h.gir === 'hit', scorecardColorsEnabled) } : null,
                  ]}
                >
                  {h.putts ?? '-'}
                </Text>
                <Text style={styles.fullScorecardCell}>{formatFir(h.fir, h.par)}</Text>
                <Text style={styles.fullScorecardCell}>{formatGir(h.gir)}</Text>
              </View>
            ))}
          </View>
          {__DEV__ && (
            <View style={styles.fullScorecardActions}>
              <TouchableOpacity style={styles.fullScorecardActionButton} onPress={copyScorecardHTML}>
                <Ionicons name="copy-outline" size={18} color="#10B981" />
                <Text style={styles.fullScorecardActionText}>Copy HTML</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.fullScorecardActionButton} onPress={generateScorecardHTML}>
                <Ionicons name="code-slash-outline" size={18} color="#10B981" />
                <Text style={styles.fullScorecardActionText}>Generate HTML</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
};
