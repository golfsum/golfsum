import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface PenaltySheetProps {
  visible: boolean;
  allowBunkers: boolean;
  allowPenalties: boolean;
  showFairwayBunker: boolean;
  showGreensideBunker: boolean;
  showHazard: boolean;
  showDrop: boolean;
  showOb: boolean;
  onToggleBunker: (type: 'fairway' | 'greenside') => void;
  onTogglePenalty: (type: 'hazard' | 'drop' | 'ob') => void;
  onClose: () => void;
  styles: any;
}

export const PenaltySheet: React.FC<PenaltySheetProps> = ({
  visible,
  allowBunkers,
  allowPenalties,
  showFairwayBunker,
  showGreensideBunker,
  showHazard,
  showDrop,
  showOb,
  onToggleBunker,
  onTogglePenalty,
  onClose,
  styles,
}) => {
  if (!visible) return null;

  return (
    <View style={styles.sheetOverlay}>
      <View style={styles.sheetContainer}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Penalties &amp; Bunkers</Text>
          <TouchableOpacity
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close penalties and bunkers"
          >
            <Ionicons name="close" size={24} color="#9CA3AF" />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.sheetContent}>
          {allowBunkers && (
            <View style={styles.sheetSection}>
              <Text style={styles.sheetLabel}>Bunkers</Text>
              <View style={styles.sheetButtonRow}>
                <TouchableOpacity
                  style={[styles.sheetButton, showFairwayBunker && styles.sheetButtonActive]}
                  onPress={() => onToggleBunker('fairway')}
                  accessibilityRole="button"
                  accessibilityLabel={`Fairway bunker${showFairwayBunker ? ', selected' : ''}`}
                >
                  <Ionicons
                    name="flag"
                    size={18}
                    color={showFairwayBunker ? '#10B981' : '#6B7280'}
                  />
                  <Text
                    style={[
                      styles.sheetButtonText,
                      showFairwayBunker && styles.sheetButtonTextActive,
                    ]}
                  >
                    Fairway
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sheetButton, showGreensideBunker && styles.sheetButtonActive]}
                  onPress={() => onToggleBunker('greenside')}
                  accessibilityRole="button"
                  accessibilityLabel={`Greenside bunker${showGreensideBunker ? ', selected' : ''}`}
                >
                  <Ionicons
                    name="golf"
                    size={18}
                    color={showGreensideBunker ? '#10B981' : '#6B7280'}
                  />
                  <Text
                    style={[
                      styles.sheetButtonText,
                      showGreensideBunker && styles.sheetButtonTextActive,
                    ]}
                  >
                    Greenside
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {allowPenalties && (
            <View style={styles.sheetSection}>
              <Text style={styles.sheetLabel}>Penalties</Text>
              <View style={styles.sheetButtonRow}>
                <TouchableOpacity
                  style={[styles.sheetButton, showHazard && styles.sheetButtonActive]}
                  onPress={() => onTogglePenalty('hazard')}
                  accessibilityRole="button"
                  accessibilityLabel={`Hazard penalty${showHazard ? ', selected' : ''}`}
                >
                  <Ionicons name="water" size={18} color={showHazard ? '#EF4444' : '#6B7280'} />
                  <Text
                    style={[
                      styles.sheetButtonText,
                      showHazard && styles.sheetButtonTextActive,
                    ]}
                  >
                    Hazard
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sheetButton, showDrop && styles.sheetButtonActive]}
                  onPress={() => onTogglePenalty('drop')}
                  accessibilityRole="button"
                  accessibilityLabel={`Drop penalty${showDrop ? ', selected' : ''}`}
                >
                  <Ionicons
                    name="hand-left"
                    size={18}
                    color={showDrop ? '#EF4444' : '#6B7280'}
                  />
                  <Text
                    style={[
                      styles.sheetButtonText,
                      showDrop && styles.sheetButtonTextActive,
                    ]}
                  >
                    Drop
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.sheetButton, showOb && styles.sheetButtonActive]}
                  onPress={() => onTogglePenalty('ob')}
                  accessibilityRole="button"
                  accessibilityLabel={`Out of bounds penalty${showOb ? ', selected' : ''}`}
                >
                  <Ionicons
                    name="close-circle-outline"
                    size={18}
                    color={showOb ? '#EF4444' : '#6B7280'}
                  />
                  <Text style={[styles.sheetButtonText, showOb && styles.sheetButtonTextActive]}>
                    OB
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
        <TouchableOpacity
          style={styles.sheetDoneButton}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Done"
          accessibilityHint="Close penalties and bunkers"
        >
          <Text style={styles.sheetDoneButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
