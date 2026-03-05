import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface RoundHeaderProps {
  onBack: () => void;
  onEdit: () => void;
  onShare: () => void;
  onDelete: () => void;
  backLabel?: string;
}

export const RoundHeader: React.FC<RoundHeaderProps> = ({
  onBack,
  onEdit,
  onShare,
  onDelete,
  backLabel = 'Back to History',
}) => (
  <View style={styles.header}>
    <TouchableOpacity
      style={styles.backButton}
      onPress={onBack}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      accessibilityHint="Returns to previous screen"
    >
      <Ionicons name="arrow-back" size={20} color="#9CA3AF" />
      <Text style={styles.backText}>{backLabel}</Text>
    </TouchableOpacity>
    <View style={styles.headerActions}>
      <TouchableOpacity
        style={styles.actionButton}
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel="Edit round"
      >
        <Ionicons name="create-outline" size={20} color="#9CA3AF" />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.actionButton}
        onPress={onShare}
        accessibilityRole="button"
        accessibilityLabel="Share round"
      >
        <Ionicons name="share-outline" size={20} color="#9CA3AF" />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.actionButton}
        onPress={onDelete}
        accessibilityRole="button"
        accessibilityLabel="Delete round"
      >
        <Ionicons name="trash-outline" size={20} color="#9CA3AF" />
      </TouchableOpacity>
    </View>
  </View>
);

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 12,
    backgroundColor: '#1a2028',
    borderBottomWidth: 1,
    borderBottomColor: '#2a3038',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 6,
    minHeight: 44,
  },
  backText: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#252d38',
    borderWidth: 1,
    borderColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
