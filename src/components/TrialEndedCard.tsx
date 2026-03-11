/**
 * TrialEndedCard - Shown on premium screens after the 3-round trial expires.
 *
 * Shows the user's own stats from trial rounds as motivation to subscribe.
 * Primary CTA navigates to the Profile tab (where subscription will live).
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface TrialEndedCardProps {
  /** User's actual stats from trial rounds - shown as motivation */
  statLine?: string;
  onUpgrade: () => void;
}

export const TrialEndedCard: React.FC<TrialEndedCardProps> = ({
  statLine,
  onUpgrade,
}) => (
  <View style={styles.container}>
    <View style={styles.iconRow}>
      <View style={styles.iconCircle}>
        <Ionicons name="lock-closed" size={24} color="#F59E0B" />
      </View>
    </View>

    <Text style={styles.title}>Your free preview is complete</Text>
    <Text style={styles.subtitle}>
      You tracked 3 rounds with full stat analysis. Upgrade to keep tracking fairways, greens, scrambling, and more.
    </Text>

    {statLine && (
      <View style={styles.statPreview}>
        <Text style={styles.statPreviewText}>{statLine}</Text>
      </View>
    )}

    <TouchableOpacity style={styles.upgradeButton} onPress={onUpgrade} activeOpacity={0.8}>
      <Ionicons name="sparkles" size={16} color="#0f1419" />
      <Text style={styles.upgradeText}>Upgrade to Pro</Text>
    </TouchableOpacity>

    <Text style={styles.pricingHint}>$69.99/year</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  iconRow: { marginBottom: 16 },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontSize: 20, fontWeight: '700', color: '#E5E7EB',
    textAlign: 'center', marginBottom: 8,
  },
  subtitle: {
    fontSize: 14, color: '#9CA3AF', textAlign: 'center',
    lineHeight: 20, marginBottom: 16,
  },
  statPreview: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16,
    marginBottom: 20, borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  statPreviewText: {
    fontSize: 13, color: '#10B981', fontWeight: '500', textAlign: 'center',
  },
  upgradeButton: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#10B981', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 32,
    marginBottom: 8,
  },
  upgradeText: { fontSize: 16, fontWeight: '700', color: '#0f1419' },
  pricingHint: { fontSize: 12, color: '#6B7280' },
});
