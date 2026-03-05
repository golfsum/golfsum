/**
 * Trial Service — Manages the 3-round "Experience Mode" trial.
 *
 * Users get 3 rounds with full premium stat tracking.
 * After round 3, premium features require a subscription.
 *
 * STORAGE STRATEGY:
 *   - AsyncStorage: local cache for fast synchronous reads + guest users
 *   - Firestore: source of truth for authenticated users (syncs across devices)
 *   - On login/load: take the HIGHER of local vs Firestore count
 *     (prevents gaming by reinstalling or switching devices)
 *   - On increment: write to both simultaneously
 */

import Storage from './storage';
import { logger } from '../utils/logger';
import { db, isFirebaseEnabled, auth } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const TRIAL_KEY = '@GolfSum:trialRoundsUsed';
const TRIAL_LIMIT = 3;

// ─── In-memory cache (avoids async reads on every render) ────────────────────
let _cachedCount: number | null = null;

// ─── Firestore helpers ───────────────────────────────────────────────────────

/** Returns the current authenticated user's UID, or null. */
function getCurrentUid(): string | null {
  try {
    return auth?.currentUser?.uid ?? null;
  } catch {
    return null;
  }
}

/**
 * Read trial count from Firestore: users/{uid}/meta/trial
 * Returns null if not authenticated, Firestore unavailable, or doc doesn't exist.
 */
async function readFirestoreTrialCount(): Promise<number | null> {
  const uid = getCurrentUid();
  if (!uid || !db || !isFirebaseEnabled) return null;

  try {
    const ref = doc(db, 'users', uid, 'meta', 'trial');
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      const count = typeof data?.roundsUsed === 'number' ? data.roundsUsed : 0;
      return Math.max(0, Math.min(count, TRIAL_LIMIT));
    }
    return 0; // Doc doesn't exist yet → 0 rounds used
  } catch (err) {
    logger.debug('🎯 Firestore trial read failed (using local):', err);
    return null;
  }
}

/**
 * Write trial count to Firestore: users/{uid}/meta/trial
 * Fire-and-forget — failures don't block the app.
 */
async function writeFirestoreTrialCount(count: number): Promise<void> {
  const uid = getCurrentUid();
  if (!uid || !db || !isFirebaseEnabled) return;

  try {
    const ref = doc(db, 'users', uid, 'meta', 'trial');
    await setDoc(ref, {
      roundsUsed: count,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
    logger.debug(`🎯 Firestore trial count synced: ${count}`);
  } catch (err) {
    logger.debug('🎯 Firestore trial write failed (local still updated):', err);
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Load trial count from storage into memory.
 * Takes the HIGHER of local and Firestore counts.
 * Call once at app startup and again after login.
 */
export async function loadTrialCount(): Promise<number> {
  let localCount = 0;
  try {
    const raw = await Storage.getItem(TRIAL_KEY);
    localCount = raw !== null
      ? Math.max(0, Math.min(parseInt(raw, 10) || 0, TRIAL_LIMIT))
      : 0;
  } catch {
    localCount = 0;
  }

  // If authenticated, merge with Firestore (take the higher count)
  const firestoreCount = await readFirestoreTrialCount();
  if (firestoreCount !== null && firestoreCount > localCount) {
    _cachedCount = firestoreCount;
    // Update local to match Firestore (so future reads are consistent)
    await Storage.setItem(TRIAL_KEY, String(firestoreCount));
    logger.debug(`🎯 Trial synced from Firestore: ${firestoreCount}/${TRIAL_LIMIT} (local was ${localCount})`);
  } else if (firestoreCount !== null && localCount > firestoreCount) {
    _cachedCount = localCount;
    // Push local count up to Firestore (guest used rounds before creating account)
    writeFirestoreTrialCount(localCount); // fire-and-forget
    logger.debug(`🎯 Trial synced to Firestore: ${localCount}/${TRIAL_LIMIT} (Firestore was ${firestoreCount})`);
  } else {
    _cachedCount = localCount;
    logger.debug(`🎯 Trial rounds used: ${localCount}/${TRIAL_LIMIT}`);
  }

  return _cachedCount;
}

/**
 * Get current trial rounds used (synchronous, reads from cache).
 * Returns 0 if cache hasn't been loaded yet.
 */
export function getTrialRoundsUsed(): number {
  return _cachedCount ?? 0;
}

/**
 * Returns how many trial rounds remain (0–3).
 */
export function getTrialRoundsRemaining(): number {
  return Math.max(0, TRIAL_LIMIT - getTrialRoundsUsed());
}

/**
 * Returns true if the user is still within their 3-round trial.
 */
export function isInTrial(): boolean {
  return getTrialRoundsUsed() < TRIAL_LIMIT;
}

/**
 * Increment the trial counter by 1.
 * Call this ONCE per saved round (in roundsService.saveRound).
 * Writes to both AsyncStorage and Firestore simultaneously.
 * Caps at TRIAL_LIMIT to avoid unbounded growth.
 */
export async function incrementTrialRound(): Promise<number> {
  const current = getTrialRoundsUsed();
  const next = Math.min(current + 1, TRIAL_LIMIT);
  _cachedCount = next;

  // Write to both storage layers simultaneously
  const localWrite = Storage.setItem(TRIAL_KEY, String(next)).catch(err =>
    logger.warn('Failed to persist trial count locally:', err)
  );
  const firestoreWrite = writeFirestoreTrialCount(next);

  await Promise.all([localWrite, firestoreWrite]);
  logger.debug(`🎯 Trial round recorded: ${next}/${TRIAL_LIMIT}`);
  return next;
}

/**
 * Reset trial counter (for testing / admin use only).
 */
export async function resetTrial(): Promise<void> {
  _cachedCount = 0;
  await Storage.setItem(TRIAL_KEY, '0');
  await writeFirestoreTrialCount(0);
  logger.debug('🎯 Trial reset to 0');
}

export const TRIAL_LIMIT_COUNT = TRIAL_LIMIT;
