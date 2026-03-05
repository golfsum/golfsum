/**
 * Pattern Insight Card Component
 * 
 * Displays detailed, educational insights based on tracked patterns
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PatternInsight } from '../services/patternInsights';

interface Props {
  insight: PatternInsight;
  isExpanded?: boolean;
  coachView?: boolean;
  playerTier?: PlayerTier;
}

export type PlayerTier = 'high' | 'mid' | 'low';

export const PatternInsightCard: React.FC<Props> = ({
  insight,
  isExpanded: defaultExpanded = false,
  coachView = false,
  playerTier = 'high',
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [showConfidenceInfo, setShowConfidenceInfo] = useState(false);

  const coachResources = getCoachResources(insight.type, playerTier);
  const coachFixes = getCoachFixes(insight.type);
  const coachDrills = getCoachDrills(insight.type);

  const getConfidenceTooltip = (stars: number): string => {
    switch (stars) {
      case 1:
        return 'Limited data so far. This insight may change as more shots are recorded.';
      case 2:
        return 'A possible trend is forming, but more data is needed to confirm it.';
      case 3:
        return 'This pattern appears consistently and is likely affecting performance.';
      case 4:
        return 'A clear and consistent pattern across multiple rounds.';
      case 5:
        return 'This is a dominant pattern and a high-impact area to focus on.';
      default:
        return '';
    }
  };

  const getCategoryIcon = (): keyof typeof Ionicons.glyphMap => {
    const type = insight.type;
    if (type.includes('FAIRWAY')) return 'golf-outline';
    if (type.includes('GREEN') || type.includes('APPROACH')) return 'flag-outline';
    if (type.includes('PUTT')) return 'ellipse-outline';
    if (type.includes('PENALTY')) return 'warning-outline';
    if (type.includes('WIND')) return 'leaf-outline';
    return 'analytics-outline';
  };

  const getCategoryColor = (): string => {
    const type = insight.type;
    if (type.includes('FAIRWAY')) return '#3B82F6';
    if (type.includes('GREEN') || type.includes('APPROACH')) return '#10B981';
    if (type.includes('PUTT')) return '#8B5CF6';
    if (type.includes('PENALTY')) return '#EF4444';
    if (type.includes('WIND')) return '#6B7280';
    return '#F59E0B';
  };

  const getImpactLevel = () => {
    const score = insight.impactScore ?? 0.5;
    if (score >= 0.75) return { label: 'High impact', color: '#EF4444' };
    if (score >= 0.6) return { label: 'Medium impact', color: '#F59E0B' };
    return { label: 'Low impact', color: '#FBBF24' };
  };

  const impact = getImpactLevel();

  return (
    <View style={styles.card}>
      {/* Header */}
      <TouchableOpacity 
        style={styles.header}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <View style={[styles.iconCircle, { backgroundColor: `${getCategoryColor()}20` }]}>
            <Ionicons name={getCategoryIcon()} size={20} color={getCategoryColor()} />
          </View>
          <View style={styles.headerText}>
            <Text style={styles.title}>{insight.title}</Text>
            <Text style={styles.dataSupport}>{insight.dataSupport}</Text>
            {insight.progress && insight.progress.status !== 'INSUFFICIENT_DATA' && (
              <View style={styles.progressBanner}>
                <Text style={styles.progressEmoji}>{insight.progress.emoji}</Text>
                <Text
                  style={[
                    styles.progressMessage,
                    insight.progress.status === 'IMPROVED' && styles.progressImproved,
                    insight.progress.status === 'REGRESSED' && styles.progressRegressed,
                    insight.progress.status === 'UNCHANGED' && styles.progressUnchanged,
                  ]}
                >
                  {insight.progress.message}
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.impactBadge, { borderColor: impact.color, backgroundColor: `${impact.color}20` }]}>
            <Text style={[styles.impactText, { color: impact.color }]}>{impact.label}</Text>
          </View>
          <Ionicons 
            name={isExpanded ? 'chevron-up' : 'chevron-down'} 
            size={20} 
            color="#9CA3AF" 
          />
        </View>
      </TouchableOpacity>

      {/* Collapsed Preview */}
      {!isExpanded && (
        <View style={styles.preview}>
          <Text style={styles.previewText} numberOfLines={2}>
            {insight.patternObserved}
          </Text>
        </View>
      )}

      {/* Expanded Content */}
      {isExpanded && (
        <View style={styles.content}>
          {/* Pattern Observed */}
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Pattern observed</Text>
            <Text style={styles.sectionText}>{insight.patternObserved}</Text>
            
            {/* Start Line Inference (if available) */}
            {insight.startLineInference && (
              <View style={styles.startLineBox}>
                <Ionicons name="analytics-outline" size={14} color="#3B82F6" />
                <Text style={styles.startLineText}>{insight.startLineInference}</Text>
              </View>
            )}
          </View>

          {/* Player View or Coach View */}
          {!coachView ? (
            /* Player View - Simple */
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>What this often indicates</Text>
              <Text style={styles.sectionText}>{insight.whatThisIndicates}</Text>
            </View>
          ) : (
            /* Coach View - Detailed Explanation */
            insight.coachExplanation && (
              <View style={[styles.section, styles.coachSection]}>
                <View style={styles.coachHeader}>
                  <Ionicons name="school" size={16} color="#3B82F6" />
                  <Text style={styles.coachLabel}>Coach Explanation</Text>
                </View>
                <Text style={styles.sectionText}>{insight.coachExplanation}</Text>
              </View>
            )
          )}

          {/* Coach View - Resources and Fixes */}
          {coachView && coachResources.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Coach Resources</Text>
              {coachResources.map((resource) => (
                <TouchableOpacity
                  key={resource.url}
                  style={styles.resourceRow}
                  onPress={() => Linking.openURL(resource.url)}
                >
                  <Ionicons name="logo-youtube" size={16} color="#FF0000" />
                  <Text style={styles.resourceText}>{resource.title}</Text>
                  <Ionicons name="chevron-forward" size={12} color="#6B7280" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {coachView && coachFixes.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Common Fixes</Text>
              {coachFixes.map((fix, index) => (
                <View key={index} style={styles.bulletItem}>
                  <Text style={styles.bullet}>-</Text>
                  <Text style={styles.bulletText}>{fix}</Text>
                </View>
              ))}
            </View>
          )}

          {coachView && coachDrills.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Practice Drills</Text>
              {coachDrills.map((drill, index) => (
                <View key={index} style={styles.bulletItem}>
                  <Text style={styles.checkmark}>*</Text>
                  <Text style={styles.bulletText}>{drill}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Common Contributors */}
          {insight.commonContributors.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Common contributors</Text>
              {insight.commonContributors.map((contributor, index) => (
                <View key={index} style={styles.bulletItem}>
                  <Text style={styles.bullet}>•</Text>
                  <Text style={styles.bulletText}>{contributor}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Common Trap */}
          {insight.commonTrap && (
            <View style={styles.trapSection}>
              <View style={styles.trapHeader}>
                <Ionicons name="alert-circle" size={16} color="#F59E0B" />
                <Text style={styles.trapLabel}>Common trap</Text>
              </View>
              <Text style={styles.trapText}>{insight.commonTrap}</Text>
            </View>
          )}

          {/* What to Work On (Player View) OR Before Next Round (Coach View) */}
          {!coachView && insight.whatToWorkOn.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>What to work on</Text>
              {insight.whatToWorkOn.map((item, index) => (
                <View key={index} style={styles.bulletItem}>
                  <Text style={styles.checkmark}>✓</Text>
                  <Text style={styles.bulletText}>{item}</Text>
                </View>
              ))}
            </View>
          )}
          
          {coachView && insight.beforeNextRound && insight.beforeNextRound.length > 0 && (
            <View style={[styles.section, styles.beforeNextRoundSection]}>
              <View style={styles.beforeNextRoundHeader}>
                <Ionicons name="flag" size={16} color="#10B981" />
                <Text style={styles.beforeNextRoundLabel}>Before Your Next Round</Text>
              </View>
              {insight.beforeNextRound.map((item, index) => (
                <View key={index} style={styles.bulletItem}>
                  <Text style={styles.checkmark}>✓</Text>
                  <Text style={styles.bulletText}>{item}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Scoring Note */}
          {insight.scoringNote && (
            <View style={styles.noteSection}>
              <View style={styles.noteHeader}>
                <Ionicons name="bulb" size={16} color="#10B981" />
                <Text style={styles.noteLabel}>Scoring note</Text>
              </View>
              <Text style={styles.noteText}>{insight.scoringNote}</Text>
            </View>
          )}

          {/* Confidence Indicator with Stars */}
          <View style={styles.confidenceSection}>
            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => (
                <Ionicons
                  key={star}
                  name={star <= insight.stars ? 'star' : 'star-outline'}
                  size={16}
                  color={star <= insight.stars ? '#F59E0B' : '#374151'}
                  style={[
                    styles.star,
                    insight.stars < 3 && star <= insight.stars && styles.starFaded
                  ]}
                />
              ))}
            </View>
            <View style={styles.confidenceLabelRow}>
              <Text style={styles.confidenceLabel}>
                {insight.confidenceLabel}
              </Text>
              <TouchableOpacity 
                onPress={() => setShowConfidenceInfo(!showConfidenceInfo)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons 
                  name="information-circle-outline" 
                  size={14} 
                  color="#6B7280" 
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Confidence Explanation (Collapsible) */}
          {showConfidenceInfo && (
            <View style={styles.confidenceTooltip}>
              <Text style={styles.confidenceTooltipText}>
                {getConfidenceTooltip(insight.stars)}
              </Text>
              <Text style={styles.confidenceTooltipSubtext}>
                Based on sample size, pattern strength, and consistency across rounds.
              </Text>
              
              {/* Debug Info (Optional - only if meta exists) */}
              {insight.meta?.debugInfo && __DEV__ && (
                <View style={styles.debugInfo}>
                  <Text style={styles.debugLabel}>Debug Info:</Text>
                  <Text style={styles.debugText}>
                    Sample: {(insight.meta.debugInfo.sampleScore * 100).toFixed(0)}% • 
                    Pattern: {(insight.meta.debugInfo.patternScore * 100).toFixed(0)}% • 
                    Consistency: {(insight.meta.debugInfo.consistencyScore * 100).toFixed(0)}%
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Strength Badge */}
          <View style={styles.strengthBadge}>
            <Text style={styles.strengthText}>
              {insight.strengthLevel === 'VERY_STRONG' ? 'Very Strong Pattern' :
               insight.strengthLevel === 'STRONG' ? 'Strong Pattern' :
               'Moderate Pattern'}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
};

type CoachResource = {
  title: string;
  url: string;
};

type ChannelConfig = {
  SWING: string;
  SWING_ALT?: string;
  SWING_ALT2?: string;
  SWING_ALT3?: string;
  SWING_ALT4?: string;
  SWING_ALT5?: string;
  SHORT_GAME: string;
  SHORT_GAME_ALT?: string;
  PUTTING: string;
  COURSE_MGT: string;
};

const HIGH_HANDICAP_CHANNELS: ChannelConfig = {
  SWING: 'Danny Maude',
  SWING_ALT: 'Golf with Aimee',
  SWING_ALT2: 'Peter Finch Golf',
  SWING_ALT3: 'Rick Shiels',
  SWING_ALT4: 'Me and My Golf',
  SHORT_GAME: 'Danny Maude',
  PUTTING: 'Me and My Golf',
  COURSE_MGT: 'Rick Shiels',
};

const MID_HANDICAP_CHANNELS: ChannelConfig = {
  SWING: 'Jonathan Kim-Moss',
  SWING_ALT: 'Porzak Golf',
  SWING_ALT2: 'Eric Cogorno',
  SWING_ALT3: 'Shawn Clement',
  SWING_ALT4: 'Athletic Motion Golf',
  SWING_ALT5: 'Chris Ryan Golf',
  SHORT_GAME: 'Porzak Golf',
  PUTTING: 'Dave Pelz',
  COURSE_MGT: 'Eric Cogorno',
};

const LOW_HANDICAP_CHANNELS: ChannelConfig = {
  SWING: 'Eric Cogorno',
  SWING_ALT: 'Athletic Motion Golf',
  SWING_ALT2: 'Chris Ryan Golf',
  SWING_ALT3: 'Porzak Golf',
  SWING_ALT4: 'Padraig Harrington',
  SHORT_GAME: 'Phil Mickelson',
  SHORT_GAME_ALT: 'Porzak Golf',
  PUTTING: 'Dave Pelz',
  COURSE_MGT: 'Eric Cogorno',
};

function buildYouTubeSearchURL(channelName: string, query: string): string {
  const combined = encodeURIComponent(`${query} ${channelName}`);
  return `https://www.youtube.com/results?search_query=${combined}`;
}

function getCoachResources(type: string, tier: PlayerTier = 'high'): CoachResource[] {
  const ch = tier === 'high'
    ? HIGH_HANDICAP_CHANNELS
    : tier === 'mid'
      ? MID_HANDICAP_CHANNELS
      : LOW_HANDICAP_CHANNELS;

  const sliceQuery = tier === 'high'
    ? 'fix slice driver simple drill'
    : tier === 'mid'
      ? 'fix slice clubface path relationship'
      : 'eliminate slice face to path control advanced';

  const hookQuery = tier === 'high'
    ? 'fix hook driver simple'
    : tier === 'mid'
      ? 'fix hook grip clubface control'
      : 'fix hook shallow path sequencing advanced';

  const approachShortQuery = tier === 'high'
    ? 'approach shot distance control take enough club'
    : tier === 'mid'
      ? 'approach distance control yardage gapping irons'
      : 'approach distance control wedge gapping spin control';

  const approachLongQuery = tier === 'high'
    ? 'approach shot too long tempo distance control'
    : tier === 'mid'
      ? 'flyer lie distance control iron tempo'
      : 'flyer lie wedge distance control spin advanced';

  const lagPuttQuery = tier === 'high'
    ? 'lag putting distance control simple drill'
    : 'lag putting speed control distance drills';

  const greenReadQuery = tier === 'high'
    ? 'green reading basics simple'
    : 'green reading slope speed control';

  const penaltyQuery = tier === 'high'
    ? 'course management basics avoid penalty shots'
    : tier === 'mid'
      ? 'course management tee shot strategy'
      : 'course management shot selection decision making advanced';

  const chippingQuery = tier === 'low'
    ? 'art of chipping'
    : 'chipping technique short game around green';

  switch (type) {
    case 'FAIRWAYS_MISSED_RIGHT':
      return [
        {
          title: tier === 'high' ? 'Fix your slice — simple drill' : 'Slice: face-to-path fix',
          url: buildYouTubeSearchURL(ch.SWING, sliceQuery),
        },
        {
          title: 'Clubface control at impact',
          url: buildYouTubeSearchURL(ch.SWING_ALT ?? ch.SWING, 'clubface control impact drill'),
        },
      ];
    case 'FAIRWAYS_MISSED_LEFT':
      return [
        {
          title: tier === 'high' ? 'Fix your hook — simple fixes' : 'Hook: grip and path correction',
          url: buildYouTubeSearchURL(ch.SWING, hookQuery),
        },
        {
          title: 'Grip and face control',
          url: buildYouTubeSearchURL(ch.SWING_ALT2 ?? ch.SWING, 'golf grip neutral fix hook'),
        },
      ];
    case 'APPROACHES_MISSED_SHORT':
      return [
        {
          title: 'Approach distance control',
          url: buildYouTubeSearchURL(ch.SHORT_GAME, approachShortQuery),
        },
        {
          title: 'Club selection and commitment',
          url: buildYouTubeSearchURL(ch.SWING_ALT ?? ch.SWING, 'golf club selection approach iron'),
        },
      ];
    case 'APPROACHES_MISSED_LONG':
      return [
        {
          title: 'Managing flyers and distance control',
          url: buildYouTubeSearchURL(ch.SHORT_GAME, approachLongQuery),
        },
        {
          title: 'Tempo for distance control',
          url: buildYouTubeSearchURL(ch.SWING, 'golf tempo drill distance control iron'),
        },
      ];
    case 'HIGH_THREE_PUTT':
      return [
        {
          title: 'Lag putting speed control',
          url: buildYouTubeSearchURL(ch.PUTTING, lagPuttQuery),
        },
        {
          title: 'Green reading basics',
          url: buildYouTubeSearchURL(ch.PUTTING, greenReadQuery),
        },
      ];
    case 'PENALTIES_HURTING_SCORES':
      return [
        {
          title: 'Course management strategy',
          url: buildYouTubeSearchURL(ch.COURSE_MGT, penaltyQuery),
        },
        {
          title: 'Tee shot target selection',
          url: buildYouTubeSearchURL(ch.COURSE_MGT, 'golf tee shot safe target selection'),
        },
      ];
    case 'CHIPPING_ISSUES':
    case 'UP_DOWN_LOW':
      return [
        {
          title: tier === 'low' ? 'The Art of Chipping — Phil Mickelson' : 'Short game fundamentals',
          url: buildYouTubeSearchURL(ch.SHORT_GAME, chippingQuery),
        },
        {
          title: 'Short game distance control',
          url: buildYouTubeSearchURL(
            ch.SHORT_GAME_ALT ?? ch.SHORT_GAME,
            'short game distance control wedge'
          ),
        },
      ];
    case 'PUTTING_ISSUES':
    case 'PUTTS_ABOVE_BASELINE':
      return [
        {
          title: tier === 'low' ? 'Dave Pelz putting data and drills' : 'Putting fundamentals',
          url: buildYouTubeSearchURL(ch.PUTTING, 'putting stroke fundamentals distance control'),
        },
        {
          title: 'Short putt consistency',
          url: buildYouTubeSearchURL('Dave Pelz', 'putting drills make more putts'),
        },
      ];
    default:
      return [];
  }
}

function getCoachFixes(type: string): string[] {
  switch (type) {
    case 'FAIRWAYS_MISSED_RIGHT':
      return [
        'Check grip strength and clubface alignment at setup.',
        'Focus on a start line rather than the curve.',
        'Avoid aiming further left to fix a slice.',
      ];
    case 'FAIRWAYS_MISSED_LEFT':
      return [
        'Neutralize grip and avoid an overly closed face.',
        'Keep alignment square to the target line.',
        'Do not over-aim right to fix a hook.',
      ];
    case 'APPROACHES_MISSED_SHORT':
      return [
        'Commit to carry yardages and take enough club.',
        'Avoid deceleration through impact.',
        'Aim for the center when in doubt.',
      ];
    case 'APPROACHES_MISSED_LONG':
      return [
        'Account for flyers or downhill lies.',
        'Reduce effort and keep tempo smooth.',
        'Pick a back-edge target on firm greens.',
      ];
    case 'HIGH_THREE_PUTT':
      return [
        'Prioritize speed on putts over 20 feet.',
        'Leave uphill second putts when possible.',
        'Practice distance control from 30-40 feet.',
      ];
    case 'PENALTIES_HURTING_SCORES':
      return [
        'Choose a conservative target off the tee.',
        'Reset after a mistake to avoid compounding.',
        'Favor your stock shot shape.',
      ];
    default:
      return [];
  }
}

function getCoachDrills(type: string): string[] {
  switch (type) {
    case 'FAIRWAYS_MISSED_RIGHT':
    case 'FAIRWAYS_MISSED_LEFT':
      return [
        'Alignment stick start-line drill (10 balls, score start line).',
        'Gate drill with tees to control face angle.',
      ];
    case 'APPROACHES_MISSED_SHORT':
      return [
        'Two-club distance ladder (hit to three targets).',
        'Full-commitment 10-ball carry test.',
      ];
    case 'APPROACHES_MISSED_LONG':
      return [
        'Tempo drill: 3-1 count to smooth swing speed.',
        'Back-edge targeting with a single club.',
      ];
    case 'HIGH_THREE_PUTT':
      return [
        'Ladder drill from 20-40 feet.',
        'Leave-it-short drill: stop within 3 feet.',
      ];
    case 'PENALTIES_HURTING_SCORES':
      return [
        'Tee-shot club selection plan before the round.',
        'Pick a safe miss on every tee shot.',
      ];
    default:
      return [];
  }
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#374151',
    marginBottom: 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  dataSupport: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 6,
  },
  progressBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  progressEmoji: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  progressMessage: {
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  progressImproved: {
    color: '#34C759',
  },
  progressRegressed: {
    color: '#FF9500',
  },
  progressUnchanged: {
    color: '#8E8E93',
  },
  impactBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  impactText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  preview: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  previewText: {
    fontSize: 14,
    color: '#D1D5DB',
    lineHeight: 20,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 16,
  },
  section: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionText: {
    fontSize: 14,
    color: '#E5E7EB',
    lineHeight: 20,
  },
  bulletItem: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  bullet: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 2,
  },
  checkmark: {
    fontSize: 14,
    color: '#10B981',
    marginTop: 2,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    color: '#D1D5DB',
    lineHeight: 20,
  },
  resourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  resourceText: {
    fontSize: 14,
    color: '#93C5FD',
    textDecorationLine: 'underline',
  },
  trapSection: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
    padding: 12,
    borderRadius: 8,
    gap: 6,
  },
  trapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trapLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F59E0B',
    textTransform: 'uppercase',
  },
  trapText: {
    fontSize: 14,
    color: '#FDE68A',
    lineHeight: 20,
  },
  noteSection: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
    padding: 12,
    borderRadius: 8,
    gap: 6,
  },
  noteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  noteLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10B981',
    textTransform: 'uppercase',
  },
  noteText: {
    fontSize: 14,
    color: '#D1FAE5',
    lineHeight: 20,
  },
  confidenceSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#374151',
    marginTop: 12,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  star: {
    // No additional styling needed
  },
  starFaded: {
    opacity: 0.5,
  },
  confidenceLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  confidenceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
  },
  confidenceTooltip: {
    backgroundColor: '#111827',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  confidenceTooltipText: {
    fontSize: 12,
    color: '#D1D5DB',
    lineHeight: 18,
    marginBottom: 6,
  },
  confidenceTooltipSubtext: {
    fontSize: 11,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  debugInfo: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#374151',
  },
  debugLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 4,
  },
  debugText: {
    fontSize: 10,
    color: '#6B7280',
    fontFamily: 'monospace',
  },
  strengthBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 8,
  },
  strengthText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#10B981',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  startLineBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 8,
  },
  startLineText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B82F6',
  },
  coachSection: {
    backgroundColor: 'rgba(59, 130, 246, 0.05)',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
  },
  coachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  coachLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3B82F6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  beforeNextRoundSection: {
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#10B981',
  },
  beforeNextRoundHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  beforeNextRoundLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#10B981',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
