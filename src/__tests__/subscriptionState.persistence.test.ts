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
    setItem: jest.fn((k: string, v: string) => {
      mockStore[k] = v;
      return Promise.resolve();
    }),
    removeItem: jest.fn((k: string) => {
      delete mockStore[k];
      return Promise.resolve();
    }),
  },
}));

let mockTrialRoundsUsed = 0;
jest.mock('../services/trialService', () => ({
  TRIAL_LIMIT_COUNT: 3,
  loadTrialCount: jest.fn(() => Promise.resolve(mockTrialRoundsUsed)),
  getTrialRoundsUsed: jest.fn(() => mockTrialRoundsUsed),
}));

import {
  clearProEntitlement,
  getSubscriptionState,
  markUpgradePromptShownThisSession,
  resetUpgradePromptSession,
  saveSubscriptionState,
  setProEntitlement,
  shouldShowUpgradePromptThisSession,
} from '../services/subscriptionService';

const SUBSCRIPTION_STATE_KEY = '@GolfSum:subscriptionState';

describe('subscriptionService persistence + derivation', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStore)) delete mockStore[key];
    mockTrialRoundsUsed = 0;
  });

  it('returns default free state when nothing is stored', async () => {
    const state = await getSubscriptionState();
    expect(state.tier).toBe('free');
    expect(state.trialRoundsUsed).toBe(0);
    expect(state.trialRoundsRemaining).toBe(3);
    expect(state.hasTrialRemaining).toBe(true);
  });

  it('uses trial rounds from trialService even if stored value differs', async () => {
    mockStore[SUBSCRIPTION_STATE_KEY] = JSON.stringify({
      tier: 'pro',
      trialRoundsUsed: 0,
      proExpiresAt: null,
      proCancelledAt: null,
      purchaseToken: null,
    });
    mockTrialRoundsUsed = 2;

    const state = await getSubscriptionState();
    expect(state.trialRoundsUsed).toBe(2);
    expect(state.trialRoundsRemaining).toBe(1);
  });

  it('falls back to default when stored JSON is corrupted', async () => {
    mockStore[SUBSCRIPTION_STATE_KEY] = '{bad-json';
    mockTrialRoundsUsed = 1;
    const state = await getSubscriptionState();
    expect(state.tier).toBe('free');
    expect(state.trialRoundsUsed).toBe(1);
  });

  it('saveSubscriptionState persists and derives active pro when expiry is in future', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const state = await saveSubscriptionState({
      tier: 'pro',
      proExpiresAt: future,
      purchaseToken: 'tok_123',
    });
    expect(state.tier).toBe('pro');
    expect(state.isProActive).toBe(true);
    expect(state.purchaseToken).toBe('tok_123');
  });

  it('setProEntitlement sets pro fields and clearProEntitlement resets them', async () => {
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const active = await setProEntitlement({
      proExpiresAt: future,
      purchaseToken: 'receipt_abc',
      cancelledAt: null,
    });
    expect(active.tier).toBe('pro');
    expect(active.isProActive).toBe(true);

    const cleared = await clearProEntitlement();
    expect(cleared.tier).toBe('free');
    expect(cleared.proExpiresAt).toBeNull();
    expect(cleared.purchaseToken).toBeNull();
  });

  it('upgrade prompt session toggles correctly', async () => {
    expect(await shouldShowUpgradePromptThisSession()).toBe(true);
    await markUpgradePromptShownThisSession();
    expect(await shouldShowUpgradePromptThisSession()).toBe(false);
    await resetUpgradePromptSession();
    expect(await shouldShowUpgradePromptThisSession()).toBe(true);
  });
});

