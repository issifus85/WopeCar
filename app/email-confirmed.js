import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { sendWelcomeEmail } from '../services/supabaseApi';

// Reached via a Supabase signup-confirmation link. Two real outcomes land
// here, not just the happy path:
//  - Success: app/_layout.js has already established the session (web via
//    the SIGNED_IN auth event, native via the email-confirmed deep link
//    handler calling setSession()) - useAuth().user is populated.
//  - Already used/expired: most commonly an email security scanner (Gmail,
//    Outlook "Safe Links", etc.) pre-fetched the link before the real user
//    clicked it, which silently consumed Supabase's one-time token - the
//    account WAS genuinely confirmed at that moment, this specific click
//    just doesn't carry a fresh session. Supabase redirects with
//    #error=...&error_description=... (web) instead of a token in that
//    case, and previously the app rendered nothing for that state at all -
//    which is the "blank page" this handles.
export default function EmailConfirmedScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, isLoading } = useAuth();
  const params = useLocalSearchParams();

  // Web: captured once, synchronously (see the matching pattern in
  // app/_layout.js) - Supabase's own error hash, same fragment convention
  // as its success case.
  const [webLinkError] = useState(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
    if (!window.location.hash.includes('error=')) return null;
    const parsed = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    return parsed.get('error_description')?.replace(/\+/g, ' ') || 'This confirmation link is no longer valid.';
  });

  // Native: app/_layout.js's Linking handler parses the deep link and, on
  // an error redirect, forwards here via router params instead of a session.
  const nativeLinkError = Platform.OS !== 'web' && params.linkError ? String(params.linkError) : null;

  const linkError = webLinkError || nativeLinkError;

  if (!linkError && isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={colors.teal} style={styles.loading} />
      </View>
    );
  }

  // Genuine failure state is rare (an actually-expired, >1-hour-old link)
  // vs. the common "already used by a scanner" case - both land here since
  // there's nothing actionable to tell them apart, and the fix is the same
  // either way: your account is fine, sign in.
  const isAlreadyHandled = !!linkError || !user;

  // Server-side idempotent (see send-welcome-email), so it's safe to just
  // fire this whenever this screen renders a genuine first-time success -
  // no local "have we sent this" tracking needed here.
  useEffect(() => {
    if (!isAlreadyHandled && user) {
      sendWelcomeEmail().catch(() => {});
    }
  }, [isAlreadyHandled, user]);

  return (
    <View style={styles.container}>
      <View style={styles.wrap}>
        <View style={styles.icon}>
          <Ionicons
            name={isAlreadyHandled ? 'shield-checkmark' : 'checkmark-circle'}
            size={40}
            color={colors.teal}
          />
        </View>
        <Text style={styles.title}>{isAlreadyHandled ? "You're Verified" : 'Email Confirmed'}</Text>
        <Text style={styles.text}>
          {isAlreadyHandled
            ? "This link has already been used, but your account is confirmed - it's ready to sign in to. (This usually happens because an email app already opened the link automatically to scan it for safety.)"
            : "Your account is verified and you're signed in. You're all set to start browsing and booking cars."}
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace(isAlreadyHandled ? '/login' : '/(tabs)')}
        >
          <Text style={styles.buttonText}>{isAlreadyHandled ? 'Sign In' : 'Continue'}</Text>
        </TouchableOpacity>
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
    loading: {
      flex: 1,
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
    button: {
      alignSelf: 'stretch',
      backgroundColor: colors.teal,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
    },
    buttonText: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
      fontSize: 16,
    },
  });
}
