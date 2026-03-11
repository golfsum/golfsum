// User Service - Firestore database for user data
// Stores preferences, averages, history, and insights per user
// Migrated from manual REST API to Firebase SDK.

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import {
  SavedRound,
  UserProfile,
  AverageStats,
  getDefaultProfile,
} from '../types';
import { getCurrentUser, refreshAuthToken } from './firebaseAuthService';
import { db, isFirebaseEnabled } from './firebase';
import { logger } from '../utils/logger';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';

export type PushDeviceRegistration = {
  installationId: string;
  expoPushToken: string | null;
  platform: string;
  projectId: string | null;
  deviceName?: string | null;
  appVersion?: string | null;
  buildNumber?: string | number | null;
  permissionStatus: string;
  notificationsEnabled: boolean;
  marketingEnabled: boolean;
  maintenanceEnabled: boolean;
  status: 'active' | 'disabled' | 'denied' | 'invalid' | 'simulator';
  lastSeenAt: string;
};

const isPermissionError = (error: unknown): boolean => {
  const s = typeof error === 'string' ? error : JSON.stringify(error);
  return s.includes('403') ||
    s.includes('PERMISSION_DENIED') ||
    s.includes('Missing or insufficient permissions') ||
    s.includes('401') ||
    s.includes('Unauthorized');
};

function getUserId(): string | null {
  return getCurrentUser()?.uid ?? null;
}

function requireDb(): import('firebase/firestore').Firestore {
  if (!db || !isFirebaseEnabled) throw new Error('Firestore not initialized');
  return db;
}

export type UserErrorReport = {
  message: string;
  name?: string;
  stack?: string;
  args?: string;
  createdAt: string;
};

export type ReportThreadMessage = {
  from: 'user' | 'admin';
  message: string;
  createdAt: string;
};

export type ReportedIssue = {
  id?: string;
  uid: string;
  email: string | null;
  message: string;
  createdAt: string;
  platform: string;
  appVersion?: string | null;
  buildNumber?: string | number | null;
  deviceModel?: string | null;
  lastLoginAt?: string | null;
  lastError?: UserErrorReport | null;
  context?: Record<string, unknown> | null;
  status?: 'open' | 'completed';
  adminNote?: string | null;
  completedAt?: string | null;
  completedBy?: string | null;
  completedByEmail?: string | null;
  updatedAt?: string | null;
  thread?: ReportThreadMessage[] | null;
};

export interface SavedInsight {
  id: string;
  category: string;
  title: string;
  description: string;
  createdAt: string;
  dismissed?: boolean;
}

export async function saveLastError(error: UserErrorReport): Promise<void> {
  const userId = getUserId();
  if (!userId) return;
  try {
    const fs = requireDb();
    await updateDoc(doc(fs, 'users', userId), {
      lastError: error,
      lastErrorAt: error.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  } catch {
    // Avoid logger recursion if error reporting fails
  }
}

const getUserDocument = async (): Promise<Record<string, unknown> | null> => {
  const userId = getUserId();
  if (!userId) return null;
  try {
    const fs = requireDb();
    const snap = await getDoc(doc(fs, 'users', userId));
    return snap.exists() ? (snap.data() as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

export async function reportUserIssue(
  message: string,
  context?: Record<string, unknown>
): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  await ensureUserDocument();

  const now = new Date().toISOString();
  const userDoc = await getUserDocument();
  const constantsAny = Constants as unknown as {
    manifest?: { version?: string };
    deviceName?: string;
  };
  const appVersion =
    Constants.expoConfig?.version ?? constantsAny.manifest?.version ?? null;
  const buildNumber =
    Constants.expoConfig?.ios?.buildNumber ??
    Constants.expoConfig?.android?.versionCode ??
    null;
  const deviceModel =
    constantsAny.deviceName ??
    Constants.platform?.ios?.model ??
    Constants.platform?.android?.model ??
    null;

  const payload: ReportedIssue = {
    uid: user.uid,
    email: user.email ?? null,
    message,
    createdAt: now,
    platform: Platform.OS,
    appVersion: appVersion as string | null,
    buildNumber: buildNumber as string | number | null,
    deviceModel: deviceModel as string | null,
    lastLoginAt: (userDoc?.lastLoginAt as string) ?? null,
    lastError: (userDoc?.lastError as UserErrorReport) ?? null,
    context: context ?? null,
    status: 'open',
    adminNote: null,
    completedAt: null,
    completedBy: null,
    completedByEmail: null,
    updatedAt: now,
    thread: [{ from: 'user', message, createdAt: now }],
  };

  let patchedUser = false;
  let wroteCollection = false;

  try {
    const fs = requireDb();
    await updateDoc(doc(fs, 'users', user.uid), {
      lastReportedIssue: payload,
      lastReportedIssueAt: now,
      updatedAt: now,
    });
    patchedUser = true;
  } catch (error) {
    logger.warn('Failed to patch user report fields', error);
  }

  try {
    const fs = requireDb();
    await addDoc(collection(fs, 'reportedIssues'), payload);
    wroteCollection = true;
  } catch (error) {
    logger.warn('Reported issues collection write failed', error);
  }

  if (!patchedUser && !wroteCollection) {
    throw new Error('Failed to report issue');
  }
}

export async function getUserAccountMeta(): Promise<{
  lastReportedIssue?: ReportedIssue | null;
  lastReportedIssueAt?: string | null;
}> {
  const userDoc = await getUserDocument();
  return {
    lastReportedIssue: (userDoc?.lastReportedIssue as ReportedIssue) ?? null,
    lastReportedIssueAt: (userDoc?.lastReportedIssueAt as string) ?? null,
  };
}

export async function getReportedIssuesForUser(): Promise<ReportedIssue[]> {
  const user = getCurrentUser();
  if (!user) return [];

  try {
    const fs = requireDb();
    const q = query(
      collection(fs, 'reportedIssues'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as ReportedIssue));
  } catch (error) {
    if (!isPermissionError(error)) logger.error('getReportedIssuesForUser error:', error);
    return [];
  }
}

export async function appendReportReply(reportId: string, message: string): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  if (!reportId) throw new Error('Missing report id');

  const fs = requireDb();
  const reportRef = doc(fs, 'reportedIssues', reportId);
  const snap = await getDoc(reportRef);
  if (!snap.exists()) throw new Error('Failed to load report');

  const current = snap.data() as ReportedIssue;
  const now = new Date().toISOString();
  const currentThread = Array.isArray(current?.thread) ? current.thread : [];
  const nextThread = [...currentThread, { from: 'user', message, createdAt: now } as ReportThreadMessage];

  await updateDoc(reportRef, {
    thread: nextThread,
    updatedAt: now,
    status: 'open',
    completedAt: null,
    completedBy: null,
    completedByEmail: null,
  });
}

export async function updateReportedIssue(
  reportId: string,
  updates: Partial<ReportedIssue>
): Promise<void> {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');

  const fs = requireDb();
  await updateDoc(doc(fs, 'reportedIssues', reportId), {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

export async function ensureUserDocument(): Promise<void> {
  const user = getCurrentUser();
  if (!user) return;

  const nowIso = new Date().toISOString();
  const device = {
    platform: Platform.OS === 'web'
      ? (typeof navigator !== 'undefined' ? navigator.platform || Platform.OS : Platform.OS)
      : Platform.OS,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent || '' : '',
  };

  try {
    const fs = requireDb();
    const ref = doc(fs, 'users', user.uid);
    const existing = await getDoc(ref);

    const updates: Record<string, unknown> = {
      email: user.email ?? null,
      displayName: user.displayName ?? null,
      lastLoginAt: nowIso,
      lastLoginDevice: device,
      updatedAt: nowIso,
    };

    if (!existing.exists()) {
      const defaultProfile = getDefaultProfile();
      if (user.displayName && !defaultProfile.personalInfo.name) {
        defaultProfile.personalInfo.name = user.displayName;
      }
      updates.createdAt = nowIso;
      updates.profile = defaultProfile;
      await setDoc(ref, updates);
    } else {
      const data = existing.data();
      if (!data?.profile) {
        updates.profile = getDefaultProfile();
      }
      await updateDoc(ref, updates);
    }
    logger.debug('✓ User document ensured');
  } catch (error) {
    if (!isPermissionError(error)) logger.error('Ensure user document error:', error);
  }
}

export async function saveUserProfile(profile: UserProfile): Promise<void> {
  const userId = getUserId();
  if (!userId) throw new Error('Not authenticated');

  const fs = requireDb();
  await updateDoc(doc(fs, 'users', userId), {
    profile,
    updatedAt: new Date().toISOString(),
  });
  logger.debug('✓ Profile saved to Firestore');
}

export async function upsertPushDeviceRegistration(
  registration: PushDeviceRegistration
): Promise<void> {
  const userId = getUserId();
  if (!userId) return;

  const fs = requireDb();
  const nowIso = new Date().toISOString();
  await setDoc(
    doc(fs, 'users', userId, 'pushDevices', registration.installationId),
    {
      ...registration,
      updatedAt: nowIso,
      createdAt: nowIso,
    },
    { merge: true }
  );
}

export async function deactivatePushDeviceRegistration(installationId: string): Promise<void> {
  const userId = getUserId();
  if (!userId || !installationId) return;

  const fs = requireDb();
  const nowIso = new Date().toISOString();
  await setDoc(
    doc(fs, 'users', userId, 'pushDevices', installationId),
    {
      status: 'disabled',
      notificationsEnabled: false,
      expoPushToken: null,
      updatedAt: nowIso,
      lastSeenAt: nowIso,
    },
    { merge: true }
  );
}

export async function getUserProfile(): Promise<UserProfile> {
  const userId = getUserId();
  if (!userId) return getDefaultProfile();

  try {
    const fs = requireDb();
    const snap = await getDoc(doc(fs, 'users', userId));
    if (!snap.exists()) return getDefaultProfile();
    const data = snap.data();
    return (data?.profile as UserProfile) ?? getDefaultProfile();
  } catch (error) {
    if (!isPermissionError(error)) logger.error('Get profile error:', error);
    return getDefaultProfile();
  }
}

export async function saveRoundToFirestore(round: SavedRound): Promise<void> {
  const userId = getUserId();
  if (!userId) throw new Error('Not authenticated');

  try {
    const fs = requireDb();
    const roundData = {
      ...round,
      date: round.date instanceof Date ? round.date.toISOString() : round.date,
    };
    await setDoc(doc(fs, 'users', userId, 'rounds', round.id), roundData);
    logger.debug('✓ Round saved to Firestore:', round.id);
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('403') || error.message.includes('permission'))
    ) {
      logger.debug('🔄 Token may be stale, refreshing...');
      await refreshAuthToken();
      const fs = requireDb();
      const roundData = {
        ...round,
        date: round.date instanceof Date ? round.date.toISOString() : round.date,
      };
      await setDoc(doc(fs, 'users', userId, 'rounds', round.id), roundData);
      logger.debug('✓ Round saved to Firestore (after refresh):', round.id);
      return;
    }
    throw error;
  }
}

export async function getRoundsFromFirestore(): Promise<SavedRound[]> {
  const userId = getUserId();
  if (!userId) return [];

  try {
    const fs = requireDb();
    const q = query(collection(fs, 'users', userId, 'rounds'), orderBy('date', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => {
      const data = d.data();
      return {
        ...data,
        date: new Date(data.date as string),
      } as SavedRound;
    });
  } catch (error: unknown) {
    const isAuthError =
      error instanceof Error &&
      (error.message.includes('403') || error.message.includes('permission'));

    if (isAuthError) {
      logger.debug('🔄 Token expired, refreshing...');
      await refreshAuthToken();
      const fs = requireDb();
      const q = query(collection(fs, 'users', userId, 'rounds'), orderBy('date', 'desc'));
      const snap = await getDocs(q);
      return snap.docs.map(d => {
        const data = d.data();
        return { ...data, date: new Date(data.date as string) } as SavedRound;
      });
    }

    if (!isPermissionError(error)) logger.error('Get rounds error:', error);
    if (isAuthError) throw error;
    return [];
  }
}

export async function deleteRoundFromFirestore(roundId: string): Promise<void> {
  const userId = getUserId();
  if (!userId) throw new Error('Not authenticated');

  const fs = requireDb();
  await deleteDoc(doc(fs, 'users', userId, 'rounds', roundId));
  logger.debug('✓ Round deleted from Firestore:', roundId);
}

export async function updateRoundInFirestore(
  roundId: string,
  updates: Partial<SavedRound>
): Promise<void> {
  const userId = getUserId();
  if (!userId) throw new Error('Not authenticated');

  const fs = requireDb();
  await updateDoc(doc(fs, 'users', userId, 'rounds', roundId), {
    ...updates,
    date: updates.date instanceof Date ? updates.date.toISOString() : updates.date,
  });
  logger.debug('✓ Round updated in Firestore:', roundId);
}

export async function saveAverageStats(stats: AverageStats): Promise<void> {
  const userId = getUserId();
  if (!userId) throw new Error('Not authenticated');

  const fs = requireDb();
  await updateDoc(doc(fs, 'users', userId), {
    averages: stats,
    averagesUpdatedAt: new Date().toISOString(),
  });
  logger.debug('✓ Averages saved to Firestore');
}

export async function getAverageStatsFromFirestore(): Promise<AverageStats | null> {
  const userId = getUserId();
  if (!userId) return null;

  try {
    const fs = requireDb();
    const snap = await getDoc(doc(fs, 'users', userId));
    if (!snap.exists()) return null;
    return (snap.data()?.averages as AverageStats) ?? null;
  } catch (error) {
    if (!isPermissionError(error)) logger.error('Get averages error:', error);
    return null;
  }
}

export async function saveInsights(insights: SavedInsight[]): Promise<void> {
  const userId = getUserId();
  if (!userId) throw new Error('Not authenticated');

  const fs = requireDb();
  await updateDoc(doc(fs, 'users', userId), {
    insights,
    insightsUpdatedAt: new Date().toISOString(),
  });
  logger.debug('✓ Insights saved to Firestore');
}

export async function syncLocalDataToFirestore(): Promise<void> {
  const userId = getUserId();
  if (!userId) {
    logger.debug('Not authenticated, skipping sync');
    return;
  }

  logger.debug('Starting sync to Firestore...');

  try {
    const localRoundsJson =
      typeof localStorage !== 'undefined' ? localStorage.getItem('golf_rounds') : null;
    if (localRoundsJson) {
      const localRounds = JSON.parse(localRoundsJson) as SavedRound[];
      logger.debug(`Syncing ${localRounds.length} rounds to Firestore...`);
      for (const round of localRounds) {
        try { await saveRoundToFirestore(round); } catch (e) { logger.error('Failed to sync round:', round.id, e); }
      }
      logger.debug('✓ Rounds synced to Firestore');
    }
  } catch (error) {
    if (!isPermissionError(error)) logger.error('Sync rounds error:', error);
  }

  try {
    const localProfileJson =
      typeof localStorage !== 'undefined' ? localStorage.getItem('@GolfSum:UserProfile') : null;
    if (localProfileJson) {
      const localProfile = JSON.parse(localProfileJson) as UserProfile;
      await saveUserProfile(localProfile);
      logger.debug('✓ Profile synced to Firestore');
    }
  } catch (error) {
    if (!isPermissionError(error)) logger.error('Sync profile error:', error);
  }
}

// Compatibility shims for modules still using Firestore REST serialization.
export function convertToFirestoreFields(obj: any): any {
  const fields: any = {};

  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      fields[key] = { nullValue: null };
    } else if (typeof value === 'string') {
      fields[key] = { stringValue: value };
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        fields[key] = { integerValue: value.toString() };
      } else {
        fields[key] = { doubleValue: value };
      }
    } else if (typeof value === 'boolean') {
      fields[key] = { booleanValue: value };
    } else if (Array.isArray(value)) {
      const arrayValues = value
        .filter(v => v !== undefined)
        .map(v => {
          if (v === null) return { nullValue: null };
          if (typeof v === 'string') return { stringValue: v };
          if (typeof v === 'number') {
            return Number.isInteger(v) ? { integerValue: v.toString() } : { doubleValue: v };
          }
          if (typeof v === 'boolean') return { booleanValue: v };
          if (Array.isArray(v)) return { arrayValue: { values: [] } };
          if (typeof v === 'object') return { mapValue: { fields: convertToFirestoreFields(v) } };
          return { stringValue: String(v) };
        });
      fields[key] = { arrayValue: { values: arrayValues } };
    } else if (typeof value === 'object') {
      fields[key] = { mapValue: { fields: convertToFirestoreFields(value) } };
    }
  }

  return fields;
}

export function convertFromFirestoreFields(fields: any): any {
  const obj: any = {};

  for (const [key, value] of Object.entries(fields as Record<string, any>)) {
    if (value.nullValue !== undefined) {
      obj[key] = null;
    } else if (value.stringValue !== undefined) {
      obj[key] = value.stringValue;
    } else if (value.integerValue !== undefined) {
      obj[key] = parseInt(value.integerValue, 10);
    } else if (value.doubleValue !== undefined) {
      obj[key] = value.doubleValue;
    } else if (value.booleanValue !== undefined) {
      obj[key] = value.booleanValue;
    } else if (value.timestampValue !== undefined) {
      obj[key] = value.timestampValue;
    } else if (value.arrayValue?.values) {
      obj[key] = value.arrayValue.values.map((v: any) => {
        if (v.stringValue !== undefined) return v.stringValue;
        if (v.integerValue !== undefined) return parseInt(v.integerValue, 10);
        if (v.doubleValue !== undefined) return v.doubleValue;
        if (v.booleanValue !== undefined) return v.booleanValue;
        if (v.mapValue?.fields) return convertFromFirestoreFields(v.mapValue.fields);
        return null;
      });
    } else if (value.mapValue?.fields) {
      obj[key] = convertFromFirestoreFields(value.mapValue.fields);
    }
  }

  return obj;
}
