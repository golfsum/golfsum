import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface InfoTipCardProps {
  icon: string;
  title: string;
  text: string;
  iconColor: string;
  onDismiss: () => void;
  styles: any;
}

export const InfoTipCard: React.FC<InfoTipCardProps> = ({
  icon,
  title,
  text,
  iconColor,
  onDismiss,
  styles,
}) => {
  return (
    <View style={styles.preRoundTipCard}>
      <View style={styles.preRoundTipHeader}>
        <Ionicons name={icon as any} size={18} color={iconColor} />
        <Text style={styles.preRoundTipTitle}>{title}</Text>
        <TouchableOpacity onPress={onDismiss}>
          <Ionicons name="close" size={16} color="#6B7280" />
        </TouchableOpacity>
      </View>
      <Text style={styles.preRoundTipText}>{text}</Text>
    </View>
  );
};
