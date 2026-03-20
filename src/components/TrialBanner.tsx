/**
 * TrialBanner - Shows trial progress during the 3-round experience.
 *
 * Variants:
 *  - During trial (rounds 1-3): "2 of 3 advanced rounds used"
 *  - Trial just ended (round 4): "Advanced preview complete"
 *
 * Non-intrusive: small bar, no modal.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface TrialBannerProps {
  trialRoundsUsed: number;
  trialLimit: number;
  /** Only shown when trial is active, not after expiry */
  variant: 'in-trial' | 'ended';
  /** Called when user taps the banner after trial ends */
  onUpgrade?: () => void;
}

export const TrialBanner: React.FC<TrialBannerProps> = ({
  trialRoundsUsed,
  trialLimit,
  variant,
  onUpgrade,
}) => {
  if (variant === 'in-trial') {
    const used = Math.max(0, Math.min(trialRoundsUsed, trialLimit));
    return (
      <View style={styles.bannerActive}>
        <Ionicons name="sparkles" size={14} color="#10B981" />
        <Text style={styles.bannerActiveText}>
          {used} of {trialLimit} advanced rounds used
        </Text>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.bannerEnded}
      onPress={onUpgrade}
      activeOpacity={0.7}
    >
      <Ionicons name="information-circle-outline" size={14} color="#9CA3AF" />
      <Text style={styles.bannerEndedText}>
        Advanced preview is done. Basic scoring stays on.
      </Text>
      <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  bannerActive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  bannerActiveText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#10B981',
  },
  bannerEnded: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(156, 163, 175, 0.08)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(156, 163, 175, 0.2)',
  },
  bannerEndedText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#9CA3AF',
    flex: 1,
  },
});
