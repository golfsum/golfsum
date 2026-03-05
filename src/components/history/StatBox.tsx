import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface StatBoxProps {
  icon: string;
  iconColor: string;
  label: string;
  value: string;
  highlight?: boolean;
  styles: Record<string, any>;
}

export const StatBox: React.FC<StatBoxProps> = ({
  icon,
  iconColor,
  label,
  value,
  highlight,
  styles,
}) => (
  <View style={styles.statBox}>
    <View style={styles.statBoxHeader}>
      <Ionicons name={icon as any} size={16} color={iconColor} />
      <Text style={styles.statBoxLabel}>{label}</Text>
    </View>
    <Text style={[styles.statBoxValue, highlight && styles.statBoxValueHighlight]}>
      {value}
    </Text>
  </View>
);
