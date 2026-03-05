/**
 * Game Plan Card Component
 * 
 * Displays pre-round focus - short, calm, actionable
 * No stats, no mechanics
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GamePlanCard as GamePlan } from '../services/patternInsights';

interface Props {
  gamePlan: GamePlan;
}

export const GamePlanCard: React.FC<Props> = ({ gamePlan }) => {
  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="clipboard-outline" size={28} color="#3B82F6" />
        <Text style={styles.title}>Your Focus for the Next Round</Text>
      </View>

      {/* Sections */}
      {gamePlan.sections.map((section, index) => (
        <View key={index} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.focus.map((item, itemIndex) => (
            <View key={itemIndex} style={styles.focusItem}>
              <View style={styles.bullet} />
              <Text style={styles.focusText}>{item}</Text>
            </View>
          ))}
        </View>
      ))}

      {/* One Rule */}
      <View style={styles.oneRuleSection}>
        <View style={styles.oneRuleHeader}>
          <Ionicons name="star" size={18} color="#F59E0B" />
          <Text style={styles.oneRuleLabel}>One rule to remember</Text>
        </View>
        <Text style={styles.oneRuleText}>{gamePlan.oneRule}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#3B82F6',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#374151',
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3B82F6',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  focusItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    paddingLeft: 4,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#9CA3AF',
    marginTop: 7,
    marginRight: 12,
  },
  focusText: {
    flex: 1,
    fontSize: 15,
    color: '#E5E7EB',
    lineHeight: 22,
  },
  oneRuleSection: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
    padding: 14,
    borderRadius: 8,
    marginTop: 8,
  },
  oneRuleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  oneRuleLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F59E0B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  oneRuleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FDE68A',
    lineHeight: 24,
  },
});
