import { logger } from '../utils/logger';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import {
  deleteCurrentAuthUser,
  getAuthToken,
  getCurrentUser,
} from './firebaseAuthService';
import { convertFromFirestoreFields } from './userService';
import { deleteScorecardImage, deleteStorageObjectByUrl } from './storageService';
import { FIRESTORE_BASE_URL } from './firebaseConfig';

type FirestoreDoc = {
  name: string;
  fields?: Record<string, unknown>;
};

async function getHeaders(): Promise<HeadersInit> {
  const token = await getAuthToken();
  if (!token) throw new Error('Not authenticated');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function deleteDocumentByName(documentName: string): Promise<void> {
  const headers = await getHeaders();
  const response = await fetchWithTimeout(
    `https://firestore.googleapis.com/v1/${documentName}`,
    { method: 'DELETE', headers }
  );
  if (!response.ok && response.status !== 404) {
    const text = await response.text().catch(() => '');
    throw new Error(`Failed to delete document (${response.status}): ${text}`);
  }
}

async function listDocuments(path: string): Promise<FirestoreDoc[]> {
  const headers = await getHeaders();
  const response = await fetchWithTimeout(`${FIRESTORE_BASE_URL}/${path}?pageSize=300`, {
    method: 'GET',
    headers,
  });
  if (!response.ok) {
    if (response.status === 404) return [];
    const text = await response.text().catch(() => '');
    throw new Error(`Failed to list ${path} (${response.status}): ${text}`);
  }
  const data = await response.json();
  return Array.isArray(data.documents) ? data.documents : [];
}

async function queryDocumentsByUid(collectionId: string, uid: string): Promise<FirestoreDoc[]> {
  const headers = await getHeaders();
  const response = await fetchWithTimeout(`${FIRESTORE_BASE_URL}:runQuery`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'uid' },
            op: 'EQUAL',
            value: { stringValue: uid },
          },
        },
        limit: 500,
      },
    }),
  });
  if (!response.ok) {
    if (response.status === 404) return [];
    const text = await response.text().catch(() => '');
    throw new Error(`Failed to query ${collectionId} (${response.status}): ${text}`);
  }
  const rows = await response.json();
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row: { document?: FirestoreDoc }) => row.document)
    .filter((doc): doc is FirestoreDoc => Boolean(doc));
}

function getDocIdFromName(name: string): string {
  const parts = String(name || '').split('/');
  return parts[parts.length - 1] || '';
}

async function deleteUserStorageFiles(uid: string): Promise<void> {
  const roundDocs = await listDocuments(`users/${uid}/rounds`);
  for (const doc of roundDocs) {
    const roundId = getDocIdFromName(doc.name);
    if (roundId) {
      await deleteScorecardImage(roundId).catch(() => undefined);
    }

    const round = doc.fields ? convertFromFirestoreFields(doc.fields) : {};
    const imageUri = typeof round?.imageUri === 'string' ? round.imageUri : null;
    const thumbnailUri = typeof round?.thumbnailUri === 'string' ? round.thumbnailUri : null;
    if (imageUri) await deleteStorageObjectByUrl(imageUri).catch(() => undefined);
    if (thumbnailUri) await deleteStorageObjectByUrl(thumbnailUri).catch(() => undefined);
  }

  const ocrErrorDocs = await queryDocumentsByUid('ocrErrors', uid);
  for (const doc of ocrErrorDocs) {
    const errorData = doc.fields ? convertFromFirestoreFields(doc.fields) : {};
    const imageUrl = typeof errorData?.imageUrl === 'string' ? errorData.imageUrl : null;
    if (imageUrl) {
      await deleteStorageObjectByUrl(imageUrl).catch(() => undefined);
    }
  }
}

async function deleteUserFirestoreData(uid: string): Promise<void> {
  const roundDocs = await listDocuments(`users/${uid}/rounds`);
  for (const doc of roundDocs) {
    await deleteDocumentByName(doc.name);
  }

  const metaDocs = await listDocuments(`users/${uid}/meta`);
  for (const doc of metaDocs) {
    await deleteDocumentByName(doc.name);
  }

  const reportedIssues = await queryDocumentsByUid('reportedIssues', uid);
  for (const doc of reportedIssues) {
    await deleteDocumentByName(doc.name);
  }

  const ocrErrors = await queryDocumentsByUid('ocrErrors', uid);
  for (const doc of ocrErrors) {
    await deleteDocumentByName(doc.name);
  }

  await fetchWithTimeout(`${FIRESTORE_BASE_URL}/users/${uid}`, {
    method: 'DELETE',
    headers: await getHeaders(),
  });

  await fetchWithTimeout(`${FIRESTORE_BASE_URL}/user_profiles/${uid}`, {
    method: 'DELETE',
    headers: await getHeaders(),
  });
}

export async function deleteAccountAndUserData(): Promise<void> {
  const user = getCurrentUser();
  if (!user?.uid) throw new Error('Not authenticated');
  const uid = user.uid;

  // Keep shared course catalog data on purpose (courses/*).
  await deleteUserStorageFiles(uid);
  await deleteUserFirestoreData(uid);
  await deleteCurrentAuthUser();
  logger.debug('✅ Account and user-scoped data deleted');
}
