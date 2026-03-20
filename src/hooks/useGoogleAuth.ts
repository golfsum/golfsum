// Google Sign-In hook for iOS (EAS Build)
// Uses expo-auth-session Google provider which handles:
//   - iOS: opens Google sign-in via ASWebAuthenticationSession
//   - Redirects back using the reversed iOS client ID URL scheme
//   - Returns an id_token which we exchange with Firebase
//
// Required env vars:
//   EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID  — iOS OAuth client ID from Google Cloud Console
//   EXPO_PUBLIC_GOOGLE_CLIENT_ID      — Web OAuth client ID (used as the token audience)

import { useEffect, useCallback, useRef } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { signInWithGoogleIdToken, User } from '../services/firebaseAuthService';
import { logger } from '../utils/logger';

// Required for the auth session redirect to complete when the app re-opens
WebBrowser.maybeCompleteAuthSession();

interface UseGoogleAuthReturn {
  /** Trigger the Google Sign-In flow */
  promptGoogleSignIn: () => Promise<void>;
  /** Whether the auth request is ready */
  isReady: boolean;
}

export function useGoogleAuth(
  onSuccess: (user: User) => void,
  onError: (error: string) => void,
): UseGoogleAuthReturn {
  // Use refs to avoid stale closures in useEffect
  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  // Web client ID is used as the "audience" for the ID token
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID || '';
  // iOS client ID — this is the one that actually drives the native iOS OAuth flow
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '';

  logger.debug('🔐 useGoogleAuth init (iOS):', {
    webClientId: webClientId ? '✅ set' : '❌ missing',
    iosClientId: iosClientId ? '✅ set' : '❌ MISSING — create one at console.cloud.google.com',
  });

  // Google.useIdTokenAuthRequest picks the right client ID per platform
  // On iOS it uses iosClientId for the OAuth flow and webClientId as the audience
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: webClientId,
    iosClientId: iosClientId || undefined,
  });

  // Handle the auth response when it arrives
  useEffect(() => {
    if (!response) return;

    logger.debug('🔐 Google auth response:', response.type);

    if (response.type === 'success') {
      const idToken = response.params?.id_token;
      if (idToken) {
        logger.debug('🔐 Got Google ID token, exchanging with Firebase...');
        signInWithGoogleIdToken(idToken)
          .then(user => {
            logger.debug('✅ Google Sign-In complete:', user.email);
            onSuccessRef.current(user);
          })
          .catch(err => {
            logger.error('Firebase credential exchange failed:', err);
            onErrorRef.current(err instanceof Error ? err.message : 'Google Sign-In failed');
          });
      } else {
        logger.error('Google auth success but no id_token in response');
        onErrorRef.current('No ID token received from Google. Check your OAuth client configuration.');
      }
    } else if (response.type === 'error') {
      const errorMsg = response.error?.message || 'Google Sign-In failed';
      logger.error('Google auth error:', response.error);

      if (errorMsg.includes('invalid_request') || errorMsg.includes('redirect_uri')) {
        onErrorRef.current(
          'Google OAuth redirect error. Make sure EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is set to an iOS OAuth client ' +
          '(not a Web client). Create one at Google Cloud Console → Credentials → OAuth 2.0 Client IDs → iOS.'
        );
      } else {
        onErrorRef.current(errorMsg);
      }
    }
    // type === 'dismiss' or 'locked' means user cancelled — do nothing
  }, [response]);

  const promptGoogleSignIn = useCallback(async () => {
    if (!iosClientId) {
      onErrorRef.current(
        'Google sign-in is not set up on iPhone yet. Add EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID to your .env file.'
      );
      return;
    }
    if (!request) {
      onErrorRef.current('Google sign-in is still loading. Try again in a moment.');
      return;
    }
    try {
      logger.debug('🔐 Launching Google Sign-In prompt (iOS)...');
      await promptAsync();
    } catch (err) {
      logger.error('Google promptAsync error:', err);
      onErrorRef.current(err instanceof Error ? err.message : 'Google sign-in did not open.');
    }
  }, [request, promptAsync, iosClientId]);

  return {
    promptGoogleSignIn,
    isReady: !!request,
  };
}
