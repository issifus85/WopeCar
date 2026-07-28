import { useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';

// Shared in-screen header for every Vendor/Host mode screen past the
// Dashboard - same reasoning as CheckoutHeader/InspectionHeader (one header
// component per flow, reused rather than duplicated per screen).
// showBack=false is for tab-root screens (Bookings/Calendar/Support/Menu) -
// tabs are peers, not stack children, so they don't get a back chevron,
// matching the renter (tabs) screens. `right` renders an optional trailing
// action (e.g. Fleet's "+ Add Car" button).
export default function VendorHeader({ title, subtitle, onBack, showBack = true, right }) {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {showBack && (
        <TouchableOpacity onPress={onBack ?? (() => router.back())} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
      )}
      <View style={styles.titleWrap}>
        <Text style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingTop: 56,
      paddingHorizontal: 20,
      paddingBottom: 16,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    titleWrap: {
      flex: 1,
    },
    title: {
      fontFamily: FONTS.bold,
      fontSize: 19,
      color: colors.textPrimary,
    },
    subtitle: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 2,
    },
  });
}
