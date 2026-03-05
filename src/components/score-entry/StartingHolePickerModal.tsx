import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { CourseDetails } from '../../services/golfCourseApiService';

interface StartingHolePickerModalProps {
  visible: boolean;
  course: CourseDetails | null;
  startingHole: number;
  onClose: () => void;
  onSelectHole: (hole: number) => void;
  styles: any;
}

export const StartingHolePickerModal: React.FC<StartingHolePickerModalProps> = ({
  visible,
  course,
  startingHole,
  onClose,
  onSelectHole,
  styles,
}) => {
  if (!visible || !course) return null;

  const totalHoles = course.holes || 18;
  const frontHoles = Array.from({ length: Math.min(9, totalHoles) }, (_, i) => i + 1);
  const backHoles =
    totalHoles > 9
      ? Array.from({ length: totalHoles - 9 }, (_, i) => i + 10)
      : [];

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.startingHoleModal}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Select Starting Hole</Text>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close starting hole picker"
          >
            <Ionicons name="close" size={28} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.startingHoleGrid}>
          <Text style={styles.startingHoleSectionLabel}>Front 9</Text>
          <View style={styles.startingHoleSectionGrid}>
            {frontHoles.map(holeNumber => (
              <TouchableOpacity
                key={`front-${holeNumber}`}
                style={[
                  styles.startingHoleOption,
                  startingHole === holeNumber && styles.startingHoleOptionActive,
                ]}
                onPress={() => {
                  onSelectHole(holeNumber);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityLabel={`Starting hole ${holeNumber}${startingHole === holeNumber ? ', selected' : ''}`}
              >
                <Text
                  style={[
                    styles.startingHoleOptionText,
                    startingHole === holeNumber && styles.startingHoleOptionTextActive,
                  ]}
                >
                  {holeNumber}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {backHoles.length > 0 && (
            <>
              <View style={styles.startingHoleDivider} />
              <Text style={styles.startingHoleSectionLabel}>Back 9</Text>
              <View style={styles.startingHoleSectionGrid}>
                {backHoles.map(holeNumber => (
                  <TouchableOpacity
                    key={`back-${holeNumber}`}
                    style={[
                      styles.startingHoleOption,
                      startingHole === holeNumber && styles.startingHoleOptionActive,
                    ]}
                    onPress={() => {
                      onSelectHole(holeNumber);
                      onClose();
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Starting hole ${holeNumber}${startingHole === holeNumber ? ', selected' : ''}`}
                  >
                    <Text
                      style={[
                        styles.startingHoleOptionText,
                        startingHole === holeNumber && styles.startingHoleOptionTextActive,
                      ]}
                    >
                      {holeNumber}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </View>
  );
};
