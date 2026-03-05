import React from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ProfileHeaderProps {
  displayName?: string | null;
  email?: string | null;
  photoURL?: string | null;
  nickname?: string;
  isEditingNickname?: boolean;
  onEditNickname?: () => void;
  onNicknameChange?: (value: string) => void;
  onNicknameBlur?: () => void;
  styles: any;
}

export const ProfileHeader: React.FC<ProfileHeaderProps> = ({
  displayName,
  email,
  photoURL,
  nickname,
  isEditingNickname,
  onEditNickname,
  onNicknameChange,
  onNicknameBlur,
  styles,
}) => {
  return (
    <View style={styles.profileHeader}>
      <View style={styles.avatarSignedIn}>
        {photoURL ? (
          <Ionicons name="person" size={24} color="#10B981" />
        ) : (
          <Text style={styles.avatarInitial}>
            {(displayName || email || 'U')[0].toUpperCase()}
          </Text>
        )}
      </View>
      <View style={styles.profileHeaderText}>
        <Text style={styles.userName}>
          {displayName || email?.split('@')[0] || 'User'}
        </Text>
        <Text style={styles.userEmail}>{email}</Text>
        <View style={styles.nicknameRow}>
          {isEditingNickname ? (
            <View style={styles.nicknameEditContainer}>
              <TextInput
                style={styles.nicknameInput}
                value={nickname}
                onChangeText={onNicknameChange}
                onBlur={onNicknameBlur}
                placeholder="Add nickname"
                placeholderTextColor="#6B7280"
              />
              <Text style={styles.nicknameHint}>Used for scorecard recognition.</Text>
            </View>
          ) : (
            <>
              <Text style={styles.nicknameText}>
                {nickname && nickname.trim().length > 0 ? nickname : 'Add nickname'}
              </Text>
              <TouchableOpacity
                style={styles.nicknameEditButton}
                onPress={onEditNickname}
                accessibilityRole="button"
                accessibilityLabel="Edit nickname"
              >
                <Ionicons name="pencil" size={14} color="#9CA3AF" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
};
