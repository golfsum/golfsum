import { auth, db, isFirebaseEnabled } from './firebase';
import { Platform } from 'react-native';
import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

export const REPORT_CATEGORY_LABELS = {
  missing_tee_yardage: 'Missing tee yardage',
  missing_tee: 'Tee missing from list',
  wrong_tee_marker: 'Tee marker in wrong position',
  wrong_gps_distance: 'GPS distance looks wrong',
  missing_course: 'Course not in GolfSum',
  wrong_course_data: 'Course info is wrong',
  app_bug: 'Something is not working',
  other: 'Other',
};

export const REPORT_SOURCE_LABELS = {
  tee_box_setup: 'Tee Box',
  gps_round_screen: 'GPS Round',
  course_search: 'Course Search',
  profile_manual: 'Profile',
};

function requireFirestore() {
  if (!db || !isFirebaseEnabled) {
    throw new Error('Firestore is not available.');
  }
  return db;
}

function getCurrentUid() {
  return auth?.currentUser?.uid || null;
}

function normalizeText(value) {
  const next = String(value || '').trim();
  return next.length ? next : null;
}

function normalizeNumber(value) {
  return Number.isFinite(value) ? Number(value) : null;
}

function makeGroupKey(report) {
  return [
    report.category || 'other',
    report.courseId || report.courseName || 'no-course',
    report.layoutName || 'no-layout',
    report.teeName || 'no-tee',
    Number.isFinite(report.holeNumber) ? `hole-${report.holeNumber}` : 'no-hole',
    report.searchQuery || 'no-search',
  ].join('|');
}

export function buildReportSummaryParts(context = {}) {
  return [
    normalizeText(context.courseName),
    normalizeText(context.layoutName),
    normalizeText(context.teeName),
    REPORT_CATEGORY_LABELS[context.category] || null,
  ].filter(Boolean);
}

function buildLegacyIssueMessage(context = {}) {
  const categoryLabel = REPORT_CATEGORY_LABELS[context.category] || 'Other';
  const parts = [
    categoryLabel,
    normalizeText(context.courseName),
    normalizeText(context.layoutName),
    normalizeText(context.teeName),
    Number.isFinite(context.holeNumber) ? `Hole ${Number(context.holeNumber)}` : null,
  ].filter(Boolean);

  if (normalizeText(context.notes)) {
    parts.push(normalizeText(context.notes));
  }

  return parts.join(' · ');
}

async function writeLegacyReportedIssue(firestore, context, uid) {
  const user = auth?.currentUser || null;
  const now = new Date().toISOString();
  const message = buildLegacyIssueMessage(context);
  const payload = {
    uid,
    email: user?.email || null,
    message,
    createdAt: now,
    platform: Platform.OS,
    appVersion: null,
    buildNumber: null,
    deviceModel: null,
    lastLoginAt: null,
    lastError: null,
    context: {
      reportType: 'structured_report',
      category: context.category || 'other',
      source: context.source || 'profile_manual',
      courseId: normalizeText(context.courseId),
      courseName: normalizeText(context.courseName),
      layoutName: normalizeText(context.layoutName),
      city: normalizeText(context.city),
      state: normalizeText(context.state),
      teeName: normalizeText(context.teeName),
      teeColor: normalizeText(context.teeColor),
      holeNumber: normalizeNumber(context.holeNumber),
      holePar: normalizeNumber(context.holePar),
      gpsDistance: normalizeNumber(context.gpsDistance),
      teeYardage: normalizeNumber(context.teeYardage),
      searchQuery: normalizeText(context.searchQuery),
      notes: normalizeText(context.notes),
    },
    status: 'open',
    adminNote: null,
    completedAt: null,
    completedBy: null,
    completedByEmail: null,
    updatedAt: now,
    thread: [{ from: 'user', message, createdAt: now }],
  };

  await addDoc(collection(firestore, 'reportedIssues'), payload);
  await setDoc(doc(firestore, 'users', uid), {
    lastReportedIssue: payload,
    lastReportedIssueAt: now,
    updatedAt: now,
  }, { merge: true });
}

export async function submitReport(context = {}) {
  const firestore = requireFirestore();
  const uid = getCurrentUid();
  if (!uid) throw new Error('Sign in to send a report.');

  const report = {
    uid,
    createdAt: serverTimestamp(),
    status: 'open',
    category: context.category || 'other',
    source: context.source || 'profile_manual',
    courseId: normalizeText(context.courseId),
    courseName: normalizeText(context.courseName),
    layoutName: normalizeText(context.layoutName),
    city: normalizeText(context.city),
    state: normalizeText(context.state),
    teeName: normalizeText(context.teeName),
    teeColor: normalizeText(context.teeColor),
    holeNumber: normalizeNumber(context.holeNumber),
    holePar: normalizeNumber(context.holePar),
    gpsDistance: normalizeNumber(context.gpsDistance),
    teeYardage: normalizeNumber(context.teeYardage),
    searchQuery: normalizeText(context.searchQuery),
    notes: normalizeText(context.notes),
    adminNotes: null,
    resolvedAt: null,
    resolvedBy: null,
  };

  let wroteReports = false;
  let wroteLegacy = false;
  let lastError = null;

  try {
    await addDoc(collection(firestore, 'reports'), report);
    wroteReports = true;
  } catch (error) {
    lastError = error;
  }

  try {
    await writeLegacyReportedIssue(firestore, context, uid);
    wroteLegacy = true;
  } catch (error) {
    lastError = lastError || error;
  }

  if (!wroteReports && !wroteLegacy) {
    if (lastError?.code === 'permission-denied') {
      throw new Error('Could not send the report. Firestore rules need to be updated.');
    }
    throw lastError || new Error('Could not send the report.');
  }
}

export async function getReportsForUser() {
  const firestore = requireFirestore();
  const uid = getCurrentUid();
  if (!uid) return [];

  const snapshot = await getDocs(collection(firestore, 'reports'));

  return snapshot.docs
    .map((entry) => ({ id: entry.id, ...entry.data() }))
    .filter((entry) => entry.uid === uid)
    .sort((left, right) => {
      const leftStamp = left.createdAt?.seconds || 0;
      const rightStamp = right.createdAt?.seconds || 0;
      return rightStamp - leftStamp;
    });
}

export async function isAdminUser() {
  const firestore = requireFirestore();
  const uid = getCurrentUid();
  if (!uid) return false;
  const snapshot = await getDoc(doc(firestore, 'admins', uid));
  return snapshot.exists();
}

export async function getAdminReportGroups(statuses = ['open', 'in_review']) {
  const firestore = requireFirestore();
  const statusesToLoad = Array.isArray(statuses) && statuses.length ? statuses : ['open', 'in_review'];
  const snapshot = await getDocs(collection(firestore, 'reports'));
  const allReports = snapshot.docs
    .map((entry) => ({ id: entry.id, ...entry.data() }))
    .filter((report) => statusesToLoad.includes(report.status));

  const grouped = new Map();
  allReports.forEach((report) => {
    const key = makeGroupKey(report);
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        key,
        category: report.category,
        status: report.status,
        courseId: report.courseId || null,
        courseName: report.courseName || null,
        layoutName: report.layoutName || null,
        teeName: report.teeName || null,
        holeNumber: report.holeNumber || null,
        count: 1,
        latestCreatedAt: report.createdAt || null,
        latestReportId: report.id,
        latestReport: report,
        reports: [report],
      });
      return;
    }
    existing.count += 1;
    existing.reports.push(report);
    existing.latestReport = report;
    existing.latestReportId = report.id;
    existing.latestCreatedAt = report.createdAt || existing.latestCreatedAt;
  });

  return [...grouped.values()].sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count;
    const leftStamp = left.latestCreatedAt?.seconds || 0;
    const rightStamp = right.latestCreatedAt?.seconds || 0;
    return rightStamp - leftStamp;
  });
}

export async function updateReportStatus(reportId, status, adminNotes = '') {
  const firestore = requireFirestore();
  const uid = getCurrentUid();
  if (!uid) throw new Error('Not signed in.');
  await updateDoc(doc(firestore, 'reports', reportId), {
    status,
    adminNotes: normalizeText(adminNotes),
    resolvedAt: status === 'resolved' ? serverTimestamp() : null,
    resolvedBy: status === 'resolved' ? uid : null,
  });
}

export async function clearCourseCache(courseId) {
  const firestore = requireFirestore();
  if (!courseId) return;
  await updateDoc(doc(firestore, 'courses', courseId), {
    gpsData: deleteField(),
    gpsUpdatedAt: serverTimestamp(),
  });
}
