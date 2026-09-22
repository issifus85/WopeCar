import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import supabase from '../services/supabase';
import { parseTokensFromUrl, parseAuthErrorFromUrl } from '../services/supabaseAuthApi';

// Reached via a Supabase password-recovery link. Being a REAL file-based
// route is the fix itself, not an implementation detail: without one,
// expo-router's own linking resolves this deep link against the file tree
// immediately and unconditionally shows its "Unmatched Route" screen,
// regardless of whether any Linking listener elsewhere could have handled
// it - confirmed live on a real Android build. Mirrors
// app/email-confirmed.js's identical fix for the equivalent
// signup-confirmation gap (that route already existed as a file, which is
// exactly why it never hit this bug).
//
// Native: owns its own token parsing (Linking.getInitialURL() for a cold
// launch, addEventListener('url') for a warm one) rather than splitting
// this across a global app/_layout.js listener and this screen - fragment
// data (#access_token=...) isn't reliably preserved through expo-router's
// own path/query parsing, so the raw URL is re-read directly, same
// approach performOAuthFlow already uses for the OAuth deep link.
// Web: Supabase JS's detectSessionInUrl already parses the URL fragment
// and fires 'PASSWORD_RECOVERY', which app/_layout.js's existing listener
// redirects on - this screen only needs to render a loading state while
// that happens, not duplicate the parsing.
export default function ResetPasswordCallbackScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let isCancelled = false;
    // Tracks the URL currently being (or already) processed, not just a
    // did-we-settle boolean - a plain boolean stayed permanently true after
    // the first attempt, which silently dropped every later 'url' event for
    // the rest of this screen's mounted lifetime. That's a real gap: iOS
    // keeps a backgrounded app alive, so a user whose first tap times out
    // (slow network, one-off race) lands right back on this same mounted
    // screen when they tap the email link again - and with the old
    // boolean, that second, perfectly valid link was ignored outright,
    // leaving the stale first error on screen forever. Confirmed live via
    // Simulator: a second deep link with different tokens never updated the
    // screen until this was keyed by URL instead. Comparing against the
    // last-processed URL string lets a genuinely new link always restart
    // processing, while still no-oping a duplicate fire of the same URL
    // (getInitialURL() and the 'url' event both firing for one launch).
    let processedUrl = null;
    let timeout;

    const settle = (nextError) => {
      if (isCancelled) return;
      clearTimeout(timeout);
      setError(nextError);
    };

    const handleUrl = async (url) => {
      if (!url || isCancelled || url === processedUrl) return;
      processedUrl = url;
      clearTimeout(timeout);
      setError(null); // back to the loading spinner while this new attempt resolves

      const { access_token, refresh_token } = parseTokensFromUrl(url);
      if (!access_token || !refresh_token) {
        settle(parseAuthErrorFromUrl(url) || 'This password reset link is no longer valid.');
        return;
      }
      const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
      if (isCancelled) return;
      if (sessionError) {
        settle(sessionError.message);
        return;
      }
      clearTimeout(timeout);
      router.replace('/reset-password');
    };

    Linking.getInitialURL().then((url) => { if (url) handleUrl(url); }).catch(() => {});
    const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));

    // Neither getInitialURL() nor the 'url' event is guaranteed to fire (the
    // OS can hand off the deep link before this listener finishes
    // registering), and setSession() has no built-in timeout - without this,
    // a miss on either left the bare ActivityIndicator spinning forever with
    // no way out but a force-quit.
    timeout = setTimeout(() => {
      if (!isCancelled && !processedUrl) {
        settle('This link took too long to open. Please request a new password reset link.');
      }
    }, 8000);

    return () => {
      isCancelled = true;
      clearTimeout(timeout);
      subscription.remove();
    };
  }, [router]);

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.wrap}>
          <Text style={styles.title}>Link No Longer Valid</Text>
          <Text style={styles.text}>{error}</Text>
          <TouchableOpacity style={styles.button} onPress={() => router.replace('/forgot-password')}>
            <Text style={styles.buttonText}>Request a New Link</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.teal} />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    wrap: {
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    title: {
      fontFamily: FONTS.bold,
      fontSize: 20,
      color: colors.textPrimary,
      marginBottom: 10,
      textAlign: 'center',
    },
    text: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textSubtle,
      textAlign: 'center',
      lineHeight: 21,
      marginBottom: 24,
    },
    button: {
      alignSelf: 'stretch',
      backgroundColor: colors.teal,
      borderRadius: 10,
      paddingVertical: 14,
      paddingHorizontal: 28,
      alignItems: 'center',
    },
    buttonText: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
      fontSize: 16,
    },
  });
}
