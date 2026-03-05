import { useCallback, useEffect, useState } from 'react';
import {
  canAccessFeature,
  DerivedSubscriptionState,
  getSubscriptionState,
} from '../services/subscriptionService';

/**
 * Features that require the "GolfSum Pro" entitlement.
 * Always-free features (score, putts, round history, handicap, manual course entry,
 * profile, OCR scan + course detail extraction) are NOT listed here.
 */
export type PremiumFeature =
  | 'fir'
  | 'gir'
  | 'scrambling'
  | 'approach_distance'
  | 'clubs'
  | 'penalties'
  | 'bunkers'
  | 'coaching_insights'
  | 'averages_full'
  | 'ocr_stat_extraction'
  | 'data_export'
  | 'weather'
  | 'course_analytics'
  | 'shot_heatmap'
  | 'practice_plan';

const FEATURE_MAP: Record<PremiumFeature, 'advanced_scoring' | 'coaching_insights' | 'course_analytics' | 'data_export' | 'weather'> = {
  fir: 'advanced_scoring',
  gir: 'advanced_scoring',
  scrambling: 'advanced_scoring',
  approach_distance: 'advanced_scoring',
  clubs: 'advanced_scoring',
  penalties: 'advanced_scoring',
  bunkers: 'advanced_scoring',
  coaching_insights: 'coaching_insights',
  averages_full: 'coaching_insights',
  ocr_stat_extraction: 'advanced_scoring',
  data_export: 'data_export',
  weather: 'weather',
  course_analytics: 'course_analytics',
  shot_heatmap: 'coaching_insights',
  practice_plan: 'coaching_insights',
};

/**
 * Hook for checking premium feature access.
 *
 * Access logic:
 *   canAccess = isRevenueCatPremium || trialRoundsUsed < 3
 *
 * When RevenueCat is integrated, replace `isSubscribed` with the real entitlement check.
 * For now, `isSubscribed` is always false - trial is the only path to premium features.
 */
export function useFeatureGate(options?: { refreshKey?: number }) {
  const [subscription, setSubscription] = useState<DerivedSubscriptionState | null>(null);

  // Re-read trial state when refreshKey changes (e.g. after saving a round)
  useEffect(() => {
    const sync = async () => {
      const next = await getSubscriptionState();
      setSubscription(next);
    };
    sync();
  }, [options?.refreshKey]);

  const inTrialNow = subscription?.hasTrialRemaining ?? false;
  const isPremium = subscription?.canUseAdvanced ?? false;
  const isPro = subscription?.isProActive ?? false;

  const canAccess = useCallback(
    (feature: PremiumFeature): boolean => {
      if (!subscription) return false;
      return canAccessFeature(FEATURE_MAP[feature], subscription);
    },
    [subscription]
  );

  const requirePremium = useCallback(
    async (feature: PremiumFeature): Promise<boolean> => {
      const current = await getSubscriptionState();
      setSubscription(current);
      return canAccessFeature(FEATURE_MAP[feature], current);
    },
    []
  );

  return {
    isPremium,
    isPro,
    canAccess,
    requirePremium,
    trialRoundsUsed: subscription?.trialRoundsUsed ?? 0,
    trialRoundsRemaining: subscription?.trialRoundsRemaining ?? 0,
    inTrial: inTrialNow,
    trialLimit: subscription?.trialRoundsTotal ?? 3,
    isLapsed: subscription?.isLapsed ?? false,
    refreshTrial: async () => {
      const next = await getSubscriptionState();
      setSubscription(next);
    },
  };
}
