import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface DiscardRoundModalProps {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  styles: any;
}

export const DiscardRoundModal: React.FC<DiscardRoundModalProps> = ({
  visible,
  onConfirm,
  onCancel,
  styles,
}) => {
  if (!visible) return null;

  return (
    <View style={styles.modalOverlayDark}>
      <View style={styles.confirmModal}>
        <Ionicons name="warning" size={48} color="#EF4444" style={{ marginBottom: 16 }} />
        <Text style={styles.confirmModalTitle}>Abandon Round?</Text>
        <Text style={styles.confirmModalMessage}>
          This will permanently delete this round.{'\n\n'}
          All entered data will be lost.
        </Text>

        <TouchableOpacity
          style={[styles.confirmModalButton, styles.confirmModalButtonDestructive]}
          onPress={onConfirm}
        >
          <Text style={[styles.confirmModalButtonText, { color: '#FFFFFF' }]}>
            Yes, Abandon Round
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.confirmModalButton, styles.confirmModalButtonPrimary]}
          onPress={onCancel}
        >
          <Text style={styles.confirmModalButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
