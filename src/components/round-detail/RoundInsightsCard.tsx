import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export type InsightType = 'positive' | 'warning' | 'critical';

export interface RoundInsight {
  type: InsightType;
  label: string;
  detail?: string;
  text?: string; // legacy compat — ignored if label is present
  category?: string;
}

interface RoundInsightsCardProps {
  insights: RoundInsight[];
}

const ICON_MAP: Record<InsightType, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  positive: { name: 'checkmark-circle', color: '#22C55E' },
  warning: { name: 'warning', color: '#F59E0B' },
  critical: { name: 'close-circle', color: '#EF4444' },
};

const ROW_BG: Record<InsightType, { bg: string; border: string }> = {
  positive: { bg: 'rgba(34, 197, 94, 0.08)', border: 'rgba(34, 197, 94, 0.2)' },
  warning: { bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.2)' },
  critical: { bg: 'rgba(239, 68, 68, 0.08)', border: 'rgba(239, 68, 68, 0.2)' },
};

export const RoundInsightsCard: React.FC<RoundInsightsCardProps> = ({ insights }) => {
  const [expandedRows, setExpandedRows] = React.useState<Record<string, boolean>>({});

  if (!insights.length) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="flash" size={18} color="#10B981" />
        <Text style={styles.title}>Round Insights</Text>
      </View>
      {insights.map((insight, i) => {
        const icon = ICON_MAP[insight.type] ?? ICON_MAP.positive;
        const row = ROW_BG[insight.type] ?? ROW_BG.positive;
        const displayLabel = insight.label || insight.text || '';
        const displayDetail = insight.detail;

        return (
          <View
            key={`${insight.type}-${i}`}
            style={[
              styles.row,
              { backgroundColor: row.bg, borderColor: row.border },
            ]}
          >
            <Ionicons name={icon.name} size={18} color={icon.color} style={styles.icon} />
            <View style={styles.textWrap}>
              <Text style={styles.label} numberOfLines={expandedRows[`${insight.type}-${i}`] ? undefined : 3} ellipsizeMode="tail">
                {displayLabel}
              </Text>
              {displayDetail ? (
                <Text style={styles.detail} numberOfLines={expandedRows[`${insight.type}-${i}`] ? undefined : 3} ellipsizeMode="tail">
                  {displayDetail}
                </Text>
              ) : null}
              {(displayLabel.length > 120 || (displayDetail?.length ?? 0) > 120) && (
                <TouchableOpacity
                  onPress={() =>
                    setExpandedRows(prev => ({
                      ...prev,
                      [`${insight.type}-${i}`]: !prev[`${insight.type}-${i}`],
                    }))
                  }
                  accessibilityRole="button"
                  accessibilityLabel={expandedRows[`${insight.type}-${i}`] ? 'Show less' : 'Show more'}
                >
                  <Text style={styles.expandText}>
                    {expandedRows[`${insight.type}-${i}`] ? 'Show less' : 'Show more'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
  },
  icon: {
    marginTop: 1,
  },
  textWrap: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F3F4F6',
  },
  detail: {
    fontSize: 13,
    color: '#D1D5DB',
    lineHeight: 18,
  },
  expandText: {
    marginTop: 4,
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
  },
});
