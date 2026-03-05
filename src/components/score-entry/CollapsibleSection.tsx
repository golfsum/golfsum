import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface CollapsibleSectionProps {
  title: string;
  subtitle?: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  styles: Record<string, any>;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  subtitle,
  expanded,
  onToggle,
  children,
  styles,
}) => (
  <View style={styles.collapsibleContainer}>
    <TouchableOpacity
      style={styles.collapsibleHeader}
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${expanded ? 'expanded' : 'collapsed'}`}
      accessibilityHint={`Double tap to ${expanded ? 'collapse' : 'expand'} ${title}`}
    >
      <View style={styles.collapsibleHeaderContent}>
        <Text style={styles.collapsibleTitle}>{title}</Text>
        {subtitle && !expanded && (
          <Text style={styles.collapsibleSubtitle}>{subtitle}</Text>
        )}
      </View>
      <Ionicons
        name={expanded ? 'chevron-up' : 'chevron-down'}
        size={18}
        color="#10B981"
      />
    </TouchableOpacity>
    {expanded && <View style={styles.collapsibleContent}>{children}</View>}
  </View>
);
