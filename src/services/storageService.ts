// Firebase Storage Service for scorecard images
// Saves and retrieves scorecard images from Firebase Storage

import { Platform } from 'react-native';
import { getAuthToken, getCurrentUser } from './firebaseAuthService';
import { logger } from '../utils/logger';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';
import { FIREBASE_STORAGE_BUCKET as STORAGE_BUCKET } from './firebaseConfig';
const STORAGE_BASE_URL = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o`;

function getUploadUrl(storagePath: string): string {
  return `${STORAGE_BASE_URL}?uploadType=media&name=${encodeURIComponent(storagePath)}`;
}

function generateDownloadToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Get current user ID
function getUserId(): string | null {
  const user = getCurrentUser();
  return user?.uid || null;
}

// Get auth headers
async function getHeaders(): Promise<HeadersInit> {
  const token = await getAuthToken();
  return {
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
}

function extractStoragePathFromFirebaseUrl(url: string): string | null {
  const raw = String(url || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    const marker = '/o/';
    const idx = parsed.pathname.indexOf(marker);
    if (idx < 0) return null;
    const encodedPath = parsed.pathname.slice(idx + marker.length);
    if (!encodedPath) return null;
    return decodeURIComponent(encodedPath);
  } catch {
    return null;
  }
}

/**
 * Upload a scorecard image to Firebase Storage
 * @param imageUri - Base64 data URL or blob URL
 * @param roundId - Round ID to associate with the image
 * @returns Download URL of the uploaded image
 */
export async function uploadScorecardImage(imageUri: string, roundId: string): Promise<string> {
  const userId = getUserId();
  if (!userId) throw new Error('Not authenticated');

  // Convert data URL to blob
  let blob: Blob;
  let contentType = 'image/jpeg';
  
  if (imageUri.startsWith('data:')) {
    // Parse data URL
    const matches = imageUri.match(/^data:(.+);base64,(.+)$/);
    if (!matches) throw new Error('Invalid data URL');
    
    contentType = matches[1];
    const base64Data = matches[2];
    
    // Convert base64 to blob
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    blob = new Blob([byteArray], { type: contentType });
  } else {
    // Fetch blob URL
    const response = await fetchWithTimeout(imageUri);
    blob = await response.blob();
    contentType = blob.type || 'image/jpeg';
  }

  // Determine file extension
  const ext = contentType.includes('png') ? 'png' : contentType.includes('gif') ? 'gif' : 'jpg';
  
  // Build storage path: users/{userId}/scorecards/{roundId}.{ext}
  const storagePath = `users/${userId}/scorecards/${roundId}.${ext}`;
  const encodedPath = encodeURIComponent(storagePath);
  const downloadToken = generateDownloadToken();
  
  logger.debug(`Uploading scorecard image for round ${roundId}...`);
  
  // Upload to Firebase Storage
  const uploadResponse = await fetchWithTimeout(getUploadUrl(storagePath), {
    method: 'POST',
    headers: {
      ...(await getHeaders()),
      'Content-Type': contentType,
      'x-goog-meta-firebaseStorageDownloadTokens': downloadToken,
    },
    body: blob,
  });

  if (!uploadResponse.ok) {
    const error = await uploadResponse.json().catch(() => ({}));
    logger.error('Upload error:', error);
    throw new Error('Failed to upload scorecard image');
  }

  const uploadData = await uploadResponse.json().catch(() => ({} as { downloadTokens?: string }));
  const tokenFromResponse = typeof uploadData.downloadTokens === 'string'
    ? uploadData.downloadTokens.split(',')[0]
    : undefined;
  const downloadUrl = `${STORAGE_BASE_URL}/${encodedPath}?alt=media&token=${tokenFromResponse || downloadToken}`;
  
  logger.debug('✓ Scorecard image uploaded:', downloadUrl);
  
  return downloadUrl;
}

/**
 * Upload a scorecard image tied to a course (community catalog)
 * @param imageUri - Image URI
 * @param courseId - Course ID
 * @returns Download URL
 */
export async function uploadCourseScorecardImage(imageUri: string, courseId: string): Promise<string> {
  const userId = getUserId();
  if (!userId) throw new Error('Not authenticated');

  let blob: Blob;
  let contentType = 'image/jpeg';

  if (imageUri.startsWith('data:')) {
    const matches = imageUri.match(/^data:(.+);base64,(.+)$/);
    if (!matches) throw new Error('Invalid data URL');

    contentType = matches[1];
    const base64Data = matches[2];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    blob = new Blob([byteArray], { type: contentType });
  } else {
    const response = await fetchWithTimeout(imageUri);
    blob = await response.blob();
    contentType = blob.type || 'image/jpeg';
  }

  const ext = contentType.includes('png') ? 'png' : contentType.includes('gif') ? 'gif' : 'jpg';
  const storagePath = `courses/${courseId}.${ext}`;
  const encodedPath = encodeURIComponent(storagePath);
  const downloadToken = generateDownloadToken();

  const uploadResponse = await fetchWithTimeout(getUploadUrl(storagePath), {
    method: 'POST',
    headers: {
      ...(await getHeaders()),
      'Content-Type': contentType,
      'x-goog-meta-firebaseStorageDownloadTokens': downloadToken,
    },
    body: blob,
  });

  if (!uploadResponse.ok) {
    const error = await uploadResponse.json().catch(() => ({}));
    logger.error('Course image upload error:', error);
    throw new Error('Failed to upload course scorecard image');
  }

  const uploadData = await uploadResponse.json().catch(() => ({} as { downloadTokens?: string }));
  const tokenFromResponse = typeof uploadData.downloadTokens === 'string'
    ? uploadData.downloadTokens.split(',')[0]
    : undefined;
  return `${STORAGE_BASE_URL}/${encodedPath}?alt=media&token=${tokenFromResponse || downloadToken}`;
}

/**
 * Upload a thumbnail image
 * @param imageUri - Base64 data URL of thumbnail
 * @param roundId - Round ID
 * @returns Download URL
 */
export async function uploadThumbnail(imageUri: string, roundId: string): Promise<string> {
  const userId = getUserId();
  if (!userId) throw new Error('Not authenticated');

  // Parse and upload similar to main image
  if (!imageUri.startsWith('data:')) {
    throw new Error('Thumbnail must be a data URL');
  }
  
  const matches = imageUri.match(/^data:(.+);base64,(.+)$/);
  if (!matches) throw new Error('Invalid data URL');
  
  const contentType = matches[1];
  const base64Data = matches[2];
  
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: contentType });

  const ext = contentType.includes('png') ? 'png' : 'jpg';
  const storagePath = `users/${userId}/thumbnails/${roundId}.${ext}`;
  const encodedPath = encodeURIComponent(storagePath);
  const downloadToken = generateDownloadToken();
  
  const uploadResponse = await fetchWithTimeout(getUploadUrl(storagePath), {
    method: 'POST',
    headers: {
      ...(await getHeaders()),
      'Content-Type': contentType,
      'x-goog-meta-firebaseStorageDownloadTokens': downloadToken,
    },
    body: blob,
  });

  if (!uploadResponse.ok) {
    logger.error('Thumbnail upload failed');
    return ''; // Non-critical, don't throw
  }

  const uploadData = await uploadResponse.json().catch(() => ({} as { downloadTokens?: string }));
  const tokenFromResponse = typeof uploadData.downloadTokens === 'string'
    ? uploadData.downloadTokens.split(',')[0]
    : undefined;
  
  return `${STORAGE_BASE_URL}/${encodedPath}?alt=media&token=${tokenFromResponse || downloadToken}`;
}

/**
 * Upload an OCR error image (original) for admin review
 * @param imageUri - Image URI
 * @param errorId - OCR error ID
 * @returns Download URL
 */
export async function uploadOcrErrorImage(imageUri: string, errorId: string): Promise<string> {
  const userId = getUserId();
  if (!userId) throw new Error('Not authenticated');

  let blob: Blob;
  let contentType = 'image/jpeg';

  if (imageUri.startsWith('data:')) {
    const matches = imageUri.match(/^data:(.+);base64,(.+)$/);
    if (!matches) throw new Error('Invalid data URL');

    contentType = matches[1];
    const base64Data = matches[2];
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    blob = new Blob([byteArray], { type: contentType });
  } else {
    const response = await fetchWithTimeout(imageUri);
    blob = await response.blob();
    contentType = blob.type || 'image/jpeg';
  }

  const ext = contentType.includes('png') ? 'png' : contentType.includes('gif') ? 'gif' : 'jpg';
  const storagePath = `ocr-errors/${userId}/${errorId}.${ext}`;
  const encodedPath = encodeURIComponent(storagePath);
  const downloadToken = generateDownloadToken();

  const uploadResponse = await fetchWithTimeout(getUploadUrl(storagePath), {
    method: 'POST',
    headers: {
      ...(await getHeaders()),
      'Content-Type': contentType,
      'x-goog-meta-firebaseStorageDownloadTokens': downloadToken,
    },
    body: blob,
  });

  if (!uploadResponse.ok) {
    const error = await uploadResponse.json().catch(() => ({}));
    logger.error('OCR image upload error:', error);
    throw new Error('Failed to upload OCR error image');
  }

  const uploadData = await uploadResponse.json().catch(() => ({} as { downloadTokens?: string }));
  const tokenFromResponse = typeof uploadData.downloadTokens === 'string'
    ? uploadData.downloadTokens.split(',')[0]
    : undefined;
  return `${STORAGE_BASE_URL}/${encodedPath}?alt=media&token=${tokenFromResponse || downloadToken}`;
}

/**
 * Get the download URL for a scorecard image
 * @param roundId - Round ID
 * @returns Download URL or null if not found
 */
export async function getScorecardImageUrl(roundId: string): Promise<string | null> {
  const userId = getUserId();
  if (!userId) return null;

  // Try jpg first, then png
  for (const ext of ['jpg', 'png']) {
    const storagePath = `users/${userId}/scorecards/${roundId}.${ext}`;
    const encodedPath = encodeURIComponent(storagePath);
    
    try {
      const response = await fetchWithTimeout(`${STORAGE_BASE_URL}/${encodedPath}`, {
        headers: await getHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        const downloadToken = data.downloadTokens;
        return `${STORAGE_BASE_URL}/${encodedPath}?alt=media&token=${downloadToken}`;
      }
    } catch (error) {
      // File doesn't exist, try next extension
    }
  }

  return null;
}

/**
 * Delete a scorecard image
 * @param roundId - Round ID
 */
export async function deleteScorecardImage(roundId: string): Promise<void> {
  const userId = getUserId();
  if (!userId) return;

  for (const ext of ['jpg', 'png']) {
    const storagePath = encodeURIComponent(`users/${userId}/scorecards/${roundId}.${ext}`);
    
    try {
      await fetchWithTimeout(`${STORAGE_BASE_URL}/${storagePath}`, {
        method: 'DELETE',
        headers: await getHeaders(),
      });
    } catch (error) {
      // Ignore errors
    }
  }
  
  // Also delete thumbnail
  for (const ext of ['jpg', 'png']) {
    const thumbPath = encodeURIComponent(`users/${userId}/thumbnails/${roundId}.${ext}`);
    
    try {
      await fetchWithTimeout(`${STORAGE_BASE_URL}/${thumbPath}`, {
        method: 'DELETE',
        headers: await getHeaders(),
      });
    } catch (error) {
      // Ignore errors
    }
  }
  
  logger.debug('✓ Scorecard images deleted for round:', roundId);
}

export async function deleteStoragePath(storagePath: string): Promise<void> {
  const path = String(storagePath || '').trim();
  if (!path) return;
  const encoded = encodeURIComponent(path);
  await fetchWithTimeout(`${STORAGE_BASE_URL}/${encoded}`, {
    method: 'DELETE',
    headers: await getHeaders(),
  });
}

export async function deleteStorageObjectByUrl(url: string): Promise<void> {
  const storagePath = extractStoragePathFromFirebaseUrl(url);
  if (!storagePath) return;
  try {
    await deleteStoragePath(storagePath);
  } catch {
    // Ignore missing file and cleanup errors during best-effort deletion flows
  }
}

/**
 * Create a thumbnail from an image (client-side)
 * @param imageUri - Original image data URL
 * @param maxSize - Maximum dimension (default 200px)
 * @returns Thumbnail data URL
 */
export async function createThumbnail(imageUri: string, maxSize: number = 200): Promise<string> {
  if (Platform.OS !== 'web') {
    return imageUri;
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      // Calculate thumbnail dimensions
      let width = img.width;
      let height = img.height;
      
      if (width > height) {
        if (width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }
      
      // Create canvas and draw resized image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to create canvas context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      
      // Get data URL
      const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.7);
      resolve(thumbnailDataUrl);
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    img.src = imageUri;
  });
}

/**
 * Compress an image before upload
 * @param imageUri - Original image data URL
 * @param maxDimension - Maximum dimension (default 1600px)
 * @param quality - JPEG quality (default 0.8)
 * @returns Compressed image data URL
 */
export async function compressImage(
  imageUri: string, 
  maxDimension: number = 1600, 
  quality: number = 0.8
): Promise<string> {
  if (Platform.OS !== 'web') {
    return imageUri;
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      
      // Scale down if needed
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to create canvas context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      logger.debug(`Image compressed: ${Math.round(imageUri.length / 1024)}KB → ${Math.round(compressedDataUrl.length / 1024)}KB`);
      resolve(compressedDataUrl);
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image for compression'));
    };
    
    img.src = imageUri;
  });
}
