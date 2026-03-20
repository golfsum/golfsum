import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, isFirebaseEnabled } from './firebase';

function planDocId(uid, courseId, teeColor) {
  return `${uid}_${courseId}_${(teeColor || 'default').toLowerCase().replace(/\s/g, '-')}`;
}

function localKey(courseId, teeColor) {
  return `golfsum:plan:${courseId}:${(teeColor || 'default').toLowerCase().replace(/\s/g, '-')}`;
}

export async function savePlan(uid, courseId, teeColor, holes, weatherAtPlan) {
  const data = {
    uid,
    courseId,
    teeColor,
    holes,
    weatherAtPlan: weatherAtPlan || null,
    updatedAt: new Date().toISOString(),
  };

  // Write to local cache
  await AsyncStorage.setItem(localKey(courseId, teeColor), JSON.stringify(data));

  // Write to Firestore (fire-and-forget)
  if (db && isFirebaseEnabled && uid) {
    try {
      const id = planDocId(uid, courseId, teeColor);
      await setDoc(doc(db, 'coursePlans', id), {
        ...data,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      }, { merge: true });
    } catch {
      // non-critical — local cache is source of truth
    }
  }
}

export async function loadPlan(uid, courseId, teeColor) {
  // Try local cache first
  try {
    const cached = await AsyncStorage.getItem(localKey(courseId, teeColor));
    if (cached) return JSON.parse(cached);
  } catch {
    // fall through to Firestore
  }

  // Fall back to Firestore
  if (db && isFirebaseEnabled && uid) {
    try {
      const id = planDocId(uid, courseId, teeColor);
      const snap = await getDoc(doc(db, 'coursePlans', id));
      if (snap.exists()) {
        const data = snap.data();
        // Cache locally for next time
        await AsyncStorage.setItem(localKey(courseId, teeColor), JSON.stringify(data));
        return data;
      }
    } catch {
      // offline or error
    }
  }

  return null;
}

export async function deletePlan(uid, courseId, teeColor) {
  await AsyncStorage.removeItem(localKey(courseId, teeColor));
}
