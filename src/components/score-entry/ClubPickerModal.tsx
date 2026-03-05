import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ClubPickerModalProps {
  visible: boolean;
  title: string;
  selectedClub: string | null;
  availableClubs: string[];
  clubDistances?: Record<string, number>;
  onSelect: (club: string) => void;
  onClose: () => void;
  styles: any;
}

export const ClubPickerModal: React.FC<ClubPickerModalProps> = ({
  visible,
  title,
  selectedClub,
  availableClubs,
  clubDistances,
  onSelect,
  onClose,
  styles,
}) => {
  if (!visible) return null;

  return (
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{title}</Text>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close club picker"
          >
            <Ionicons name="close" size={28} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.clubList}>
          {availableClubs.map((club, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.clubOption,
                selectedClub === club && styles.clubOptionSelected,
              ]}
              onPress={() => onSelect(club)}
              accessibilityRole="button"
              accessibilityLabel={`${club}${clubDistances?.[club] ? `, ${clubDistances[club]} yards` : ''}${selectedClub === club ? ', selected' : ''}`}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text
                  style={[
                    styles.clubOptionText,
                    selectedClub === club && styles.clubOptionTextSelected,
                  ]}
                >
                  {club}
                </Text>
                {clubDistances?.[club] && (
                  <Text style={{ fontSize: 13, color: '#6B7280', fontWeight: '500' }}>
                    {clubDistances[club]} yds
                  </Text>
                )}
              </View>
              {selectedClub === club && (
                <Ionicons name="checkmark-circle" size={24} color="#10B981" />
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};
