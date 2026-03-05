import React from 'react';
import { View, Text, TextInput } from 'react-native';

interface PersonalInfoSectionProps {
  nickname: string;
  onNicknameChange: (value: string) => void;
  styles: any;
}

export const PersonalInfoSection: React.FC<PersonalInfoSectionProps> = ({
  nickname,
  onNicknameChange,
  styles,
}) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>PERSONAL INFO</Text>
    <Text style={styles.sectionHint}>Helps recognize your name on scorecards</Text>

    <View style={styles.formRow}>
      <Text style={styles.formLabel}>Name/Nickname</Text>
      <TextInput
        style={styles.formInput}
        value={nickname}
        onChangeText={onNicknameChange}
        placeholder="JD, Johnny, etc."
        placeholderTextColor="#6B7280"
      />
    </View>
  </View>
);
