import React from 'react';
import { Platform, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TabName } from '../types';
import { colors, spacing, typography } from '../theme/tokens';

/** Tab row + labels (excludes `bottomInset` padding). Keep in sync with styles below. */
export const BOTTOM_NAV_CONTENT_HEIGHT = 72;

interface Props {
  activeTab: TabName;
  onTabPress: (tab: TabName) => void;
  /** `useSafeAreaInsets().bottom` — bar draws edge-to-edge; buttons sit above home indicator */
  bottomInset: number;
}

interface TabConfig {
  name: TabName;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
}

const tabs: TabConfig[] = [
  { name: 'averages', label: 'Averages', icon: 'stats-chart-outline', iconActive: 'stats-chart' },
  { name: 'history', label: 'History', icon: 'time-outline', iconActive: 'time' },
  { name: 'upload', label: 'Play', icon: 'flag-outline', iconActive: 'flag' },
  { name: 'insights', label: 'Insights', icon: 'analytics-outline', iconActive: 'analytics' },
  { name: 'profile', label: 'Profile', icon: 'person-outline', iconActive: 'person' },
];

export const BottomNavigation: React.FC<Props> = ({ activeTab, onTabPress, bottomInset }) => {
  const safeBottom = Math.max(bottomInset, Platform.OS === 'android' ? 12 : 0);
  return (
    <View style={[styles.container, { paddingBottom: safeBottom }]}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.name;
        const isUpload = tab.name === 'upload';
        
        return (
          <TouchableOpacity
            key={tab.name}
            style={[styles.tab, isUpload && styles.uploadTab]}
            onPress={() => onTabPress(tab.name)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityLabel={`${tab.label} tab`}
            accessibilityState={{ selected: isActive }}
          >
            <View style={[styles.iconWrapper, isUpload && styles.uploadIconWrapper, isActive && !isUpload && styles.activeIconWrapper]}>
              <Ionicons
                name={isActive ? tab.iconActive : tab.icon}
                size={isUpload ? 26 : 24}
                color={isActive ? colors.brand.primary : colors.text.tertiary}
              />
            </View>
            <Text style={[
              styles.label,
              isActive && styles.activeLabel,
            ]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: colors.bg.secondary,
    borderTopWidth: 1,
    borderTopColor: colors.bg.tertiary,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  uploadTab: {
    // Upload tab gets slight emphasis
  },
  iconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadIconWrapper: {
    backgroundColor: colors.brand.primaryMuted,
  },
  activeIconWrapper: {
    // Could add subtle background for active non-upload tabs
  },
  label: {
    ...typography.labelSm,
    color: colors.text.tertiary,
    marginTop: 2,
  },
  activeLabel: {
    color: colors.brand.primary,
  },
});
