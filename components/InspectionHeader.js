import { useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';

// Same structure as CheckoutHeader - can't reuse it directly since it
// hardcodes TOTAL_STEPS = 6 for the (unrelated) checkout flow.
const TOTAL_STEPS = 5;

// `onBack`, when given, overrides the default router.back() - same
// optional-override convention as VendorHeader/VendorWizardHeader. Every
// current caller in this wizard-like flow is only ever reached via a
// same-Stack sibling push (never crosses a (tabs) group boundary the way
// e.g. app/inbox/index.js's back button once did), so plain back() is
// correct there today - this exists so a future entry point doesn't have
// to modify this shared component to add one.
export default function InspectionHeader({ title, step, onBack }) {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={onBack ?? (() => router.back())} hitSlop={10}>
        <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
      </TouchableOpacity>
      <View style={styles.titleWrap}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.step}>Step {step} of {TOTAL_STEPS}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%` }]} />
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      paddingTop: 56,
      paddingHorizontal: 20,
      paddingBottom: 16,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    titleWrap: {
      marginTop: 12,
      marginBottom: 12,
    },
    title: {
      fontFamily: FONTS.bold,
      fontSize: 20,
      color: colors.textPrimary,
    },
    step: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 2,
    },
    progressTrack: {
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.divider,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.teal,
      borderRadius: 2,
    },
  });
}
