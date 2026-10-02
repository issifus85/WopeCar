import { useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import { useAppUpdate } from '../services/appUpdate';

/**
 * Mounted once in app/_layout.js.
 * - 'optional': a dismissible card at the top ("A new version is available")
 *   that comes back on the next launch until the user actually updates.
 * - 'required': a full-screen, non-dismissible block (installed version is
 *   older than min_supported_*_version in app_settings) - only for a version
 *   that genuinely can't work any more.
 * Both take the user straight to their store listing.
 */
export default function AppUpdatePrompt() {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { status, latest, storeUrl, openStore } = useAppUpdate();
  const [dismissed, setDismissed] = useState(false);
  const styles = createStyles(colors, insets);

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
    <View style={styles.cardWrap} pointerEvents="box-none">
      <View style={styles.card}>
        <Ionicons name="arrow-up-circle" size={26} color={colors.teal} />
        <View style={styles.cardText}>
          <Text style={styles.cardTitle}>Update available</Text>
          <Text style={styles.cardBody} numberOfLines={1}>WopeCar {latest} is ready.</Text>
        </View>
        <TouchableOpacity style={styles.cardButton} onPress={openStore} activeOpacity={0.85}>
          <Text style={styles.cardButtonText}>Update</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setDismissed(true)} hitSlop={10} accessibilityLabel="Dismiss">
          <Ionicons name="close" size={20} color={colors.textSubtle} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function createStyles(colors, insets) {
  return StyleSheet.create({
    cardWrap: {
      position: 'absolute', top: insets.top + 8, left: 12, right: 12, zIndex: 1000,
    },
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: colors.surface, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14,
      borderWidth: 1, borderColor: colors.border,
      shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
    },
    cardText: { flex: 1 },
    cardTitle: { fontFamily: FONTS.semiBold, fontSize: 14, color: colors.textPrimary },
    cardBody: { fontFamily: FONTS.regular, fontSize: 12.5, color: colors.textSubtle, marginTop: 1 },
    cardButton: { backgroundColor: colors.teal, borderRadius: 100, paddingVertical: 7, paddingHorizontal: 14 },
    cardButtonText: { fontFamily: FONTS.semiBold, fontSize: 13, color: colors.white },
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
