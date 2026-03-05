/**
 * subscriptionService.test.ts
 *
 * Guards canAccessFeature() — the single function that separates free from paid.
 * Drop into src/__tests__/subscriptionService.test.ts
 */

// -- Mocks --------------------------------------------------------------------

jest.mock('../services/firebase', () => ({
  db: null,
  isFirebaseEnabled: false,
  auth: { currentUser: null },
}));

const mockStore: Record<string, string> = {};
jest.mock('../services/storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((k: string) => Promise.resolve(mockStore[k] ?? null)),
    setItem: jest.fn((k: string, v: string) => { mockStore[k] = v; return Promise.resolve(); }),
    removeItem: jest.fn((k: string) => { delete mockStore[k]; return Promise.resolve(); }),
  },
}));

jest.mock('../utils/logger', () => ({ logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

// trialService is imported by subscriptionService; mock it so we control trial state
let mockTrialRoundsUsed = 0;
jest.mock('../services/trialService', () => ({
  TRIAL_LIMIT_COUNT: 3,
  loadTrialCount: jest.fn(() => Promise.resolve(mockTrialRoundsUsed)),
  getTrialRoundsUsed: jest.fn(() => mockTrialRoundsUsed),
  isInTrial: jest.fn(() => mockTrialRoundsUsed < 3),
  getTrialRoundsRemaining: jest.fn(() => Math.max(0, 3 - mockTrialRoundsUsed)),
  incrementTrialRound: jest.fn(),
}));

import {
  canAccessFeature,
  type GateFeature,
  type DerivedSubscriptionState,
  type SubscriptionTier,
} from '../services/subscriptionService';

// -- Helpers ------------------------------------------------------------------

const FUTURE = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

function makeState(overrides: {
  tier?: SubscriptionTier;
  trialRoundsUsed?: number;
  proExpiresAt?: string | null;
}): DerivedSubscriptionState {
  const tier = overrides.tier ?? 'free';
  const trialRoundsUsed = overrides.trialRoundsUsed ?? 0;
  const trialRoundsTotal = 3;
  const proExpiresAt = overrides.proExpiresAt ?? null;

  const expiresMs = proExpiresAt ? new Date(proExpiresAt).getTime() : null;
  const isProActive = tier === 'pro' && expiresMs !== null && expiresMs > Date.now();
  const trialRoundsRemaining = Math.max(0, trialRoundsTotal - trialRoundsUsed);
  const hasTrialRemaining = trialRoundsRemaining > 0;
  const canUseAdvanced = isProActive || hasTrialRemaining;
  const isLapsed = !isProActive && expiresMs !== null;

  return {
    tier,
    trialRoundsUsed,
    trialRoundsTotal,
    proExpiresAt,
    proCancelledAt: null,
    purchaseToken: null,
    isProActive,
    hasTrialRemaining,
    trialRoundsRemaining,
    canUseAdvanced,
    isLapsed,
  };
}

const FREE_FEATURES: GateFeature[] = [
  'basic_scoring',
  'scorecard_import',
  'scoring_trends',
  'putt_averages',
  'course_database',
  'round_history',
  'generic_nudges',
];

const PREMIUM_FEATURES: GateFeature[] = [
  'advanced_scoring',
  'coaching_insights',
  'course_analytics',
  'data_export',
  'weather',
];

// -- Tests --------------------------------------------------------------------

describe('canAccessFeature() — free features', () => {
  it('always grants free features regardless of subscription state', () => {
    const states = [
      makeState({ tier: 'free', trialRoundsUsed: 0 }),
      makeState({ tier: 'free', trialRoundsUsed: 3 }),
      makeState({ tier: 'pro', proExpiresAt: PAST }),
      makeState({ tier: 'pro', proExpiresAt: FUTURE }),
    ];

    for (const state of states) {
      for (const feature of FREE_FEATURES) {
        expect(canAccessFeature(feature, state)).toBe(true);
      }
    }
  });
});

describe('canAccessFeature() — premium features with trial remaining', () => {
  it('grants premium access when 0 trial rounds used (full trial)', () => {
    const state = makeState({ tier: 'free', trialRoundsUsed: 0 });
    for (const f of PREMIUM_FEATURES) {
      expect(canAccessFeature(f, state)).toBe(true);
    }
  });

  it('grants premium access when 1 trial round used', () => {
    const state = makeState({ tier: 'free', trialRoundsUsed: 1 });
    for (const f of PREMIUM_FEATURES) {
      expect(canAccessFeature(f, state)).toBe(true);
    }
  });

  it('grants premium access when 2 trial rounds used (1 remaining)', () => {
    const state = makeState({ tier: 'free', trialRoundsUsed: 2 });
    for (const f of PREMIUM_FEATURES) {
      expect(canAccessFeature(f, state)).toBe(true);
    }
  });
});

describe('canAccessFeature() — premium features with trial exhausted', () => {
  it('denies premium access when all 3 trial rounds are used', () => {
    const state = makeState({ tier: 'free', trialRoundsUsed: 3 });
    for (const f of PREMIUM_FEATURES) {
      expect(canAccessFeature(f, state)).toBe(false);
    }
  });

  it('derived state: hasTrialRemaining is false at limit', () => {
    const state = makeState({ tier: 'free', trialRoundsUsed: 3 });
    expect(state.hasTrialRemaining).toBe(false);
    expect(state.trialRoundsRemaining).toBe(0);
    expect(state.canUseAdvanced).toBe(false);
  });
});

describe('canAccessFeature() — active pro subscription', () => {
  it('grants premium access with tier=pro and future expiry', () => {
    const state = makeState({ tier: 'pro', proExpiresAt: FUTURE, trialRoundsUsed: 3 });
    expect(state.isProActive).toBe(true);
    for (const f of PREMIUM_FEATURES) {
      expect(canAccessFeature(f, state)).toBe(true);
    }
  });

  it('also grants free features to active pro', () => {
    const state = makeState({ tier: 'pro', proExpiresAt: FUTURE });
    for (const f of FREE_FEATURES) {
      expect(canAccessFeature(f, state)).toBe(true);
    }
  });
});

describe('canAccessFeature() — expired pro (lapsed)', () => {
  it('denies premium access with tier=pro and past expiry (and no trial remaining)', () => {
    const state = makeState({ tier: 'pro', proExpiresAt: PAST, trialRoundsUsed: 3 });
    expect(state.isProActive).toBe(false);
    expect(state.isLapsed).toBe(true);
    for (const f of PREMIUM_FEATURES) {
      expect(canAccessFeature(f, state)).toBe(false);
    }
  });

  it('still grants free features to lapsed pro', () => {
    const state = makeState({ tier: 'pro', proExpiresAt: PAST, trialRoundsUsed: 3 });
    for (const f of FREE_FEATURES) {
      expect(canAccessFeature(f, state)).toBe(true);
    }
  });

  it('grants premium access to lapsed pro if trial rounds remain', () => {
    const state = makeState({ tier: 'pro', proExpiresAt: PAST, trialRoundsUsed: 1 });
    expect(state.isLapsed).toBe(true);
    expect(state.hasTrialRemaining).toBe(true);
    for (const f of PREMIUM_FEATURES) {
      expect(canAccessFeature(f, state)).toBe(true);
    }
  });
});

describe('DerivedSubscriptionState edge cases', () => {
  it('proExpiresAt exactly now is treated as expired', () => {
    const almostNow = new Date(Date.now() - 1).toISOString();
    const state = makeState({ tier: 'pro', proExpiresAt: almostNow, trialRoundsUsed: 3 });
    expect(state.isProActive).toBe(false);
  });

  it('null proExpiresAt for pro tier means not active', () => {
    const state = makeState({ tier: 'pro', proExpiresAt: null, trialRoundsUsed: 3 });
    expect(state.isProActive).toBe(false);
    expect(state.isLapsed).toBe(false);
  });

  it('trialRoundsRemaining clamps to 0, never negative', () => {
    const state = makeState({ tier: 'free', trialRoundsUsed: 99 });
    expect(state.trialRoundsRemaining).toBe(0);
    expect(state.hasTrialRemaining).toBe(false);
  });

  it('canUseAdvanced is true only if isProActive OR hasTrialRemaining', () => {
    expect(makeState({ tier: 'free', trialRoundsUsed: 0 }).canUseAdvanced).toBe(true);
    expect(makeState({ tier: 'free', trialRoundsUsed: 3 }).canUseAdvanced).toBe(false);
    expect(makeState({ tier: 'pro', proExpiresAt: FUTURE }).canUseAdvanced).toBe(true);
    expect(makeState({ tier: 'pro', proExpiresAt: PAST, trialRoundsUsed: 3 }).canUseAdvanced).toBe(false);
  });
});

describe('GateFeature exhaustiveness', () => {
  it('every known free feature is recognized', () => {
    const state = makeState({ tier: 'free', trialRoundsUsed: 3 });
    for (const f of FREE_FEATURES) {
      expect(() => canAccessFeature(f, state)).not.toThrow();
      expect(canAccessFeature(f, state)).toBe(true);
    }
  });

  it('every known premium feature is denied when no access', () => {
    const state = makeState({ tier: 'free', trialRoundsUsed: 3 });
    for (const f of PREMIUM_FEATURES) {
      expect(() => canAccessFeature(f, state)).not.toThrow();
      expect(canAccessFeature(f, state)).toBe(false);
    }
  });
});
