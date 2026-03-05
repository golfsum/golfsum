import React from 'react';
import { View, Text } from 'react-native';

interface QuickStatProps {
  label: string;
  value: string;
  subValue?: string;
  styles: Record<string, any>;
}

export const QuickStat: React.FC<QuickStatProps> = ({ label, value, subValue, styles }) => (
  <View style={styles.quickStat}>
    <Text style={styles.quickStatValue}>{value}</Text>
    {subValue && <Text style={styles.quickStatSubValue}>{subValue}</Text>}
    <Text style={styles.quickStatLabel}>{label}</Text>
  </View>
);
