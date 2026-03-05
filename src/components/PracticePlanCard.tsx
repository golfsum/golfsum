/**
 * Practice Plan Card Component
 * 
 * Displays actionable practice drills based on insights
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PracticePlan } from '../services/patternInsights';

interface Props {
  practicePlan: PracticePlan;
  onShare?: () => void;
  onExportPdf?: () => void;
}

export const PracticePlanCard: React.FC<Props> = ({ practicePlan, onShare, onExportPdf }) => {
  const [showQuickWarmUp, setShowQuickWarmUp] = useState(false);
  const [completedDrills, setCompletedDrills] = useState<Set<number>>(new Set());

  const getCategoryIcon = (category: string): keyof typeof Ionicons.glyphMap => {
    if (category === 'TEE') return 'golf';
    if (category === 'APPROACH') return 'flag';
    if (category === 'PUTTING') return 'ellipse';
    return 'fitness';
  };

  const getCategoryColor = (category: string): string => {
    if (category === 'TEE') return '#3B82F6';
    if (category === 'APPROACH') return '#10B981';
    if (category === 'PUTTING') return '#8B5CF6';
    return '#6B7280';
  };

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="fitness" size={24} color="#F59E0B" />
        <View style={styles.headerText}>
          <Text style={styles.title}>Practice Focus Before Your Next Round</Text>
          <Text style={styles.duration}>
            {practicePlan.totalDuration} total • {completedDrills.size}/{practicePlan.drills.length} completed
          </Text>
        </View>
      </View>

      {/* Drills */}
      {practicePlan.drills.map((drill, index) => (
        <View key={index} style={styles.drill}>
          <View style={styles.drillHeader}>
            <View style={styles.drillHeaderLeft}>
              <View style={[styles.iconCircle, { backgroundColor: `${getCategoryColor(drill.category)}20` }]}>
                <Ionicons 
                  name={getCategoryIcon(drill.category)} 
                  size={18} 
                  color={getCategoryColor(drill.category)} 
                />
              </View>
              <View>
                <Text style={styles.drillNumber}>{index + 1}. {drill.title}</Text>
                <Text style={styles.drillDuration}>{drill.duration}</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => {
                setCompletedDrills(prev => {
                  const next = new Set(prev);
                  if (next.has(index)) {
                    next.delete(index);
                  } else {
                    next.add(index);
                  }
                  return next;
                });
              }}
              style={styles.drillCheckbox}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={completedDrills.has(index) ? 'checkbox' : 'square-outline'}
                size={20}
                color={completedDrills.has(index) ? '#10B981' : '#6B7280'}
              />
            </TouchableOpacity>
          </View>
          
          <View style={styles.drillSteps}>
            {drill.steps.map((step, stepIndex) => (
              <View key={stepIndex} style={styles.step}>
                <View style={styles.stepBullet} />
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
          
          {/* Constraints */}
          {drill.constraints && (
            <View style={styles.constraints}>
              {drill.constraints.targetWindow && (
                <View style={styles.constraintItem}>
                  <Ionicons name="resize-outline" size={14} color="#10B981" />
                  <Text style={styles.constraintText}>Target: {drill.constraints.targetWindow}</Text>
                </View>
              )}
              <View style={styles.constraintItem}>
                <Ionicons name="checkmark-circle-outline" size={14} color="#10B981" />
                <Text style={styles.constraintText}>Goal: {drill.constraints.successGoal}</Text>
              </View>
            </View>
          )}
        </View>
      ))}

      {/* Quick Warm-Up Toggle */}
      {practicePlan.quickWarmUp && (
        <>
          <TouchableOpacity 
            style={styles.quickWarmUpToggle}
            onPress={() => setShowQuickWarmUp(!showQuickWarmUp)}
            activeOpacity={0.7}
          >
            <Ionicons name="time-outline" size={18} color="#F59E0B" />
            <Text style={styles.quickWarmUpToggleText}>
              {showQuickWarmUp ? 'Hide' : 'Show'} 5-Minute Round-Day Warm-Up
            </Text>
            <Ionicons 
              name={showQuickWarmUp ? 'chevron-up' : 'chevron-down'} 
              size={16} 
              color="#9CA3AF" 
            />
          </TouchableOpacity>

          {showQuickWarmUp && (
            <View style={styles.quickWarmUp}>
              <Text style={styles.quickWarmUpTitle}>Round-Day Quick Version</Text>
              <Text style={styles.quickWarmUpDuration}>{practicePlan.quickWarmUp.duration}</Text>
              {practicePlan.quickWarmUp.steps.map((step, index) => (
                <View key={index} style={styles.step}>
                  <View style={styles.stepBullet} />
                  <Text style={styles.stepText}>{step}</Text>
                </View>
              ))}
              <Text style={styles.quickWarmUpNote}>
                Focus on feel and commitment, not perfection
              </Text>
            </View>
          )}
        </>
      )}

      {(onShare || onExportPdf) && (
        <View style={styles.actionRow}>
          {onShare && (
            <TouchableOpacity style={styles.actionButton} onPress={onShare}>
              <Ionicons name="share-outline" size={16} color="#10B981" />
              <Text style={styles.actionButtonText}>Share</Text>
            </TouchableOpacity>
          )}
          {onExportPdf && (
            <TouchableOpacity style={styles.actionButton} onPress={onExportPdf}>
              <Ionicons name="document-text-outline" size={16} color="#10B981" />
              <Text style={styles.actionButtonText}>Export PDF</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#374151',
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
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  duration: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  drill: {
    marginBottom: 20,
  },
  drillHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  drillCheckbox: {
    padding: 6,
  },
  drillHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  drillNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E5E7EB',
  },
  drillDuration: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  drillSteps: {
    gap: 8,
    marginLeft: 48,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  stepBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#6B7280',
    marginTop: 6,
  },
  stepText: {
    flex: 1,
    fontSize: 14,
    color: '#D1D5DB',
    lineHeight: 20,
  },
  constraints: {
    marginTop: 12,
    marginLeft: 48,
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    padding: 10,
    borderRadius: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#10B981',
    gap: 6,
  },
  constraintItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  constraintText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#10B981',
  },
  quickWarmUpToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#111827',
    borderRadius: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  quickWarmUpToggleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9CA3AF',
    flex: 1,
  },
  quickWarmUp: {
    backgroundColor: '#111827',
    padding: 16,
    borderRadius: 10,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#374151',
  },
  quickWarmUpTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F59E0B',
    marginBottom: 4,
  },
  quickWarmUpDuration: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 12,
  },
  quickWarmUpNote: {
    fontSize: 12,
    color: '#6B7280',
    fontStyle: 'italic',
    marginTop: 12,
    textAlign: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#10B981',
  },
});
