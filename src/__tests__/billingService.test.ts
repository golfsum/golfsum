jest.mock('../services/firebase', () => ({
  db: null,
  isFirebaseEnabled: false,
  auth: { currentUser: null },
}));

jest.mock('../utils/logger', () => ({
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockGetCurrentUser = jest.fn(() => ({ uid: 'user-1' }));
jest.mock('../services/firebaseAuthService', () => ({
  getCurrentUser: () => mockGetCurrentUser(),
}));

const mockSetProEntitlement = jest.fn();
const mockSaveSubscriptionState = jest.fn();
const mockGetSubscriptionState = jest.fn();
const mockClearProEntitlement = jest.fn();
jest.mock('../services/subscriptionService', () => ({
  setProEntitlement: (...args: any[]) => mockSetProEntitlement(...args),
  saveSubscriptionState: (...args: any[]) => mockSaveSubscriptionState(...args),
  getSubscriptionState: (...args: any[]) => mockGetSubscriptionState(...args),
  clearProEntitlement: (...args: any[]) => mockClearProEntitlement(...args),
}));

const mockPurchases = {
  setLogLevel: jest.fn(),
  setLogHandler: jest.fn(),
  configure: jest.fn(),
  logIn: jest.fn(),
  logOut: jest.fn(),
  getAppUserID: jest.fn(() => Promise.resolve('user-1')),
  getCustomerInfo: jest.fn(),
  restorePurchases: jest.fn(),
  syncPurchases: jest.fn(),
  getOfferings: jest.fn(),
  purchasePackage: jest.fn(),
};

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: mockPurchases,
  LOG_LEVEL: {
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARN: 'WARN',
    ERROR: 'ERROR',
  },
}));

const loadBillingService = () => {
  jest.resetModules();
  (global as any).__DEV__ = false;
  process.env.EXPO_PUBLIC_RC_APPLE_API_KEY = 'appl_test_key';
  return require('../services/billingService') as typeof import('../services/billingService');
};

describe('billingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUser.mockReturnValue({ uid: 'user-1' });
  });

  it('syncSubscriptionEntitlement sets Pro entitlement with lifetime fallback date', async () => {
    const billing = loadBillingService();
    mockPurchases.getCustomerInfo.mockResolvedValue({
      entitlements: {
        active: {
          pro: {
            expirationDate: null,
            productIdentifier: 'golfsum_pro_yearly',
            willRenew: true,
          },
        },
      },
      latestExpirationDate: null,
      activeSubscriptions: [],
    });

    await billing.syncSubscriptionEntitlement();

    expect(mockSetProEntitlement).toHaveBeenCalledWith({
      proExpiresAt: '2099-12-31T23:59:59.000Z',
      purchaseToken: 'golfsum_pro_yearly',
    });
  });

  it('syncSubscriptionEntitlement downgrades to free while preserving cancellation metadata', async () => {
    const billing = loadBillingService();
    mockPurchases.getCustomerInfo.mockResolvedValue({
      entitlements: { active: {} },
      latestExpirationDate: '2026-12-01T00:00:00.000Z',
      activeSubscriptions: [],
    });
    mockGetSubscriptionState.mockResolvedValue({
      tier: 'pro',
      trialRoundsUsed: 3,
      trialRoundsTotal: 3,
      proExpiresAt: '2026-11-01T00:00:00.000Z',
      proCancelledAt: '2026-10-01T00:00:00.000Z',
      purchaseToken: 'tok_old',
      isProActive: false,
      hasTrialRemaining: false,
      trialRoundsRemaining: 0,
      canUseAdvanced: false,
      isLapsed: true,
    });

    await billing.syncSubscriptionEntitlement();

    expect(mockSaveSubscriptionState).toHaveBeenCalledWith({
      tier: 'free',
      proExpiresAt: '2026-12-01T00:00:00.000Z',
      proCancelledAt: '2026-10-01T00:00:00.000Z',
      purchaseToken: 'tok_old',
    });
  });

  it('restorePurchasesAndSync returns false and clears entitlement when no active access after sync', async () => {
    const billing = loadBillingService();
    mockPurchases.restorePurchases.mockResolvedValue({
      entitlements: { active: {} },
      latestExpirationDate: null,
      activeSubscriptions: [],
    });
    mockPurchases.getCustomerInfo.mockResolvedValue({
      entitlements: { active: {} },
      latestExpirationDate: null,
      activeSubscriptions: [],
    });

    const result = await billing.restorePurchasesAndSync();

    expect(result).toBe(false);
    expect(mockPurchases.syncPurchases).toHaveBeenCalled();
    expect(mockClearProEntitlement).toHaveBeenCalled();
  });

  it('getSubscriptionStatus treats active known subscription id as Pro when entitlement is missing', async () => {
    const billing = loadBillingService();
    mockPurchases.getCustomerInfo.mockResolvedValue({
      entitlements: { active: {} },
      latestExpirationDate: '2026-08-10T00:00:00.000Z',
      activeSubscriptions: ['golfsum_pro_monthly'],
    });

    const status = await billing.getSubscriptionStatus();

    expect(status.isPro).toBe(true);
    expect(status.productId).toBe('golfsum_pro_monthly');
    expect(status.expirationDate).toBe('2026-08-10T00:00:00.000Z');
    expect(status.willRenew).toBe(true);
  });
});

