import { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import { useAppUpdate } from '../services/appUpdate';

/**
 * Mounted once in app/_layout.js.
 * - 'optional': a centred "Update available" pop-up shown each time the app
 *   is opened (cold start) until the user actually updates. "Not now" closes
 *   it for that session only. It used to be a small dismissible card at the
 *   top, which most iOS 1.0.3 users ignored (Nov 10 2026).
 * - 'required': a full-screen, non-dismissible block (installed version is
 *   older than min_supported_*_version in app_settings) - only for a version
 *   that genuinely can't work any more.
 * Both take the user straight to their store listing.
 */
export default function AppUpdatePrompt() {
  const { colors } = useAppTheme();
  const { status, latest, storeUrl, openStore } = useAppUpdate();
  const [dismissed, setDismissed] = useState(false);
  const styles = createStyles(colors);

  if (!storeUrl) return null;

  if (status === 'required') {
    return (
      <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
        <View style={styles.blockScreen}>
          <View style={styles.blockIcon}>
            <Ionicons name="arrow-up-circle" size={44} color={colors.teal} />
          </View>
          <Text style={styles.blockTitle}>Update required</Text>
          <Text style={styles.blockBody}>
            This version of WopeCar is no longer supported. Please update to keep booking and managing your trips.
          </Text>
          <TouchableOpacity style={styles.blockButton} onPress={openStore} activeOpacity={0.85}>
            <Text style={styles.blockButtonText}>Update now</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  if (status !== 'optional' || dismissed) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => setDismissed(true)}>
      <View style={styles.popupBackdrop}>
        <View style={styles.popup}>
          <View style={styles.popupIcon}>
            <Ionicons name="arrow-up-circle" size={40} color={colors.teal} />
          </View>
          <Text style={styles.popupTitle}>Update available</Text>
          <Text style={styles.popupBody}>
            {latest ? `WopeCar ${latest} is ready. ` : 'A new version of WopeCar is ready. '}
            Update now for the latest features, fixes and a smoother booking experience.
          </Text>
          <TouchableOpacity style={styles.blockButton} onPress={openStore} activeOpacity={0.85}>
            <Text style={styles.blockButtonText}>Update now</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.popupLater} onPress={() => setDismissed(true)} activeOpacity={0.7}>
            <Text style={styles.popupLaterText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    popupBackdrop: {
      flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    popup: {
      alignSelf: 'stretch', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 22,
      paddingTop: 26, paddingBottom: 14, paddingHorizontal: 22,
      shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 10,
    },
    popupIcon: {
      width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.background, marginBottom: 16,
    },
    popupTitle: { fontFamily: FONTS.bold, fontSize: 21, color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
    popupBody: {
      fontFamily: FONTS.regular, fontSize: 14.5, lineHeight: 21, color: colors.textSubtle, textAlign: 'center', marginBottom: 22,
    },
    popupLater: { paddingVertical: 12, paddingHorizontal: 20, marginTop: 4 },
    popupLaterText: { fontFamily: FONTS.semiBold, fontSize: 14.5, color: colors.textSubtle },
    blockScreen: {
      flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
      backgroundColor: colors.background,
    },
    blockIcon: {
      width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center',
      backgroundColor: colors.surface, marginBottom: 22,
    },
    blockTitle: { fontFamily: FONTS.bold, fontSize: 24, color: colors.textPrimary, marginBottom: 10, textAlign: 'center' },
    blockBody: {
      fontFamily: FONTS.regular, fontSize: 15, lineHeight: 22, color: colors.textSubtle, textAlign: 'center', marginBottom: 28,
    },
    blockButton: {
      alignSelf: 'stretch', backgroundColor: colors.teal, borderRadius: 14, paddingVertical: 15, alignItems: 'center',
    },
    blockButtonText: { fontFamily: FONTS.semiBold, fontSize: 16, color: colors.white },
  });
}
