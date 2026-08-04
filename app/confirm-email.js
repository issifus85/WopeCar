import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import supabase from '../services/supabase';

// The confirmation email's link points here instead of straight at
// Supabase's own /verify endpoint (see the Confirm Signup email template -
// {{ .SiteURL }}/confirm-email?token_hash={{ .TokenHash }}&type=signup, or
// the wopecar://confirm-email native equivalent). That one change is the
// entire point of this screen existing: Supabase's default link confirms
// the instant it's opened via a plain GET request, which means an email
// client's automated link-safety scanner (Gmail, Outlook Safe Links, etc.)
// silently consumes it before the real user ever clicks - see
// app/email-confirmed.js's "already used" fallback, which exists to soften
// that. This screen requires an actual button press to call verifyOtp(), so
// a scanner doing a routine GET-fetch of the link never triggers it - only
// a real click does.
export default function ConfirmEmailScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { token_hash: tokenHash, type } = useLocalSearchParams();

  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState(null);

  const isValidLink = !!tokenHash && !!type;

  const handleConfirm = async () => {
    setIsConfirming(true);
    setError(null);
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: String(tokenHash),
        type: String(type),
      });
      if (verifyError) throw verifyError;
      router.replace('/email-confirmed');
    } catch (e) {
      // Same "already used" reality as email-confirmed.js's fallback - if a
      // scanner somehow did trigger this (a JS-executing scanner, rarer but
      // not impossible), or the link is simply past its ~1 hour expiry, the
      // account may already be confirmed. Point at Sign In rather than a
      // dead end either way.
      setError(e.message || 'This link is no longer valid.');
      setIsConfirming(false);
    }
  };

  if (!isValidLink) {
    return (
      <View style={styles.container}>
        <View style={styles.wrap}>
          <View style={styles.icon}>
            <Ionicons name="alert-circle-outline" size={40} color={colors.error} />
          </View>
          <Text style={styles.title}>Invalid Link</Text>
          <Text style={styles.text}>
            This confirmation link is missing or malformed. Please use the link from your confirmation email, or sign up again.
          </Text>
          <TouchableOpacity style={styles.button} onPress={() => router.replace('/login')}>
            <Text style={styles.buttonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.wrap}>
        <View style={styles.icon}>
          <Ionicons name="mail-outline" size={40} color={colors.teal} />
        </View>
        <Text style={styles.title}>Confirm Your Email</Text>
        <Text style={styles.text}>
          Tap below to finish verifying your WopeCar account.
        </Text>

        {!!error && <Text style={styles.errorText}>{error}</Text>}

        <TouchableOpacity
          style={[styles.button, isConfirming && styles.buttonDisabled]}
          onPress={handleConfirm}
          disabled={isConfirming}
        >
          {isConfirming ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>Confirm My Email</Text>
          )}
        </TouchableOpacity>

        {!!error && (
          <TouchableOpacity style={styles.secondaryLink} onPress={() => router.replace('/login')}>
            <Text style={styles.secondaryLinkText}>Already confirmed? Sign In</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    wrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    icon: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 20,
    },
    title: {
      fontFamily: FONTS.bold,
      fontSize: 22,
      color: colors.textPrimary,
      marginBottom: 10,
    },
    text: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textSubtle,
      textAlign: 'center',
      lineHeight: 21,
      marginBottom: 28,
    },
    errorText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.error,
      textAlign: 'center',
      marginBottom: 16,
    },
    button: {
      alignSelf: 'stretch',
      backgroundColor: colors.teal,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
    },
    buttonDisabled: {
      opacity: 0.7,
    },
    buttonText: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
      fontSize: 16,
    },
    secondaryLink: {
      marginTop: 16,
    },
    secondaryLinkText: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.teal,
    },
  });
}
