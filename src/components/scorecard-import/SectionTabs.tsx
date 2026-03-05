import React, { forwardRef } from 'react';
import { ScrollView, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, radius } from '../../theme/tokens';

type TabKey = 'photo' | 'player' | 'course' | 'yardages';

interface SectionTab {
  key: TabKey;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface SectionTabsProps {
  tabs: SectionTab[];
  activeKey: TabKey;
  onSelect: (key: TabKey) => void;
  onTabsLayout: (width: number) => void;
  onTabLayout: (key: TabKey, layout: { x: number; width: number }) => void;
}

export const SectionTabs = forwardRef<ScrollView, SectionTabsProps>(({
  tabs,
  activeKey,
  onSelect,
  onTabsLayout,
  onTabLayout,
}, ref) => (
  <View style={styles.sectionTabs}>
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.sectionTabsRow}
      onLayout={(event) => onTabsLayout(event.nativeEvent.layout.width)}
    >
      {tabs.map(tab => (
        <TouchableOpacity
          key={tab.key}
          style={[
            styles.sectionTab,
            activeKey === tab.key && styles.sectionTabActive,
          ]}
          onPress={() => onSelect(tab.key)}
          accessibilityRole="tab"
          accessibilityLabel={`${tab.label} tab`}
          accessibilityState={{ selected: activeKey === tab.key }}
          onLayout={(event) => {
            onTabLayout(tab.key, {
              x: event.nativeEvent.layout.x,
              width: event.nativeEvent.layout.width,
            });
          }}
        >
          <Ionicons
            name={tab.icon}
            size={14}
            color={activeKey === tab.key ? colors.brand.primary : colors.text.secondary}
          />
          <Text
            style={[
              styles.sectionTabText,
              activeKey === tab.key && styles.sectionTabTextActive,
            ]}
          >
            {tab.label}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  </View>
));

SectionTabs.displayName = 'SectionTabs';

const styles = StyleSheet.create({
  sectionTabs: {
    marginBottom: spacing.lg,
  },
  sectionTabsRow: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  sectionTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.bg.secondary,
    backgroundColor: colors.bg.primary,
  },
  sectionTabActive: {
    borderColor: colors.brand.primaryBorder,
    backgroundColor: colors.brand.primaryMuted,
  },
  sectionTabText: {
    ...typography.labelMd,
    color: colors.text.secondary,
  },
  sectionTabTextActive: {
    color: colors.brand.primary,
  },
});
