// Firebase Authentication Service using Firebase Auth SDK
// Much more reliable than REST API, especially on mobile

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInWithCredential,
  reauthenticateWithCredential,
  EmailAuthProvider,
  deleteUser,
  GoogleAuthProvider,
  OAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
  sendPasswordResetEmail as firebaseSendPasswordResetEmail,
  updateProfile,
} from 'firebase/auth';
import { Platform } from 'react-native';
import { auth } from './firebase';
import { logger } from '../utils/logger';
import { clearStorageNamespace } from './storage';

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

function convertFirebaseUser(firebaseUser: FirebaseUser): User {
  return {
    uid: firebaseUser.uid,
    email: firebaseUser.email,
    displayName: firebaseUser.displayName,
    photoURL: firebaseUser.photoURL,
  };
}

// Get current user (synchronous)
export function getCurrentUser(): User | null {
  if (!auth) return null;
  if (!auth.currentUser) return null;
  return convertFirebaseUser(auth.currentUser);
}

// Listen to auth state changes
export function onAuthChange(callback: (user: User | null) => void): () => void {
  if (!auth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(auth, (firebaseUser) => {
    if (firebaseUser) {
      logger.debug('✅ User signed in:', firebaseUser.email);
      callback(convertFirebaseUser(firebaseUser));
    } else {
      logger.debug('👤 User signed out');
      callback(null);
    }
  });
}

// Sign up with email/password
export async function signUpWithEmail(email: string, password: string): Promise<User> {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    logger.debug('✅ Account created:', userCredential.user.email);
    return convertFirebaseUser(userCredential.user);
  } catch (error: unknown) {
    logger.error('Sign up error:', error);
    throw new Error(getErrorMessage(getErrorCode(error)));
  }
}

// Sign in with email/password
export async function signInWithEmail(email: string, password: string): Promise<User> {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    logger.debug('✅ Signed in:', userCredential.user.email);
    return convertFirebaseUser(userCredential.user);
  } catch (error: unknown) {
    logger.error('Sign in error:', error);
    throw new Error(getErrorMessage(getErrorCode(error)));
  }
}

// Sign in with Google — web uses Firebase popup, mobile uses signInWithGoogleMobile()
export async function signInWithGoogle(): Promise<User> {
  logger.debug('🔐 Google Sign-In attempt — Platform:', Platform.OS);

  if (Platform.OS === 'web') {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      logger.debug('✅ Signed in with Google:', result.user.email);
      return convertFirebaseUser(result.user);
    } catch (error: unknown) {
      logger.error('Google Sign-In error:', error);
      const code = getErrorCode(error);
      if (code === 'auth/operation-not-allowed') {
        throw new Error('Google Sign-In is not enabled. Enable it in the Firebase Console under Authentication → Sign-in method.');
      }
      if (code === 'auth/unauthorized-domain') {
        throw new Error('This domain is not authorized for Google Sign-In. Add it in the Firebase Console under Authentication → Settings → Authorized domains.');
      }
      if (code === 'auth/popup-blocked') {
        throw new Error('Sign-in popup was blocked. Please allow popups for this site and try again.');
      }
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        throw new Error('Google Sign-In was cancelled.');
      }
      throw new Error(getErrorMessage(code || getErrorMessageText(error)));
    }
  }

  // Mobile: this should be handled by the useGoogleAuth hook in ProfileTab
  // Direct service call on mobile is not supported (Expo Go can't do custom-scheme OAuth)
  throw new Error('Google Sign-In on mobile uses the component hook. This should not be called directly.');
}

// Sign in with Google on mobile — called from useGoogleAuth hook with the id_token
export async function signInWithGoogleIdToken(idToken: string): Promise<User> {
  try {
    const credential = GoogleAuthProvider.credential(idToken);
    const firebaseResult = await signInWithCredential(auth, credential);
    logger.debug('✅ Signed in with Google (mobile):', firebaseResult.user.email);
    return convertFirebaseUser(firebaseResult.user);
  } catch (error: unknown) {
    logger.error('Google Sign-In credential error:', error);
    throw new Error(getErrorMessage(getErrorCode(error) || getErrorMessageText(error)));
  }
}

// Sign in with Apple — called from useAppleAuth hook with the Apple credential
export async function signInWithAppleCredential(
  identityToken: string,
  nonce: string,
  fullName?: { givenName?: string | null; familyName?: string | null } | null,
): Promise<User> {
  try {
    const provider = new OAuthProvider('apple.com');
    const credential = provider.credential({
      idToken: identityToken,
      rawNonce: nonce,
    });
    const firebaseResult = await signInWithCredential(auth, credential);

    // Apple only sends the name on the FIRST sign-in, so save it now
    if (fullName?.givenName && !firebaseResult.user.displayName) {
      const displayName = [fullName.givenName, fullName.familyName].filter(Boolean).join(' ');
      await updateProfile(firebaseResult.user, { displayName });
      logger.debug('✅ Saved Apple display name:', displayName);
    }

    logger.debug('✅ Signed in with Apple:', firebaseResult.user.email);
    return convertFirebaseUser(firebaseResult.user);
  } catch (error: unknown) {
    logger.error('Apple Sign-In credential error:', error);
    throw new Error(getErrorMessage(getErrorCode(error) || getErrorMessageText(error)));
  }
}

// Sign out
export async function signOut(): Promise<void> {
  try {
    await firebaseSignOut(auth);
    if (Platform.OS === 'web') {
      await clearStorageNamespace('@GolfSum:');
    }
    logger.debug('✅ Signed out successfully');
  } catch (error) {
    logger.error('Sign out error:', error);
    throw error;
  }
}

// Send password reset email
export async function sendPasswordReset(email: string): Promise<void> {
  try {
    await firebaseSendPasswordResetEmail(auth, email);
    logger.debug('✅ Password reset email sent to:', email);
  } catch (error: unknown) {
    logger.error('Password reset error:', error);
    throw new Error(getErrorMessage(getErrorCode(error)));
  }
}

// Update user profile
export async function updateUserProfile(displayName: string): Promise<void> {
  if (!auth.currentUser) throw new Error('Not authenticated');
  
  try {
    await updateProfile(auth.currentUser, { displayName });
    logger.debug('✅ Profile updated');
  } catch (error) {
    logger.error('Profile update error:', error);
    throw error;
  }
}

// Get auth token for Firestore REST API (if needed)
export async function getAuthToken(): Promise<string | null> {
  if (!auth.currentUser) return null;
  try {
    return await auth.currentUser.getIdToken();
  } catch (error) {
    logger.error('Error getting auth token:', error);
    return null;
  }
}

export async function refreshAuthToken(): Promise<string | null> {
  if (!auth.currentUser) return null;
  try {
    return await auth.currentUser.getIdToken(true);
  } catch (error) {
    logger.error('Error refreshing auth token:', error);
    return null;
  }
}

export function getPrimaryProviderId(): string | null {
  if (!auth?.currentUser) return null;
  const provider = auth.currentUser.providerData?.[0]?.providerId;
  return typeof provider === 'string' ? provider : null;
}

export async function reauthenticateWithPassword(password: string): Promise<void> {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser || !firebaseUser.email) {
    throw new Error('Not authenticated');
  }
  const credential = EmailAuthProvider.credential(firebaseUser.email, password);
  await reauthenticateWithCredential(firebaseUser, credential);
}

export async function deleteCurrentAuthUser(): Promise<void> {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) throw new Error('Not authenticated');
  await deleteUser(firebaseUser);
}

// Convert Firebase error codes to user-friendly messages
function getErrorMessage(errorCode: string): string {
  switch (errorCode) {
    case 'auth/email-already-in-use':
      return 'This email is already registered';
    case 'auth/invalid-email':
      return 'Invalid email address';
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in is not enabled';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters';
    case 'auth/user-disabled':
      return 'This account has been disabled';
    case 'auth/user-not-found':
      return 'No account found with this email';
    case 'auth/wrong-password':
      return 'Incorrect password';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection';
    case 'auth/invalid-credential':
      return 'Invalid email or password';
    default:
      return 'Authentication error. Please try again';
  }
}

function getErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  if ('code' in error && typeof (error as { code?: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  return '';
}

function getErrorMessageText(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message;
  return '';
}
