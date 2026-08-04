import { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { FontAwesome } from '@expo/vector-icons';
import { COLORS, FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

export default function LoginScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { redirect, ...redirectParams } = useLocalSearchParams();
  const { login, register, loginWithSocial } = useAuth();
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [socialProvider, setSocialProvider] = useState(null);
  const [error, setError] = useState(null);

  const isSignUp = mode === 'signup';
  const isBusy = isSubmitting || !!socialProvider;

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError(null);
  };

  const navigateAfterAuth = () => {
    if (redirect) {
      router.replace({ pathname: redirect, params: redirectParams });
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/profile');
    }
  };

  const handleSubmit = async () => {
    setError(null);

    if (!email || !password) {
      setError('Please fill in your email and password.');
      return;
    }
    if (isSignUp && !name) {
      setError('Please enter your name.');
      return;
    }
    if (isSignUp && password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isSignUp) {
        await register({ name, email, password, passwordConfirmation: confirmPassword });
      } else {
        await login({ email, password });
      }
      navigateAfterAuth();
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Same action for sign-in and sign-up (the backend finds-or-creates the
  // account), so this works regardless of which tab is active.
  const handleSocialLogin = async (provider) => {
    setError(null);
    setSocialProvider(provider);
    try {
      await loginWithSocial(provider);
      navigateAfterAuth();
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setSocialProvider(null);
    }
  };

  return (
    <ImageBackground
      source={require('../assets/auth-background.jpg')}
      style={styles.background}
      resizeMode="cover"
    >
      <View style={styles.overlay} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Image
            source={require('../assets/logo-mark-navy.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.headline}>
            {isSignUp ? 'Create Account' : 'Welcome Back'}
          </Text>
          <Text style={styles.subheadline}>
            {isSignUp
              ? 'Sign up to start booking cars in a few clicks'
              : 'Sign in to manage your bookings'}
          </Text>

          <View style={styles.card}>
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tab, !isSignUp && styles.tabActive]}
                onPress={() => switchMode('signin')}
              >
                <Text style={[styles.tabText, !isSignUp && styles.tabTextActive]}>
                  Sign In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, isSignUp && styles.tabActive]}
                onPress={() => switchMode('signup')}
              >
                <Text style={[styles.tabText, isSignUp && styles.tabTextActive]}>
                  Sign Up
                </Text>
              </TouchableOpacity>
            </View>

            {isSignUp && (
              <View style={styles.field}>
                <Text style={styles.label}>Full Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Kwame Mensah"
                  placeholderTextColor={colors.textSubtle}
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
              </View>
            )}

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor={colors.textSubtle}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={colors.textSubtle}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            {isSignUp && (
              <View style={styles.field}>
                <Text style={styles.label}>Confirm Password</Text>
                <TextInput
                  style={styles.input}
                  placeholder="••••••••"
                  placeholderTextColor={colors.textSubtle}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                />
              </View>
            )}

            {!isSignUp && (
              <TouchableOpacity style={styles.forgotLink} onPress={() => router.push('/forgot-password')}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            )}

            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity
              style={[styles.submitButton, isBusy && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={isBusy}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.submitButtonText}>
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </Text>
              )}
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.socialRow}>
              <TouchableOpacity
                style={[styles.socialButton, isBusy && styles.socialButtonDisabled]}
                onPress={() => handleSocialLogin('google')}
                disabled={isBusy}
              >
                {socialProvider === 'google' ? (
                  <ActivityIndicator color={colors.textMuted} size="small" />
                ) : (
                  <>
                    <FontAwesome name="google" size={16} color="#DB4437" />
                    <Text style={styles.socialButtonText}>Google</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <Text style={styles.switchModeText}>
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <Text
                style={styles.switchModeLink}
                onPress={() => switchMode(isSignUp ? 'signin' : 'signup')}
              >
                {isSignUp ? 'Sign In' : 'Sign Up'}
              </Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ImageBackground>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COLORS.teal,
    opacity: 0.8,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 60,
  },
  logo: {
    width: 64,
    height: 73,
    marginBottom: 16,
  },
  headline: {
    fontFamily: FONTS.display,
    fontSize: 28,
    color: colors.white,
    textAlign: 'center',
  },
  subheadline: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: colors.white,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 28,
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    shadowColor: colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: colors.divider,
    borderRadius: 10,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.teal,
  },
  tabText: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.white,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  input: {
    fontFamily: FONTS.regular,
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
  forgotLink: {
    alignSelf: 'flex-end',
    marginBottom: 20,
  },
  forgotText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: colors.teal,
  },
  errorText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: colors.error,
    marginBottom: 16,
    textAlign: 'center',
  },
  submitButton: {
    backgroundColor: COLORS.orange,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontFamily: FONTS.semiBold,
    color: colors.white,
    fontSize: 16,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: colors.textSubtle,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  socialButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  socialButtonDisabled: {
    opacity: 0.7,
  },
  socialButtonText: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  switchModeText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 18,
  },
  switchModeLink: {
    fontFamily: FONTS.semiBold,
    color: colors.teal,
  },
  });
}
