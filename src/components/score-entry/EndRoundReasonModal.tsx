import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface EndRoundReasonModalProps {
  visible: boolean;
  holesWithScores: number;
  onClose: () => void;
  onSelectReason: (reason: 'finished-early' | 'nine-holes' | 'weather' | 'practice' | 'other') => void;
  onExitWithoutSaving: () => void;
  styles: any;
}

export const EndRoundReasonModal: React.FC<EndRoundReasonModalProps> = ({
  visible,
  holesWithScores,
  onClose,
  onSelectReason,
  onExitWithoutSaving,
  styles,
}) => {
  if (!visible) return null;

  return (
    <View style={styles.modalOverlayDark}>
      <View style={styles.confirmModal}>
        <Text style={styles.confirmModalTitle}>How would you like to finish?</Text>
        <Text style={styles.confirmModalMessage}>
          {holesWithScores > 0
            ? `You've completed ${holesWithScores} of 18 holes.`
            : `No holes saved yet. This round will be discarded.`
          }
        </Text>

        {holesWithScores > 0 ? (
          <>
            <TouchableOpacity
              style={styles.reasonButton}
              onPress={() => onSelectReason('finished-early')}
            >
              <Ionicons name="checkmark-circle" size={20} color="#10B981" />
              <Text style={styles.reasonButtonText}>Finished early</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.reasonButton}
              onPress={() => onSelectReason('nine-holes')}
            >
              <Ionicons name="golf" size={20} color="#10B981" />
              <Text style={styles.reasonButtonText}>Only playing 9 holes</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.reasonButton}
              onPress={() => onSelectReason('weather')}
            >
              <Ionicons name="rainy" size={20} color="#10B981" />
              <Text style={styles.reasonButtonText}>Weather / time</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.reasonButton}
              onPress={() => onSelectReason('practice')}
            >
              <Ionicons name="fitness" size={20} color="#10B981" />
              <Text style={styles.reasonButtonText}>Practice round</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.reasonButton}
              onPress={() => onSelectReason('other')}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color="#10B981" />
              <Text style={styles.reasonButtonText}>Other</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.confirmModalButton, { marginTop: 16 }]}
              onPress={onClose}
            >
              <Text style={[styles.confirmModalButtonText, styles.confirmModalButtonTextSecondary]}>
                Cancel
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.confirmModalButton, styles.confirmModalButtonDestructive, { marginTop: 16 }]}
            onPress={onExitWithoutSaving}
          >
            <Text style={[styles.confirmModalButtonText, { color: '#FFFFFF' }]}>
              Exit Without Saving
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};
