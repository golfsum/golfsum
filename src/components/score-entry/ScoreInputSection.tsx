import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getPuttBackgroundColor,
  getPuttColor,
  getScoreBackgroundColor,
  getScoreColor,
} from '../../utils/scoreColors';

interface ScoreInputSectionProps {
  score: number | null;
  par: number;
  putts: number | null;
  greenHit?: boolean;
  penaltyStrokes?: number;
  showPutts: boolean;
  scorecardColorsEnabled?: boolean;
  onScoreChange: (delta: number) => void;
  onPuttsChange: (delta: number) => void;
  styles: Record<string, any>;
}

export const ScoreInputSection: React.FC<ScoreInputSectionProps> = ({
  score,
  par,
  putts,
  greenHit = false,
  penaltyStrokes = 0,
  showPutts,
  scorecardColorsEnabled = true,
  onScoreChange,
  onPuttsChange,
  styles,
}) => {
  const scoreValue = score ?? par;
  const scoreState =
    scoreValue <= par - 2 ? 'eagle or better'
      : scoreValue === par - 1 ? 'birdie'
      : scoreValue === par ? 'par'
      : scoreValue === par + 1 ? 'bogey'
      : 'double bogey or worse';

  const puttValue = putts ?? 2;
  const isGreenHit = greenHit === true;

  return (
    <View style={styles.scorePuttsRow}>
      <View style={styles.scoreContainerPrimary}>
        <Text style={styles.scoreLabelPrimary}>Score</Text>
        <View style={styles.scoreControlCompact}>
          <TouchableOpacity
            style={styles.compactButtonPrimary}
            onPress={() => onScoreChange(-1)}
            accessibilityRole="button"
            accessibilityLabel={`Decrease score to ${scoreValue - 1}`}
          >
            <Ionicons name="remove" size={22} color="#10B981" />
          </TouchableOpacity>
          <View style={[styles.scoreDisplayCompact, { backgroundColor: getScoreBackgroundColor(scoreValue, par, scorecardColorsEnabled), borderRadius: 8 }]}>
            <Text
              style={[styles.scoreValuePrimary, { color: getScoreColor(scoreValue, par, scorecardColorsEnabled) }]}
              accessibilityRole="text"
              accessibilityLabel={`Score ${scoreValue}, ${scoreState}`}
            >
              {scoreValue}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.compactButtonPrimary}
            onPress={() => onScoreChange(1)}
            accessibilityRole="button"
            accessibilityLabel={`Increase score to ${scoreValue + 1}`}
          >
            <Ionicons name="add" size={22} color="#10B981" />
          </TouchableOpacity>
        </View>
        {penaltyStrokes > 0 && (
          <Text style={styles.scorePenaltyHint}>
            Includes {penaltyStrokes} penalty stroke{penaltyStrokes === 1 ? '' : 's'}
          </Text>
        )}
      </View>

      {showPutts && (
        <View style={styles.scoreContainerSecondary}>
          <Text style={styles.scoreLabelSecondary}>Putts</Text>
          <View style={styles.scoreControlCompact}>
            <TouchableOpacity
              style={styles.compactButton}
              onPress={() => onPuttsChange(-1)}
              accessibilityRole="button"
              accessibilityLabel={`Decrease putts to ${Math.max(0, (putts ?? 2) - 1)}`}
            >
              <Ionicons name="remove" size={20} color="#10B981" />
            </TouchableOpacity>
            <View style={[styles.scoreDisplayCompact, { backgroundColor: getPuttBackgroundColor(puttValue, isGreenHit, scorecardColorsEnabled), borderRadius: 8 }]}>
              <Text
                style={[styles.scoreValueSecondary, { color: getPuttColor(puttValue, isGreenHit, scorecardColorsEnabled) }]}
                accessibilityRole="text"
                accessibilityLabel={`Putts ${puttValue}`}
              >
                {puttValue}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.compactButton}
              onPress={() => onPuttsChange(1)}
              accessibilityRole="button"
              accessibilityLabel={`Increase putts to ${(putts ?? 2) + 1}`}
            >
              <Ionicons name="add" size={20} color="#10B981" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};
