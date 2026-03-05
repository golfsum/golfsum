import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatCourseName } from '../../utils/courseName';

interface ScoreEntryHeaderProps {
  courseName: string;
  teeName: string;
  totalPar: number;
  startType: 'standard' | 'shotgun';
  isFavorite: boolean;
  entryMode?: 'quick' | 'detailed';
  onToggleEntryMode?: () => void;
  onBack: () => void;
  onToggleFavorite: () => void;
  styles: any;
}

export const ScoreEntryHeader: React.FC<ScoreEntryHeaderProps> = ({
  courseName,
  teeName,
  totalPar,
  startType,
  isFavorite,
  entryMode,
  onToggleEntryMode,
  onBack,
  onToggleFavorite,
  styles,
}) => {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={onBack}
        style={styles.backButton}
        accessibilityRole="button"
        accessibilityLabel="Go back"
        accessibilityHint="Returns to the previous screen"
      >
        <Ionicons name="arrow-back" size={24} color="#E5E7EB" />
      </TouchableOpacity>
      <View style={styles.headerCenter}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.courseName} numberOfLines={1}>
            {formatCourseName(courseName)}
          </Text>
          {startType === 'shotgun' && (
            <View style={styles.shotgunBadge}>
              <Ionicons name="people" size={12} color="#F59E0B" />
              <Text style={styles.shotgunBadgeText}>Shotgun</Text>
            </View>
          )}
        </View>
        <Text style={styles.teeBox}>
          {teeName} Tees - Par {totalPar}
        </Text>
      </View>
      <View style={styles.headerActions}>
        {entryMode && onToggleEntryMode && (
          <TouchableOpacity
            onPress={onToggleEntryMode}
            style={[styles.modePill, entryMode === 'quick' ? styles.modePillQuick : styles.modePillDetailed]}
            accessibilityRole="button"
            accessibilityLabel={`Switch to ${entryMode === 'quick' ? 'detailed' : 'quick'} mode`}
          >
            <Text style={styles.modePillText}>{entryMode === 'quick' ? 'Quick' : 'Detailed'}</Text>
            <Ionicons name="chevron-down" size={14} color="#E5E7EB" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={onToggleFavorite}
          style={styles.favoriteButton}
          accessibilityRole="button"
          accessibilityLabel={isFavorite ? 'Remove favorite course' : 'Mark course as favorite'}
        >
          <Ionicons
            name={isFavorite ? 'star' : 'star-outline'}
            size={24}
            color={isFavorite ? '#FBBF24' : '#7B8291'}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};
