import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';

interface Tab {
  key: string;
  label: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
}

export const TabBar: React.FC<TabBarProps> = ({ tabs, activeTab, onTabChange }) => (
  <View style={styles.container}>
    {tabs.map(tab => {
      const isActive = tab.key === activeTab;
      return (
        <TouchableOpacity
          key={tab.key}
          onPress={() => onTabChange(tab.key)}
          style={[styles.tab, isActive && styles.tabActive]}
        >
          <Text style={[styles.label, isActive && styles.labelActive]}>
            {tab.label}
          </Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.bg.tertiary,
    borderRadius: radius.full,
    padding: spacing.xs,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.full,
  },
  tabActive: {
    backgroundColor: colors.brand.primaryMuted,
  },
  label: {
    ...typography.labelMd,
    color: colors.text.secondary,
  },
  labelActive: {
    color: colors.brand.primary,
  },
});
