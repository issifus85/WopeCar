import { useState } from 'react';
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
import { COLORS, FONTS } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';

export default function LoginScreen() {
  const router = useRouter();
  const { redirect, ...redirectParams } = useLocalSearchParams();
  const { login, register } = useAuth();
  const [mode, setMode] = useState('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const isSignUp = mode === 'signup';

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError(null);
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
      if (redirect) {
        router.replace({ pathname: redirect, params: redirectParams });
      } else if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/profile');
      }
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
                  placeholderTextColor="#999"
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
                placeholderTextColor="#999"
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
                placeholderTextColor="#999"
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
                  placeholderTextColor="#999"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                />
              </View>
            )}

            {!isSignUp && (
              <TouchableOpacity style={styles.forgotLink}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            )}

            {!!error && <Text style={styles.errorText}>{error}</Text>}

            <TouchableOpacity
              style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </Text>
              )}
            </TouchableOpacity>

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

const styles = StyleSheet.create({
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
    color: COLORS.white,
    textAlign: 'center',
  },
  subheadline: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: COLORS.white,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 28,
    paddingHorizontal: 16,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
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
    backgroundColor: COLORS.teal,
  },
  tabText: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    color: '#666',
  },
  tabTextActive: {
    color: '#ffffff',
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.navy,
    marginBottom: 6,
  },
  input: {
    fontFamily: FONTS.regular,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  forgotLink: {
    alignSelf: 'flex-end',
    marginBottom: 20,
  },
  forgotText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: COLORS.teal,
  },
  errorText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#C62828',
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
    color: '#ffffff',
    fontSize: 16,
  },
  switchModeText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginTop: 18,
  },
  switchModeLink: {
    fontFamily: FONTS.semiBold,
    color: COLORS.teal,
  },
});
