import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import { registerPaystackWebView } from '../services/paystackWebViewController';

// Paystack's hosted checkout page has its own in-page "Cancel"/back
// affordance, but tapping it just navigates within checkout.paystack.com -
// it never hits our callback_url, so the old WebBrowser.openAuthSessionAsync
// approach just sat there with no visible way back into the app (Paystack
// never resolves that promise on its own cancel click, only on a completed
// charge or the OS-drawn browser chrome's own close button, which reads as
// generic browser UI rather than part of the payment flow). Rendering
// Paystack in our own WebView instead means we can show an always-visible
// "Close" button that's unambiguously part of this screen, on both
// platforms - the earlier split was iOS-only (WebBrowser.dismissAuthSession
// has no Android equivalent).
export default function PaystackWebViewModal() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [authUrl, setAuthUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const callbackPrefixRef = useRef(null);
  const resolveRef = useRef(null);
  const settledRef = useRef(false);

  useEffect(() => {
    registerPaystackWebView((url, callbackUrlPrefix) => (
      new Promise((resolve) => {
        callbackPrefixRef.current = callbackUrlPrefix;
        resolveRef.current = resolve;
        settledRef.current = false;
        setAuthUrl(url);
        setIsLoading(true);
        setVisible(true);
      })
    ));
  }, []);

  const finish = useCallback((result) => {
    if (settledRef.current) return;
    settledRef.current = true;
    setVisible(false);
    setAuthUrl(null);
    const resolve = resolveRef.current;
    resolveRef.current = null;
    if (resolve) resolve(result);
  }, []);

  // Checked on both callbacks: onShouldStartLoadWithRequest fires earliest
  // (before the bridge page's own "redirecting..." content ever renders),
  // but isn't reliably called for every top-level navigation on Android -
  // onNavigationStateChange is the dependable fallback. settledRef makes
  // both safe to fire for the same navigation.
  const matchesCallback = useCallback((url) => (
    !!callbackPrefixRef.current && !!url && url.startsWith(callbackPrefixRef.current)
  ), []);

  const handleShouldStartLoad = useCallback((request) => {
    if (matchesCallback(request.url)) {
      finish({ type: 'success', url: request.url });
      return false;
    }
    return true;
  }, [matchesCallback, finish]);

  const handleNavigationStateChange = useCallback((navState) => {
    if (matchesCallback(navState.url)) {
      finish({ type: 'success', url: navState.url });
    }
  }, [matchesCallback, finish]);

  const styles = createStyles(colors, insets);

  if (!visible || !authUrl) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => finish({ type: 'cancel' })}>
      <View style={styles.root}>
        <View style={styles.header}>
          <Text style={styles.title}>Complete Payment</Text>
          <TouchableOpacity
            onPress={() => finish({ type: 'cancel' })}
            hitSlop={10}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={20} color={colors.textPrimary} />
            <Text style={styles.closeLabel}>Close</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.webviewWrap}>
          <WebView
            source={{ uri: authUrl }}
            onShouldStartLoadWithRequest={handleShouldStartLoad}
            onNavigationStateChange={handleNavigationStateChange}
            onLoadEnd={() => setIsLoading(false)}
            startInLoadingState={false}
          />
          {isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={colors.teal} />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors, insets) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: insets.top + 12,
      paddingBottom: 12,
      paddingHorizontal: 16,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    title: {
      fontFamily: FONTS.semiBold,
      fontSize: 16,
      color: colors.textPrimary,
    },
    closeButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 8,
      backgroundColor: colors.background,
    },
    closeLabel: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    webviewWrap: {
      flex: 1,
    },
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
  });
}
