// Mock firebase (no real Firestore in unit tests)
jest.mock('../services/firebase', () => ({
  db: null,
  isFirebaseEnabled: false,
  auth: { currentUser: null },
}));

// Mock Storage (AsyncStorage wrapper)
const mockStore: Record<string, string> = {};
jest.mock('../services/storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(mockStore[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      mockStore[key] = value;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      delete mockStore[key];
      return Promise.resolve();
    }),
  },
}));

// Mock logger
jest.mock('../utils/logger', () => ({ logger: { debug: jest.fn(), warn: jest.fn() } }));

import {
  TRIAL_LIMIT_COUNT,
  loadTrialCount,
  getTrialRoundsUsed,
  getTrialRoundsRemaining,
  isInTrial,
  incrementTrialRound,
  resetTrial,
} from '../services/trialService';

const TRIAL_KEY = '@GolfSum:trialRoundsUsed';

beforeEach(async () => {
  Object.keys(mockStore).forEach(k => delete mockStore[k]);
  await resetTrial();
});

describe('TRIAL_LIMIT_COUNT', () => {
  it('is exactly 3', () => {
    expect(TRIAL_LIMIT_COUNT).toBe(3);
  });
});

describe('loadTrialCount()', () => {
  it('returns 0 when storage is empty', async () => {
    const count = await loadTrialCount();
    expect(count).toBe(0);
  });

  it('reads persisted count from storage', async () => {
    mockStore[TRIAL_KEY] = '2';
    const count = await loadTrialCount();
    expect(count).toBe(2);
  });

  it('clamps corrupted storage values to TRIAL_LIMIT_COUNT', async () => {
    mockStore[TRIAL_KEY] = '99';
    const count = await loadTrialCount();
    expect(count).toBeLessThanOrEqual(TRIAL_LIMIT_COUNT);
  });

  it('clamps negative storage values to 0', async () => {
    mockStore[TRIAL_KEY] = '-5';
    const count = await loadTrialCount();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('handles NaN storage gracefully', async () => {
    mockStore[TRIAL_KEY] = 'not-a-number';
    const count = await loadTrialCount();
    expect(count).toBe(0);
  });
});

describe('isInTrial() / getTrialRoundsRemaining()', () => {
  it('returns true and 3 remaining when no rounds used', async () => {
    await loadTrialCount();
    expect(isInTrial()).toBe(true);
    expect(getTrialRoundsRemaining()).toBe(3);
  });

  it('returns true and 1 remaining when 2 rounds used', async () => {
    mockStore[TRIAL_KEY] = '2';
    await loadTrialCount();
    expect(isInTrial()).toBe(true);
    expect(getTrialRoundsRemaining()).toBe(1);
  });

  it('returns false and 0 remaining when at limit', async () => {
    mockStore[TRIAL_KEY] = '3';
    await loadTrialCount();
    expect(isInTrial()).toBe(false);
    expect(getTrialRoundsRemaining()).toBe(0);
  });

  it('getTrialRoundsRemaining never goes negative', async () => {
    mockStore[TRIAL_KEY] = '5';
    await loadTrialCount();
    expect(getTrialRoundsRemaining()).toBeGreaterThanOrEqual(0);
  });
});

describe('incrementTrialRound()', () => {
  it('increments from 0 to 1', async () => {
    await loadTrialCount();
    const next = await incrementTrialRound();
    expect(next).toBe(1);
    expect(getTrialRoundsUsed()).toBe(1);
  });

  it('increments from 1 to 2', async () => {
    mockStore[TRIAL_KEY] = '1';
    await loadTrialCount();
    const next = await incrementTrialRound();
    expect(next).toBe(2);
  });

  it('increments from 2 to 3 (hits limit)', async () => {
    mockStore[TRIAL_KEY] = '2';
    await loadTrialCount();
    const next = await incrementTrialRound();
    expect(next).toBe(3);
    expect(isInTrial()).toBe(false);
  });

  it('does NOT exceed TRIAL_LIMIT_COUNT when already at limit', async () => {
    mockStore[TRIAL_KEY] = '3';
    await loadTrialCount();
    const next = await incrementTrialRound();
    expect(next).toBe(TRIAL_LIMIT_COUNT);
    expect(next).toBeLessThanOrEqual(TRIAL_LIMIT_COUNT);
  });

  it('persists the new count to storage', async () => {
    await loadTrialCount();
    await incrementTrialRound();
    expect(mockStore[TRIAL_KEY]).toBe('1');
  });

  it('calling increment 10 times never exceeds TRIAL_LIMIT_COUNT', async () => {
    await loadTrialCount();
    let last = 0;
    for (let i = 0; i < 10; i++) {
      last = await incrementTrialRound();
    }
    expect(last).toBe(TRIAL_LIMIT_COUNT);
    expect(getTrialRoundsUsed()).toBe(TRIAL_LIMIT_COUNT);
  });
});
