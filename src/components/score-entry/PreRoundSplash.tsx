import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCourseName } from '../../utils/courseName';
import { formatYardage, getYardageUnitLabel, type DistanceUnit } from '../../utils/distance';
import { ScorePrediction } from '../../services/scorePredictionService';

interface PreRoundSplashProps {
  visible: boolean;
  courseName: string;
  teeName: string;
  totalPar: number;
  totalYards: number | null;
  distanceUnit: DistanceUnit;
  tip?: string | null;
  caddieNote?: string | null;
  caddieNoteLabel?: string | null;
  weatherSummary?: string | null;
  weatherContext?: string | null;
  prediction?: ScorePrediction | null;
  windLevel?: string | null;
  windDirection?: 'into' | 'helping' | 'cross-l' | 'cross-r' | 'swirling' | 'calm';
  onSelectWindDirection?: (direction: 'into' | 'helping' | 'cross-l' | 'cross-r' | 'swirling' | 'calm') => void;
  onStart: () => void;
  styles: Record<string, any>;
}

export const PreRoundSplash: React.FC<PreRoundSplashProps> = ({
  visible,
  courseName,
  teeName,
  totalPar,
  totalYards,
  distanceUnit,
  tip,
  caddieNote,
  caddieNoteLabel,
  weatherSummary,
  weatherContext,
  prediction,
  windLevel,
  windDirection,
  onSelectWindDirection,
  onStart,
  styles,
}) => {
  if (!visible) return null;
  const yardageUnitLabel = getYardageUnitLabel(distanceUnit);
  const totalYardageLabel = totalYards
    ? ` · ${formatYardage(totalYards, distanceUnit).toLocaleString()} ${yardageUnitLabel}`
    : '';

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.preRoundOverlay}>
        <View style={styles.preRoundCard}>
          <Text style={styles.preRoundCourse}>{formatCourseName(courseName)}</Text>
          <Text style={styles.preRoundMeta}>
            {teeName} Tees · Par {totalPar}{totalYardageLabel}
          </Text>

          {tip && (
            <View style={styles.preRoundSection}>
              <View style={styles.preRoundSectionHeader}>
                <Ionicons name="bulb" size={16} color="#10B981" />
                <Text style={styles.preRoundSectionTitle}>Pre-Round Tip</Text>
              </View>
              <Text style={styles.preRoundSectionText}>{tip}</Text>
            </View>
          )}

          {caddieNote && (
            <View style={styles.preRoundSection}>
              <View style={styles.preRoundSectionHeader}>
                <Ionicons name="golf-outline" size={16} color="#FBBF24" />
                <Text style={styles.preRoundSectionTitle}>{caddieNoteLabel || 'Caddie Note'}</Text>
              </View>
              <Text style={styles.preRoundSectionText}>{caddieNote}</Text>
            </View>
          )}

          {(weatherSummary || weatherContext) && (
            <View style={styles.preRoundSection}>
              <View style={styles.preRoundSectionHeader}>
                <Ionicons name="cloud-outline" size={16} color="#60A5FA" />
                <Text style={styles.preRoundSectionTitle}>Weather Context</Text>
              </View>
              {weatherSummary && <Text style={styles.preRoundSectionText}>{weatherSummary}</Text>}
              {weatherContext && <Text style={styles.preRoundSectionSubtext}>{weatherContext}</Text>}
              {onSelectWindDirection && windLevel && (windLevel === 'Moderate' || windLevel === 'Strong' || windLevel === 'Very Strong') && (
                <View style={styles.windDirRow}>
                  {[
                    { key: 'into', label: 'Into' },
                    { key: 'helping', label: 'Helping' },
                    { key: 'cross-l', label: 'Cross-L' },
                    { key: 'cross-r', label: 'Cross-R' },
                    { key: 'swirling', label: 'Swirling' },
                  ].map(opt => {
                    const active = windDirection === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[styles.windDirChip, active && styles.windDirChipActive]}
                        onPress={() => onSelectWindDirection(opt.key as 'into' | 'helping' | 'cross-l' | 'cross-r' | 'swirling' | 'calm')}
                      >
                        <Text style={[styles.windDirChipText, active && styles.windDirChipTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          )}

          {prediction && (
            <View style={styles.predictionBlock}>
              <Text style={styles.predictionLabel}>Today's Prediction</Text>
              <View style={styles.predictionRangeRow}>
                <Text style={styles.predictionRange}>
                  {prediction.low === prediction.high
                    ? `${prediction.low}`
                    : `${prediction.low}-${prediction.high}`}
                </Text>
                <View
                  style={[
                    styles.predictionConfidenceBadge,
                    prediction.confidence === 'HIGH' && styles.confidenceHigh,
                    prediction.confidence === 'MEDIUM' && styles.confidenceMedium,
                    prediction.confidence === 'LOW' && styles.confidenceLow,
                  ]}
                >
                  <Text style={styles.predictionConfidenceText}>
                    {prediction.confidence === 'HIGH'
                      ? 'High confidence'
                      : prediction.confidence === 'MEDIUM'
                        ? 'Good estimate'
                        : 'Early estimate'}
                  </Text>
                </View>
              </View>
              {prediction.conditionsNote && (
                <Text style={styles.predictionCondNote}>{prediction.conditionsNote}</Text>
              )}
              <Text style={styles.predictionBasis}>{prediction.roundsUsed} rounds at this course</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.preRoundStartButton}
            onPress={onStart}
            accessibilityRole="button"
            accessibilityLabel="Start round"
          >
            <Text style={styles.preRoundStartText}>Start Round</Text>
            <Ionicons name="arrow-forward" size={16} color="#0f1419" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};
