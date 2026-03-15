/**
 * courseStatsService.js
 * Per-hole club suggestion engine.
 * Reads/writes users/{uid}/courseStats/{courseId}/holes/{holeNumber}
 */

import {
  collection,
  doc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore';
import { db, isFirebaseEnabled } from './firebase';
import { getCurrentUser } from './firebaseAuthService';

const MIN_ROUNDS = 3;
const TIE_THRESHOLD = 0.2;
const RECENCY_WEIGHT = 0.3;

// ---------------------------------------------------------------------------
// Algorithm (pure — no Firestore dependency)
// ---------------------------------------------------------------------------

/**
 * Given a hole document from courseStats and a fallback distance-based club,
 * returns a suggestion object in one of four states:
 *   'no_history' | 'building' | 'data_backed' | 'tied'
 */
export function getSuggestedClub(holeDoc, distanceBasedClub, distanceBasedYardage) {
  if (!holeDoc || !holeDoc.teeClubHistory) {
    return { state: 'no_history', club: distanceBasedClub, yardage: distanceBasedYardage };
  }

  const history = holeDoc.teeClubHistory;

  const eligible = Object.entries(history)
    .filter(([, data]) => data.rounds >= MIN_ROUNDS)
    .map(([club, data]) => {
      const simpleAvg = data.totalDelta / data.rounds;
      const recent = (data.recentDeltas || []).slice(0, 3);
      const recentAvg =
        recent.length > 0
          ? recent.reduce((a, b) => a + b, 0) / recent.length
          : simpleAvg;
      const weightedAvg =
        simpleAvg * (1 - RECENCY_WEIGHT) + recentAvg * RECENCY_WEIGHT;
      const fwPct = Math.round((data.fwHit / data.rounds) * 100);
      return { club, rounds: data.rounds, simpleAvg, weightedAvg, fwPct };
    })
    .sort((a, b) => a.weightedAvg - b.weightedAvg);

  if (eligible.length === 0) {
    const totalRounds = Math.max(
      0,
      ...Object.values(history).map(d => d.rounds)
    );
    return {
      state: 'building',
      club: distanceBasedClub,
      yardage: distanceBasedYardage,
      roundsLogged: totalRounds,
      roundsNeeded: MIN_ROUNDS,
    };
  }

  const best = eligible[0];
  const second = eligible[1];
  const tied =
    second &&
    Math.abs(best.weightedAvg - second.weightedAvg) <= TIE_THRESHOLD;

  return {
    state: tied ? 'tied' : 'data_backed',
    club: best.club,
    tiedClub: tied ? second.club : null,
    avgDelta: best.simpleAvg,
    rounds: best.rounds,
    fwPct: best.fwPct,
    allClubs: eligible,
    yardage: distanceBasedYardage,
  };
}

// ---------------------------------------------------------------------------
// Firestore helpers
// ---------------------------------------------------------------------------

function getDb() {
  if (!db || !isFirebaseEnabled) throw new Error('Firestore not available');
  return db;
}

function getUid() {
  return getCurrentUser()?.uid ?? null;
}

/**
 * Fetch all hole docs for a course + tee combination.
 * Returns a plain object keyed by hole number string (e.g. '1', '2', ...).
 * Falls back to {} on error so callers can always destructure safely.
 */
export async function fetchCourseStats(uid, courseId, tees) {
  if (!uid || !courseId || !tees) return {};
  try {
    const fs = getDb();
    const snap = await getDocs(
      query(
        collection(fs, 'users', uid, 'courseStats', courseId, 'holes'),
        where('tees', '==', tees)
      )
    );
    const stats = {};
    snap.forEach(docSnap => {
      stats[docSnap.id] = docSnap.data();
    });
    return stats;
  } catch {
    return {};
  }
}

/**
 * Write one hole's tee-club result into courseStats.
 * Uses a Firestore transaction to safely increment counters.
 */
export async function updateHoleClubHistory(
  uid,
  courseId,
  holeNumber,
  tees,
  par,
  teeClub,
  scoreDelta,
  teeShot
) {
  if (!uid || !courseId || !teeClub) return;
  try {
    const fs = getDb();
    const ref = doc(fs, 'users', uid, 'courseStats', courseId, 'holes', String(holeNumber));
    const fwHit = teeShot?.lie === 'Fairway' ? 1 : 0;

    await runTransaction(fs, async tx => {
      const snap = await tx.get(ref);
      const existing = snap.exists() ? snap.data() : {};
      const history = existing.teeClubHistory || {};
      const clubData = history[teeClub] || {
        rounds: 0,
        totalDelta: 0,
        fwHit: 0,
        lastUsed: null,
        recentDeltas: [],
      };

      const newRecentDeltas = [scoreDelta, ...(clubData.recentDeltas || [])].slice(0, 5);

      tx.set(
        ref,
        {
          courseId,
          holeNumber,
          par,
          tees,
          updatedAt: serverTimestamp(),
          teeClubHistory: {
            ...history,
            [teeClub]: {
              rounds: clubData.rounds + 1,
              totalDelta: clubData.totalDelta + scoreDelta,
              fwHit: clubData.fwHit + fwHit,
              lastUsed: serverTimestamp(),
              recentDeltas: newRecentDeltas,
            },
          },
        },
        { merge: true }
      );
    });
  } catch {
    // Non-critical write — swallow silently
  }
}

/**
 * Called after a GPS round is saved. Iterates each hole and writes
 * the tee club + score delta into courseStats.
 * Fire-and-forget — never throws.
 */
export async function updateCourseStatsAfterRound(round) {
  const uid = getUid();
  if (!uid || !round?.courseId || !round?.teeName) return;
  if (!round.gpsShots?.length && !round.holes?.length) return;

  const gpsShots = round.gpsShots || [];

  await Promise.all(
    (round.holes || []).map(hole => {
      if (!hole.score || hole.score <= 0) return Promise.resolve();

      // Prefer GPS tee shot for club + lie; fall back to manual teeClub
      const teeShot = gpsShots.find(
        s => s.holeNumber === hole.number && s.shotNumber === 1
      ) || null;
      const teeClub = teeShot?.club || hole.teeClub;
      if (!teeClub) return Promise.resolve();

      return updateHoleClubHistory(
        uid,
        round.courseId,
        hole.number,
        round.teeName,
        hole.par,
        teeClub,
        hole.score - hole.par,
        teeShot
      );
    })
  );
}
