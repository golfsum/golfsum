import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { colors } from '../../theme/tokens';

export const LoadingState: React.FC = () => (
  <View style={styles.container}>
    <ActivityIndicator size="large" color={colors.brand.primary} />
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
