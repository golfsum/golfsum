// Apple Sign-In hook for iOS (EAS Build)
// Uses expo-apple-authentication for the native Apple Sign-In flow.
// The identity token is exchanged with Firebase via OAuthProvider('apple.com').
//
// Requirements:
//   - "Sign in with Apple" capability enabled in Xcode / Apple Developer Portal
//   - Apple provider enabled in Firebase Console → Authentication → Sign-in method
//   - expo-apple-authentication installed

import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { signInWithAppleCredential, User } from '../services/firebaseAuthService';
import { logger } from '../utils/logger';

interface UseAppleAuthReturn {
  /** Trigger the Apple Sign-In flow */
  promptAppleSignIn: () => Promise<void>;
  /** Whether Apple auth is available on this device (iOS 13+) */
  isAvailable: boolean;
  /** Whether we're currently authenticating */
  isAuthenticating: boolean;
}

export function useAppleAuth(
  onSuccess: (user: User) => void,
  onError: (error: string) => void,
): UseAppleAuthReturn {
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Apple Sign-In is only available on iOS 13+
  const isAvailable = Platform.OS === 'ios';

  const promptAppleSignIn = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      onError('Apple Sign-In is only available on iOS.');
      return;
    }

    setIsAuthenticating(true);

    try {
      // Check availability at runtime (iOS 13+ requirement)
      const available = await AppleAuthentication.isAvailableAsync();
      if (!available) {
        onError('Apple Sign-In is not available on this device. Requires iOS 13 or later.');
        setIsAuthenticating(false);
        return;
      }

      // Generate a random nonce — Firebase requires this for security
      const nonce = Math.random().toString(36).substring(2, 18) +
                    Math.random().toString(36).substring(2, 18);
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        nonce,
      );

      logger.debug('🍎 Launching Apple Sign-In...');

      // Present the native Apple Sign-In dialog
      const appleCredential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!appleCredential.identityToken) {
        onError('No identity token received from Apple. Please try again.');
        setIsAuthenticating(false);
        return;
      }

      logger.debug('🍎 Got Apple identity token, exchanging with Firebase...');

      // Exchange with Firebase
      const user = await signInWithAppleCredential(
        appleCredential.identityToken,
        nonce, // raw nonce (not hashed) — Firebase hashes it internally
        appleCredential.fullName,
      );

      logger.debug('✅ Apple Sign-In complete:', user.email);
      onSuccess(user);
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err) {
        const code = (err as { code: string }).code;
        if (code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED') {
          // User tapped "Cancel" — not an error
          logger.debug('🍎 Apple Sign-In cancelled by user');
          setIsAuthenticating(false);
          return;
        }
      }
      logger.error('Apple Sign-In error:', err);
      const msg = err instanceof Error ? err.message : 'Apple Sign-In failed';
      onError(msg);
    } finally {
      setIsAuthenticating(false);
    }
  }, [onSuccess, onError]);

  return {
    promptAppleSignIn,
    isAvailable,
    isAuthenticating,
  };
}
