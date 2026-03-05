import React from 'react';
import { View, Text, TouchableOpacity, TextInput, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type AuthMode = 'signin' | 'signup' | 'forgot';

interface AuthFormViewProps {
  authMode: AuthMode;
  email: string;
  password: string;
  confirmPassword?: string;
  isLoading: boolean;
  error: string | null;
  successMessage: string | null;
  onBack: () => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange?: (value: string) => void;
  onSubmit: () => void;
  onGoogleSignIn: () => void;
  onAppleSignIn?: () => void;
  isAppleAvailable?: boolean;
  onSetAuthMode: (mode: AuthMode) => void;
  styles: any;
}

export const AuthFormView: React.FC<AuthFormViewProps> = ({
  authMode,
  email,
  password,
  confirmPassword,
  isLoading,
  error,
  successMessage,
  onBack,
  onEmailChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
  onGoogleSignIn,
  onAppleSignIn,
  isAppleAvailable,
  onSetAuthMode,
  styles,
}) => {
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backButtonTop} onPress={onBack}>
        <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <View style={styles.authForm}>
        <Text style={styles.authTitle}>
          {authMode === 'signin' ? 'Sign In' : authMode === 'signup' ? 'Create Account' : 'Reset Password'}
        </Text>
        <Text style={styles.authSubtitle}>
          {authMode === 'signin'
            ? 'Sign in to sync your rounds'
            : authMode === 'signup'
            ? 'Create an account to save your data'
            : 'Enter your email to reset password'}
        </Text>

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle" size={18} color="#E07575" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {successMessage && (
          <View style={styles.successBox}>
            <Ionicons name="checkmark-circle" size={18} color="#10B981" />
            <Text style={styles.successText}>{successMessage}</Text>
          </View>
        )}

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#6B7280"
          value={email}
          onChangeText={onEmailChange}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        {authMode !== 'forgot' && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#6B7280"
              value={password}
              onChangeText={onPasswordChange}
              secureTextEntry
            />
            {authMode === 'signup' && (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Confirm Password"
                  placeholderTextColor="#6B7280"
                  value={confirmPassword || ''}
                  onChangeText={onConfirmPasswordChange}
                  secureTextEntry
                />
                <Text style={{ color: '#6B7280', fontSize: 12, marginTop: -4, marginBottom: 4 }}>
                  Min 8 characters with uppercase, lowercase, and a number
                </Text>
              </>
            )}
          </>
        )}

        <TouchableOpacity
          style={[styles.authButton, isLoading && styles.authButtonDisabled]}
          onPress={onSubmit}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.authButtonText}>
              {authMode === 'signin' ? 'Sign In' : authMode === 'signup' ? 'Create Account' : 'Send Reset Link'}
            </Text>
          )}
        </TouchableOpacity>

        {authMode !== 'forgot' && (
          <>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <TouchableOpacity style={styles.googleButton} onPress={onGoogleSignIn}>
              <Ionicons name="logo-google" size={20} color="#FFFFFF" />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </TouchableOpacity>

            {isAppleAvailable && onAppleSignIn && (
              <TouchableOpacity style={styles.appleButton} onPress={onAppleSignIn}>
                <Ionicons name="logo-apple" size={20} color="#FFFFFF" />
                <Text style={styles.appleButtonText}>Continue with Apple</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <View style={styles.authLinks}>
          {authMode === 'signin' && (
            <>
              <TouchableOpacity onPress={() => onSetAuthMode('forgot')}>
                <Text style={styles.authLink}>Forgot password?</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onSetAuthMode('signup')}>
                <Text style={styles.authLink}>Create account</Text>
              </TouchableOpacity>
            </>
          )}
          {authMode === 'signup' && (
            <TouchableOpacity onPress={() => onSetAuthMode('signin')}>
              <Text style={styles.authLink}>Already have an account? Sign in</Text>
            </TouchableOpacity>
          )}
          {authMode === 'forgot' && (
            <TouchableOpacity onPress={() => onSetAuthMode('signin')}>
              <Text style={styles.authLink}>Back to sign in</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};
