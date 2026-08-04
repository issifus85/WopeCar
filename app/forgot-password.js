import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { requestPasswordReset } = useAuth();

  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [isSent, setIsSent] = useState(false);

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

  if (isSent) {
    return (
      <View style={styles.container}>
        <View style={styles.sentWrap}>
          <View style={styles.sentIcon}>
            <Ionicons name="mail-outline" size={32} color={colors.teal} />
          </View>
          <Text style={styles.sentTitle}>Check your email</Text>
          <Text style={styles.sentText}>
            If an account exists for {email.trim()}, we've sent a link to reset your password. It may take a
            few minutes to arrive - check your spam folder too.
          </Text>
          <TouchableOpacity style={styles.submitButton} onPress={() => router.back()}>
            <Text style={styles.submitButtonText}>Back to Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.intro}>
        Enter the email on your account and we'll send you a link to set a new password.
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
          <Text style={styles.submitButtonText}>Send Reset Link</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
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
    sentWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    sentIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    sentTitle: {
      fontFamily: FONTS.bold,
      fontSize: 20,
      color: colors.textPrimary,
      marginBottom: 10,
    },
    sentText: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textSubtle,
      textAlign: 'center',
      lineHeight: 21,
      marginBottom: 28,
    },
  });
}
