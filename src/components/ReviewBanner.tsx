import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type BannerType = 'needs_action' | 'info' | 'warning';

interface ReviewBannerProps {
  type: BannerType;
  title: string;
  message: string;
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

const iconForType = (type: BannerType) => {
  if (type === 'needs_action') return 'alert-circle';
  if (type === 'warning') return 'warning';
  return 'information-circle';
};

const colorForType = (type: BannerType) => {
  if (type === 'needs_action') return '#F59E0B';
  if (type === 'warning') return '#FCD34D';
  return '#60A5FA';
};

export const ReviewBanner: React.FC<ReviewBannerProps> = ({
  type,
  title,
  message,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
}) => {
  const color = colorForType(type);
  return (
    <View style={[styles.container, { borderColor: color }]}>
      <View style={styles.header}>
        <Ionicons name={iconForType(type)} size={18} color={color} />
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={styles.message}>{message}</Text>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.primaryButton, { backgroundColor: color }]} onPress={onPrimaryAction}>
          <Text style={styles.primaryText}>{primaryActionLabel}</Text>
        </TouchableOpacity>
        {secondaryActionLabel && onSecondaryAction && (
          <TouchableOpacity style={styles.secondaryButton} onPress={onSecondaryAction}>
            <Text style={styles.secondaryText}>{secondaryActionLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  title: {
    color: '#E5E7EB',
    fontSize: 15,
    fontWeight: '700',
  },
  message: {
    color: '#D1D5DB',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryButton: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  primaryText: {
    color: '#0B1220',
    fontSize: 13,
    fontWeight: '700',
  },
  secondaryButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  secondaryText: {
    color: '#9CA3AF',
    fontSize: 13,
    fontWeight: '600',
  },
});
