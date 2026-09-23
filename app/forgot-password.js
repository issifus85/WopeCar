import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { requestPasswordReset, verifyPasswordResetCode } = useAuth();

  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [isSent, setIsSent] = useState(false);

  // Code step - the primary path now, not a fallback (see
  // verifyPasswordResetCode's own comment for why the tappable link alone
  // isn't reliable: an email link-safety scanner can silently consume its
  // one-time token before the user ever taps it themselves, which is
  // exactly what a real user hit live, consistently, on a freshly requested
  // link they'd genuinely never clicked yet).
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [codeError, setCodeError] = useState(null);

  const handleSubmit = async () => {
    setError(null);
    if (!email) {
      setError('Please enter your email address.');
      return;
    }

    setIsSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setIsSent(true);
    } catch (e) {
      // Deliberately generic - Supabase's resetPasswordForEmail() doesn't
      // reveal whether the email exists either, so this shows the same
      // confirmation regardless; only real send failures (rate limit,
      // network) land here as an actual error.
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async () => {
    setCodeError(null);
    if (!code.trim()) {
      setCodeError('Please enter the code from your email.');
      return;
    }

    setIsVerifying(true);
    try {
      await verifyPasswordResetCode(email.trim(), code.trim());
      router.replace('/reset-password');
    } catch (e) {
      setCodeError(e.message || 'That code is incorrect or has expired. Please request a new one.');
    } finally {
      setIsVerifying(false);
    }
  };

  if (isSent) {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.sentIconRow}>
          <View style={styles.sentIcon}>
            <Ionicons name="mail-outline" size={32} color={colors.teal} />
          </View>
        </View>
        <Text style={styles.sentTitle}>Check your email</Text>
        <Text style={styles.sentText}>
          If an account exists for {email.trim()}, we've sent a 6-digit code to reset your password. It may
          take a few minutes to arrive - check your spam folder too.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>6-Digit Code</Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            placeholder="123456"
            placeholderTextColor={colors.textSubtle}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            maxLength={6}
          />
        </View>

        {!!codeError && <Text style={styles.errorText}>{codeError}</Text>}

        <TouchableOpacity
          style={[styles.submitButton, isVerifying && styles.submitButtonDisabled]}
          onPress={handleVerifyCode}
          disabled={isVerifying}
        >
          {isVerifying ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.submitButtonText}>Confirm Code</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkButton} onPress={() => setIsSent(false)}>
          <Text style={styles.linkButtonText}>Didn&apos;t get it? Try a different email</Text>
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.intro}>
        Enter the email on your account and we'll send you a code to set a new password.
      </Text>

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

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <TouchableOpacity
        style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.submitButtonText}>Send Code</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex: {
      flex: 1,
    },
    content: {
      padding: 20,
      paddingBottom: 40,
    },
    intro: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      lineHeight: 19,
      marginBottom: 20,
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
      backgroundColor: colors.surface,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.textPrimary,
    },
    errorText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.error,
      marginBottom: 16,
      textAlign: 'center',
    },
    submitButton: {
      backgroundColor: colors.teal,
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
    sentIconRow: {
      alignItems: 'center',
      marginBottom: 20,
    },
    sentIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sentTitle: {
      fontFamily: FONTS.bold,
      fontSize: 20,
      color: colors.textPrimary,
      marginBottom: 10,
      textAlign: 'center',
    },
    sentText: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textSubtle,
      textAlign: 'center',
      lineHeight: 21,
      marginBottom: 28,
    },
    // Wider letter-spacing and a bigger, centered numeral face - a 6-digit
    // code reads as a code (not just another text field) at a glance,
    // matching the visual convention most OTP inputs use.
    codeInput: {
      fontFamily: FONTS.semiBold,
      fontSize: 24,
      letterSpacing: 8,
      textAlign: 'center',
    },
    linkButton: {
      marginTop: 16,
      alignItems: 'center',
    },
    linkButtonText: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.teal,
    },
  });
}
