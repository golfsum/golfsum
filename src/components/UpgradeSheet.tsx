import React, { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from './ui/BottomSheet';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { purchaseProAnnual, restorePurchasesAndSync } from '../services/billingService';
import { FEEDBACK_COPY } from '../constants/feedbackCopy';
import { logEvent } from '../services/analyticsEventsService';

export type UpgradeTrigger =
  | 'detailed_toggle'
  | 'score_entry_lock'
  | 'insights_card'
  | 'post_round'
  | 'nudge_card'
  | 'trial_banner'
  | 'trial_ended_card'
  | 'scorecard_import'
  | 'averages_tab'
  | 'profile';

interface UpgradeSheetProps {
  visible: boolean;
  trigger: UpgradeTrigger;
  onClose: () => void;
}

const FEATURES = [
  'Live GPS yardages during your round',
  'Advanced scoring with directional tracking',
  'Coaching tips from your rounds',
  'Hole notes and yardage book',
  'Club distances by club',
  'Round history and stat trends',
];
const COPY_VARIANT = 'upgrade_sheet_v1';

const COPY_BY_TRIGGER: Record<UpgradeTrigger, { title: string; subtitle: string }> = {
  detailed_toggle: {
    title: 'Detailed Scoring',
    subtitle: 'Add FIR and GIR direction, scrambling, and penalties to each round.',
  },
  score_entry_lock: {
    title: 'Full Hole Tracking',
    subtitle: 'Add directional stats and see where shots are getting away from you.',
  },
  insights_card: {
    title: 'More Round History',
    subtitle: 'More rounds give you a clearer picture of your game.',
  },
  post_round: {
    title: 'Post-Round Breakdown',
    subtitle: 'See the fairway, GIR, and club details behind your score.',
  },
  nudge_card: {
    title: 'In-Round Tips',
    subtitle: 'Use your rounds to get better tips during the round.',
  },
  trial_banner: {
    title: 'Keep Advanced Tracking',
    subtitle: 'Keep building your round history each time you play.',
  },
  trial_ended_card: {
    title: 'Keep Going After Trial',
    subtitle: 'Your trial stats are saved. Keep adding rounds to build them out.',
  },
  scorecard_import: {
    title: 'Imported Round Stats',
    subtitle: 'Keep the fairways, greens, and penalties from imported rounds.',
  },
  averages_tab: {
    title: 'Advanced Averages',
    subtitle: 'See fairway, GIR, and short-game averages together.',
  },
  profile: {
    title: 'Full Stat Tracking',
    subtitle: 'Keep fairways, greens, penalties, and hole-by-hole stats together.',
  },
};

export default function UpgradeSheet({ visible, trigger, onClose }: UpgradeSheetProps) {
  const [isBusy, setIsBusy] = useState(false);
  const hasLoggedVisibleRef = useRef(false);
  const copy = COPY_BY_TRIGGER[trigger];

  useEffect(() => {
    if (visible && !hasLoggedVisibleRef.current) {
      logEvent('upgrade_sheet_shown', { trigger, copy_variant: COPY_VARIANT });
      hasLoggedVisibleRef.current = true;
    }
    if (!visible) {
      hasLoggedVisibleRef.current = false;
    }
  }, [trigger, visible]);

  const handleSubscribe = async () => {
    setIsBusy(true);
    const ok = await purchaseProAnnual();
    setIsBusy(false);
    if (ok) {
      logEvent('upgrade_sheet_converted', { trigger, copy_variant: COPY_VARIANT });
      Alert.alert(FEEDBACK_COPY.alerts.golfSumProUnlockedTitle, FEEDBACK_COPY.alerts.golfSumProUnlockedBody);
      onClose();
      return;
    }
    Alert.alert(FEEDBACK_COPY.alerts.purchaseNotCompletedTitle, FEEDBACK_COPY.alerts.purchaseNotCompletedBody);
  };

  const handleRestore = async () => {
    setIsBusy(true);
    const restored = await restorePurchasesAndSync();
    setIsBusy(false);
    if (restored) {
      Alert.alert(FEEDBACK_COPY.alerts.purchaseRestoredTitle, FEEDBACK_COPY.alerts.purchaseRestoredBody);
      onClose();
      return;
    }
    Alert.alert(FEEDBACK_COPY.alerts.nothingToRestoreTitle, FEEDBACK_COPY.alerts.nothingToRestoreBody);
  };

  const handleDismiss = () => {
    logEvent('upgrade_sheet_dismissed', { trigger, copy_variant: COPY_VARIANT });
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={handleDismiss}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.handle} />
        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.price}>$69.99/year</Text>
        <Text style={styles.subtitle}>{copy.subtitle}</Text>

        <View style={styles.featureList}>
          {FEATURES.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.brand.primary} />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.anchor}>$5.83 a month when paid yearly</Text>

        <TouchableOpacity style={styles.primaryButton} onPress={handleSubscribe} disabled={isBusy}>
          <Text style={styles.primaryButtonText}>
            {isBusy ? FEEDBACK_COPY.actions.pleaseWait : 'Start yearly plan'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleRestore} disabled={isBusy}>
          <Text style={styles.link}>Restore purchase</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleDismiss}>
          <Text style={styles.linkMuted}>Not now</Text>
        </TouchableOpacity>
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xl,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#374151',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.displaySm,
    color: colors.text.primary,
    textAlign: 'center',
  },
  price: {
    ...typography.bodyLg,
    color: colors.brand.primary,
    textAlign: 'center',
    fontWeight: '700',
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  featureList: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  featureText: {
    ...typography.bodyMd,
    color: colors.text.primary,
    flex: 1,
  },
  anchor: {
    ...typography.bodySm,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  primaryButton: {
    backgroundColor: colors.brand.primary,
    borderRadius: radius.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  link: {
    ...typography.bodySm,
    color: colors.text.secondary,
    textAlign: 'center',
    textDecorationLine: 'underline',
    marginTop: spacing.sm,
  },
  linkMuted: {
    ...typography.bodyMd,
    color: colors.text.tertiary,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
