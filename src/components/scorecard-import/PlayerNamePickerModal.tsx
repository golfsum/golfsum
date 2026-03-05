import React from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ScorecardImportStyles } from '../ScorecardImportScreen.styles';

interface Props {
  visible: boolean;
  styles: ScorecardImportStyles;
  profilePlayerName: string;
  playerNameCandidates: string[];
  lockPlayerName: (name: string) => void;
  onClose: () => void;
}

export const PlayerNamePickerModal: React.FC<Props> = ({
  visible,
  styles,
  profilePlayerName,
  playerNameCandidates,
  lockPlayerName,
  onClose,
}) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.keypadOverlay}>
        <TouchableOpacity
          style={styles.keypadBackdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.namePickerContainer}>
          <View style={styles.namePickerHeader}>
            <Text style={styles.namePickerTitle}>Select Player</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={20} color="#E5E7EB" />
            </TouchableOpacity>
          </View>
          {profilePlayerName && !playerNameCandidates.includes(profilePlayerName) && (
            <TouchableOpacity
              style={styles.namePickerOption}
              onPress={() => {
                lockPlayerName(profilePlayerName);
                onClose();
              }}
            >
              <Text style={styles.namePickerOptionText}>{profilePlayerName}</Text>
              <Text style={styles.namePickerOptionHint}>Profile name</Text>
            </TouchableOpacity>
          )}
          {playerNameCandidates.map((name) => (
            <TouchableOpacity
              key={name}
              style={styles.namePickerOption}
              onPress={() => {
                lockPlayerName(name);
                onClose();
              }}
            >
              <Text style={styles.namePickerOptionText}>{name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
};
