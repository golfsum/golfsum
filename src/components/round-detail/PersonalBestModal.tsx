import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';
import type { PersonalBest } from '../../services/personalBestService';

interface PersonalBestModalProps {
  visible: boolean;
  personalBests: PersonalBest[];
  onShare: () => void;
  onContinue: () => void;
  styles: Record<string, any>;
}

export const PersonalBestModal: React.FC<PersonalBestModalProps> = ({
  visible,
  personalBests,
  onShare,
  onContinue,
  styles,
}) => {
  if (!visible || personalBests.length === 0) return null;

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.personalBestOverlay}>
        <View style={styles.personalBestCard}>
          <Text style={styles.personalBestTitle}>New Personal Best!</Text>
          <View style={styles.personalBestList}>
            {personalBests.map(record => (
              <View key={record.id} style={styles.personalBestRow}>
                <Text style={styles.personalBestLabel}>{record.title}</Text>
                <Text style={styles.personalBestValue}>
                  {record.valueText}
                  {record.previousText ? ` (prev ${record.previousText})` : ''}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.personalBestActions}>
            <TouchableOpacity
              style={styles.personalBestShare}
              onPress={onShare}
              accessibilityRole="button"
              accessibilityLabel="Share personal best"
            >
              <Text style={styles.personalBestShareText}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.personalBestContinue}
              onPress={onContinue}
              accessibilityRole="button"
              accessibilityLabel="Continue"
            >
              <Text style={styles.personalBestContinueText}>Continue</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};
