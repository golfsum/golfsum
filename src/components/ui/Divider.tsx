import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '../../theme/tokens';

interface DividerProps {
  style?: ViewStyle | ViewStyle[];
}

export const Divider: React.FC<DividerProps> = ({ style }) => (
  <View style={[styles.divider, style]} />
);

const styles = StyleSheet.create({
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
});
