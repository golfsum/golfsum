// Firebase SDK - Authentication and Firestore
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { Platform } from 'react-native';
import { logger } from '../utils/logger';

// All Firebase config values must come from environment variables.
// Set EXPO_PUBLIC_FIREBASE_* in your .env file (see env.example.txt).
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
};

const isConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);

let app: FirebaseApp;
let auth: Auth;
let db: Firestore | null = null;

if (!isConfigured) {
  logger.debug('⚠️ Firebase env vars not set — running in local-only mode.');
  logger.debug('   Set EXPO_PUBLIC_FIREBASE_* in your .env file to enable cloud sync.');
}

try {
  if (isConfigured) {
    // Initialize Firebase app
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    
    // Initialize Auth with persistent sessions on native.
    // This keeps users signed in across app restarts until explicit sign-out.
    if (Platform.OS === 'web') {
      auth = getAuth(app);
    } else {
      try {
        const {
          initializeAuth: initializeNativeAuth,
          getReactNativePersistence,
        } = require('@firebase/auth');
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        auth = initializeNativeAuth(app, {
          persistence: getReactNativePersistence(AsyncStorage),
        });
      } catch (authInitError: unknown) {
        const msg = authInitError && typeof authInitError === 'object' && 'message' in authInitError
          ? String((authInitError as { message?: unknown }).message || '')
          : '';
        if (
          msg.toLowerCase().includes('already initialized')
        ) {
          logger.warn('⚠️ React Native auth already initialized. Reusing existing auth instance.');
          auth = getAuth(app);
        } else if (msg.toLowerCase().includes('cannot find module')) {
          logger.warn('⚠️ React Native auth persistence module unavailable. Falling back to default auth.');
          auth = getAuth(app);
        } else {
          throw authInitError;
        }
      }
    }
    
    // Initialize Firestore
    db = getFirestore(app);

    // Enable App Check on web when configured
    if (Platform.OS === 'web') {
      const appCheckKey = process.env.EXPO_PUBLIC_FIREBASE_APP_CHECK_KEY;
      if (appCheckKey) {
        try {
          initializeAppCheck(app, {
            provider: new ReCaptchaV3Provider(appCheckKey),
            isTokenAutoRefreshEnabled: true
          });
          logger.debug('✅ Firebase App Check enabled');
        } catch (error) {
          logger.error('❌ Firebase App Check initialization failed:', error);
        }
      }
    }
    
    logger.debug('✅ Firebase initialized successfully');
    logger.debug('   Platform:', Platform.OS);
    logger.debug('   Auth persistence:', Platform.OS === 'web' ? 'IndexedDB' : 'AsyncStorage');
  }
} catch (error) {
  logger.error('❌ Firebase initialization failed:', error);
  // Hard fallback: avoid crashing auth flows if optional persistence init fails.
  try {
    if (isConfigured && getApps().length) {
      const fallbackApp = getApp();
      auth = getAuth(fallbackApp);
      if (!db) db = getFirestore(fallbackApp);
      logger.warn('⚠️ Using Firebase fallback auth initialization.');
    }
  } catch (fallbackError) {
    logger.error('❌ Firebase fallback initialization failed:', fallbackError);
  }
}

export { app, auth, db };
export const isFirebaseEnabled = isConfigured;
