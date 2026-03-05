import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type ApproachDistance =
  | '<50'
  | '50-100'
  | '100-150'
  | '150-200'
  | '200+'
  | '<75'
  | '75-100'
  | '100-125'
  | '125-150'
  | '150-175'
  | '175-200'
  | '200-225'
  | '225-250'
  | '250+'
  | null;

interface DistanceBucket {
  value: ApproachDistance;
  label: string;
}

interface ApproachDistancePickerModalProps {
  visible: boolean;
  selected: ApproachDistance;
  buckets: DistanceBucket[];
  onSelect: (value: ApproachDistance) => void;
  onClose: () => void;
  styles: any;
}

export const ApproachDistancePickerModal: React.FC<ApproachDistancePickerModalProps> = ({
  visible,
  selected,
  buckets,
  onSelect,
  onClose,
  styles,
}) => {
  if (!visible) return null;

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Select Approach Distance</Text>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close approach distance picker"
          >
            <Ionicons name="close" size={28} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.clubList}>
          {buckets.map(bucket => (
            <TouchableOpacity
              key={bucket.value || bucket.label}
              style={[
                styles.clubOption,
                selected === bucket.value && styles.clubOptionSelected,
              ]}
              onPress={() => onSelect(selected === bucket.value ? null : bucket.value)}
              accessibilityRole="button"
              accessibilityLabel={`Approach distance ${bucket.label} yards${selected === bucket.value ? ', selected' : ''}`}
            >
              <Text
                style={[
                  styles.clubOptionText,
                  selected === bucket.value && styles.clubOptionTextSelected,
                ]}
              >
                {bucket.label} yds
              </Text>
              {selected === bucket.value && (
                <Ionicons name="checkmark-circle" size={24} color="#10B981" />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};
