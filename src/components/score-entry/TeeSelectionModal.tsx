import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CourseDetails, TeeBox } from '../../services/golfCourseApiService';
import { formatYardage, getYardageUnitLabel, type DistanceUnit } from '../../utils/distance';

interface TeeSelectionModalProps {
  visible: boolean;
  course: CourseDetails | null;
  selectedTeeBox: TeeBox | null;
  startingHole: number;
  onStartingHoleChange: (hole: number) => void;
  onOpenStartingHolePicker: () => void;
  onSelectTeeBox: (tee: TeeBox) => void;
  onBack: () => void;
  getTeeColor: (teeName: string) => string;
  distanceUnit: DistanceUnit;
  styles: any;
}

export const TeeSelectionModal: React.FC<TeeSelectionModalProps> = ({
  visible,
  course,
  selectedTeeBox,
  startingHole,
  onStartingHoleChange,
  onOpenStartingHolePicker,
  onSelectTeeBox,
  onBack,
  getTeeColor,
  distanceUnit,
  styles,
}) => {
  if (!visible || !course) return null;
  const yardageUnitLabel = getYardageUnitLabel(distanceUnit);

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <TouchableOpacity
            onPress={onBack}
            style={styles.modalBackButton}
            accessibilityRole="button"
            accessibilityLabel="Back"
            accessibilityHint="Return to previous screen"
          >
            <Ionicons name="arrow-back" size={24} color="#E5E7EB" />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Select Tee Box</Text>
          <View style={styles.modalBackButton} />
        </View>
        <ScrollView>
          <View style={styles.roundOptions}>
            <Text style={styles.roundOptionsTitle}>Starting Hole</Text>
            <View style={styles.startingHoleOptions}>
              <TouchableOpacity
                style={[
                  styles.startingHoleButton,
                  startingHole === 1 && styles.startingHoleButtonActive,
                ]}
                onPress={() => onStartingHoleChange(1)}
                accessibilityRole="button"
                accessibilityLabel={`Start at hole 1${startingHole === 1 ? ', selected' : ''}`}
              >
                <Text
                  style={[
                    styles.startingHoleText,
                    startingHole === 1 && styles.startingHoleTextActive,
                  ]}
                >
                  Hole 1
                </Text>
                <Text style={styles.startingHoleSubtext}>Start Front 9</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.startingHoleButton,
                  startingHole === 10 && styles.startingHoleButtonActive,
                ]}
                onPress={() => onStartingHoleChange(10)}
                accessibilityRole="button"
                accessibilityLabel={`Start at hole 10${startingHole === 10 ? ', selected' : ''}`}
              >
                <Text
                  style={[
                    styles.startingHoleText,
                    startingHole === 10 && styles.startingHoleTextActive,
                  ]}
                >
                  Hole 10
                </Text>
                <Text style={styles.startingHoleSubtext}>Start Back 9</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.startingHoleButton,
                  startingHole !== 1 &&
                    startingHole !== 10 &&
                    styles.startingHoleButtonActive,
                ]}
                onPress={onOpenStartingHolePicker}
                accessibilityRole="button"
                accessibilityLabel={`Choose custom starting hole${startingHole !== 1 && startingHole !== 10 ? `, currently hole ${startingHole}` : ''}`}
              >
                <Text
                  style={[
                    styles.startingHoleText,
                    startingHole !== 1 &&
                      startingHole !== 10 &&
                      styles.startingHoleTextActive,
                  ]}
                >
                  Other
                </Text>
                <Text style={styles.startingHoleSubtext}>
                  {startingHole !== 1 && startingHole !== 10
                    ? `Hole ${startingHole}`
                    : 'Custom Start'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          {course.teeBoxes.map((tee, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.teeBoxOption,
                selectedTeeBox?.name === tee.name && styles.teeBoxOptionSelected,
              ]}
              onPress={() => onSelectTeeBox(tee)}
              accessibilityRole="button"
              accessibilityLabel={`${tee.name} tees${selectedTeeBox?.name === tee.name ? ', selected' : ''}`}
            >
              <View style={styles.teeBoxOptionContent}>
                <View
                  style={[
                    styles.teeColorStripe,
                    { backgroundColor: getTeeColor(tee.name) },
                  ]}
                />
                <View style={styles.teeBoxInfo}>
                  <Text style={styles.teeBoxName}>{tee.name} Tees</Text>
                  <Text style={styles.teeBoxDetails}>
                    Rating: {tee.rating?.toFixed(1) || '—'} - Slope:{' '}
                    {tee.slope || '—'} - {formatYardage(tee.yardage || 0, distanceUnit)} {yardageUnitLabel}
                  </Text>
                </View>
                {selectedTeeBox?.name === tee.name && (
                  <Ionicons name="checkmark-circle" size={22} color="#10B981" />
                )}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};
