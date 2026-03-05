import Storage from './storage';
import {
  TRIAL_LIMIT_COUNT,
  getTrialRoundsUsed,
  loadTrialCount,
} from './trialService';

const SUBSCRIPTION_STATE_KEY = '@GolfSum:subscriptionState';
const UPGRADE_PROMPT_SEEN_KEY = '@GolfSum:upgradePromptSeenSession';

export type SubscriptionTier = 'free' | 'pro';

export interface SubscriptionState {
  tier: SubscriptionTier;
  trialRoundsUsed: number;
  trialRoundsTotal: number;
  proExpiresAt: string | null;
  proCancelledAt: string | null;
  purchaseToken: string | null;
}

export interface DerivedSubscriptionState extends SubscriptionState {
  isProActive: boolean;
  hasTrialRemaining: boolean;
  trialRoundsRemaining: number;
  canUseAdvanced: boolean;
  isLapsed: boolean;
}

export type GateFeature =
  | 'basic_scoring'
  | 'scorecard_import'
  | 'scoring_trends'
  | 'putt_averages'
  | 'course_database'
  | 'round_history'
  | 'generic_nudges'
  | 'advanced_scoring'
  | 'coaching_insights'
  | 'course_analytics'
  | 'data_export'
  | 'weather';

function nowMs() {
  return Date.now();
}

function parseMs(value: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function defaultState(trialRoundsUsed: number): SubscriptionState {
  return {
    tier: 'free',
    trialRoundsUsed: Math.max(0, Math.min(TRIAL_LIMIT_COUNT, trialRoundsUsed)),
    trialRoundsTotal: TRIAL_LIMIT_COUNT,
    proExpiresAt: null,
    proCancelledAt: null,
    purchaseToken: null,
  };
}

function withDerived(state: SubscriptionState): DerivedSubscriptionState {
  const expiresMs = parseMs(state.proExpiresAt);
  const isProActive = state.tier === 'pro' && expiresMs !== null && expiresMs > nowMs();
  const trialRoundsRemaining = Math.max(0, state.trialRoundsTotal - state.trialRoundsUsed);
  const hasTrialRemaining = trialRoundsRemaining > 0;
  const canUseAdvanced = isProActive || hasTrialRemaining;
  const isLapsed = !isProActive && parseMs(state.proExpiresAt) !== null;

  return {
    ...state,
    isProActive,
    hasTrialRemaining,
    trialRoundsRemaining,
    canUseAdvanced,
    isLapsed,
  };
}

export async function getSubscriptionState(): Promise<DerivedSubscriptionState> {
  await loadTrialCount();
  const trialRoundsUsed = getTrialRoundsUsed();

  try {
    const raw = await Storage.getItem(SUBSCRIPTION_STATE_KEY);
    if (!raw) return withDerived(defaultState(trialRoundsUsed));

    const parsed = JSON.parse(raw) as Partial<SubscriptionState>;
    const merged: SubscriptionState = {
      ...defaultState(trialRoundsUsed),
      ...parsed,
      trialRoundsUsed: Math.max(0, Math.min(TRIAL_LIMIT_COUNT, trialRoundsUsed)),
      trialRoundsTotal: TRIAL_LIMIT_COUNT,
    };
    return withDerived(merged);
  } catch {
    return withDerived(defaultState(trialRoundsUsed));
  }
}

export async function saveSubscriptionState(
  updates: Partial<SubscriptionState>
): Promise<DerivedSubscriptionState> {
  const current = await getSubscriptionState();
  const next: SubscriptionState = {
    tier: current.tier,
    proExpiresAt: current.proExpiresAt,
    proCancelledAt: current.proCancelledAt,
    purchaseToken: current.purchaseToken,
    ...updates,
    trialRoundsUsed: Math.max(
      0,
      Math.min(TRIAL_LIMIT_COUNT, updates.trialRoundsUsed ?? current.trialRoundsUsed)
    ),
    trialRoundsTotal: TRIAL_LIMIT_COUNT,
  };
  await Storage.setItem(SUBSCRIPTION_STATE_KEY, JSON.stringify(next));
  return withDerived(next);
}

export async function setProEntitlement(payload: {
  proExpiresAt: string;
  purchaseToken?: string | null;
  cancelledAt?: string | null;
}): Promise<DerivedSubscriptionState> {
  return saveSubscriptionState({
    tier: 'pro',
    proExpiresAt: payload.proExpiresAt,
    proCancelledAt: payload.cancelledAt ?? null,
    purchaseToken: payload.purchaseToken ?? null,
  });
}

export async function clearProEntitlement(): Promise<DerivedSubscriptionState> {
  return saveSubscriptionState({
    tier: 'free',
    proExpiresAt: null,
    proCancelledAt: null,
    purchaseToken: null,
  });
}

export function canAccessFeature(
  feature: GateFeature,
  state: DerivedSubscriptionState
): boolean {
  const freeFeatures: GateFeature[] = [
    'basic_scoring',
    'scorecard_import',
    'scoring_trends',
    'putt_averages',
    'course_database',
    'round_history',
    'generic_nudges',
  ];
  if (freeFeatures.includes(feature)) return true;
  return state.canUseAdvanced;
}

export async function shouldShowUpgradePromptThisSession(): Promise<boolean> {
  const seen = await Storage.getItem(UPGRADE_PROMPT_SEEN_KEY);
  return seen !== '1';
}

export async function markUpgradePromptShownThisSession(): Promise<void> {
  await Storage.setItem(UPGRADE_PROMPT_SEEN_KEY, '1');
}

export async function resetUpgradePromptSession(): Promise<void> {
  await Storage.removeItem(UPGRADE_PROMPT_SEEN_KEY);
}
