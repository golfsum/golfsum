import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatYardage, getYardageUnitLabel, type DistanceUnit } from '../../utils/distance';

interface HoleHeaderRowProps {
  holeNumber: number;
  par: number;
  yardage: number;
  handicap: number;
  distanceUnit: DistanceUnit;
  isPrevDisabled: boolean;
  isNextDisabled: boolean;
  onPrev: () => void;
  onNext: () => void;
  styles: any;
}

export const HoleHeaderRow: React.FC<HoleHeaderRowProps> = ({
  holeNumber,
  par,
  yardage,
  handicap,
  distanceUnit,
  isPrevDisabled,
  isNextDisabled,
  onPrev,
  onNext,
  styles,
}) => {
  const yardageLabel = `${formatYardage(yardage, distanceUnit)} ${getYardageUnitLabel(distanceUnit)}`;

  return (
    <View style={styles.holeHeaderRow}>
      <TouchableOpacity
        style={[styles.navButtonSmall, isPrevDisabled && styles.navButtonDisabled]}
        onPress={onPrev}
        disabled={isPrevDisabled}
        accessibilityRole="button"
        accessibilityLabel="Previous hole"
        accessibilityHint="Moves to the previous hole"
      >
        <Ionicons
          name="chevron-back"
          size={20}
          color={isPrevDisabled ? '#4B5563' : '#10B981'}
        />
      </TouchableOpacity>

      <View style={styles.holeInfoCenter}>
        <Text style={styles.holeNumberTop}>Hole {holeNumber}</Text>
        <View style={styles.holeDetails}>
          <Text style={styles.holeDetail}>Par {par}</Text>
          <Text style={styles.holeDivider}>|</Text>
          <Text style={styles.holeDetail}>{yardageLabel}</Text>
          <Text style={styles.holeDivider}>|</Text>
          <Text style={styles.holeDetail}>HCP {handicap}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.navButtonSmall, isNextDisabled && styles.navButtonDisabled]}
        onPress={onNext}
        disabled={isNextDisabled}
        accessibilityRole="button"
        accessibilityLabel="Next hole"
        accessibilityHint="Moves to the next hole"
      >
        <Ionicons
          name="chevron-forward"
          size={20}
          color={isNextDisabled ? '#4B5563' : '#10B981'}
        />
      </TouchableOpacity>
    </View>
  );
};
