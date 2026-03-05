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
  'Advanced scoring with directional tracking',
  'AI coaching insights from your patterns',
  'Course-specific strategy cards',
  'Digital yardage book (hole notes)',
  'Club performance analysis',
];
const COPY_VARIANT = 'upgrade_sheet_v1';

const COPY_BY_TRIGGER: Record<UpgradeTrigger, { title: string; subtitle: string }> = {
  detailed_toggle: {
    title: 'Unlock Detailed Scoring',
    subtitle: 'Track FIR/GIR direction, scrambling, and penalties in every round.',
  },
  score_entry_lock: {
    title: 'Unlock Full Hole Tracking',
    subtitle: 'Capture directional stats and get better coaching from each hole.',
  },
  insights_card: {
    title: 'Unlock New Insights',
    subtitle: 'Your pattern is forming. Keep tracking to unlock sharper coaching.',
  },
  post_round: {
    title: 'Unlock Post-Round Analysis',
    subtitle: 'See the fairway, GIR, and club details that explain your score.',
  },
  nudge_card: {
    title: 'Unlock Data-Driven Nudges',
    subtitle: 'Turn pre-round tips into personalized coaching from your stats.',
  },
  trial_banner: {
    title: 'Keep Advanced Tracking',
    subtitle: 'You still have trial momentum. Keep building your patterns.',
  },
  trial_ended_card: {
    title: 'Continue After Trial',
    subtitle: 'Your trial insights are saved. Upgrade to keep them fresh each round.',
  },
  scorecard_import: {
    title: 'Unlock Full Import Insights',
    subtitle: 'Use imported rounds plus detailed stats to power full coaching.',
  },
  averages_tab: {
    title: 'Unlock Advanced Averages',
    subtitle: 'View full ball-striking trends and deeper stat breakdowns.',
  },
  profile: {
    title: 'Unlock GolfSum Pro',
    subtitle: 'Upgrade anytime to enable full tracking and coaching features.',
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
        <Text style={styles.price}>$49.99/year</Text>
        <Text style={styles.subtitle}>{copy.subtitle}</Text>

        <View style={styles.featureList}>
          {FEATURES.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <Ionicons name="checkmark-circle" size={18} color={colors.brand.primary} />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.anchor}>$4.17/month — less than a sleeve of Pro V1s</Text>

        <TouchableOpacity style={styles.primaryButton} onPress={handleSubscribe} disabled={isBusy}>
          <Text style={styles.primaryButtonText}>
            {isBusy ? FEEDBACK_COPY.actions.pleaseWait : 'Upgrade to Pro'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleRestore} disabled={isBusy}>
          <Text style={styles.link}>Restore Purchase</Text>
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
