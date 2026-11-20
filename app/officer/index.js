import { useCallback, useLayoutEffect, useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { Redirect, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { FLEET_OFFICER_ENABLED } from '../../constants/fleetOfficer';

/**
 * Fleet officer area - "My trips". Reached from the Account menu's Fleet Officer row, which only shows for an ACTIVE officer
 * (officer_profiles, migration 0179). Being an officer sits on top of the person's normal account, so "Back to Account" is the
 * switch back to the standard renter / vendor views. Phase 1: the officer's card and an empty trip list; Phase 2 fills the list
 * with assigned deliveries and collections.
 */
export default function OfficerHomeScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleBack = useCallback(() => {
    router.replace('/(tabs)/profile');
  }, [router]);

  // Same explicit back as Ride Support (app/staff-inbox/index.js): a root-level screen pushed from inside the (tabs) navigator.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={handleBack} hitSlop={10} style={styles.headerBackButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          <Text style={styles.headerBackLabel}>Account</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleBack, styles, colors]);

  // A deactivated officer (or a production build) never sees this area, even from an old deep link.
  if (!FLEET_OFFICER_ENABLED || !user?.isFleetOfficer) {
    return <Redirect href="/(tabs)/profile" />;
  }

  const officer = user.officerProfile;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My trips</Text>
        <Text style={styles.headerSubtitle}>Deliveries and collections assigned to you.</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.avatar}>
          <Ionicons name="car-sport-outline" size={22} color={COLORS.teal} />
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle}>{officer?.display_name || user.name}</Text>
          <Text style={styles.cardSubtitle}>Fleet officer{officer?.vehicle_note ? ` · ${officer.vehicle_note}` : ''}</Text>
        </View>
      </View>

      <View style={styles.emptyState}>
        <Ionicons name="calendar-clear-outline" size={32} color={colors.disabled} />
        <Text style={styles.emptyStateTitle}>No trips assigned</Text>
        <Text style={styles.emptyStateText}>When WopeCar assigns you a delivery or collection, it will appear here.</Text>
      </View>

      <TouchableOpacity style={styles.switchButton} onPress={handleBack}>
        <Ionicons name="swap-horizontal-outline" size={18} color={colors.textPrimary} />
        <Text style={styles.switchButtonText}>Back to renter & vendor views</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    headerBackButton: { flexDirection: 'row', alignItems: 'center', paddingRight: 8 },
    headerBackLabel: { fontFamily: FONTS.regular, fontSize: 17, color: colors.textPrimary, marginLeft: -4 },
    container: { flex: 1, backgroundColor: colors.background },
    content: { paddingBottom: 140 },
    header: { paddingTop: 20, paddingHorizontal: 16, paddingBottom: 12 },
    headerTitle: { fontFamily: FONTS.bold, fontSize: 20, color: colors.textPrimary },
    headerSubtitle: { fontFamily: FONTS.regular, fontSize: 12, color: colors.textSubtle, marginTop: 2 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginHorizontal: 16,
      padding: 12,
      backgroundColor: colors.surface,
      borderRadius: 12,
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.highlight, alignItems: 'center', justifyContent: 'center' },
    cardInfo: { flex: 1, gap: 2 },
    cardTitle: { fontFamily: FONTS.semiBold, fontSize: 15, color: colors.textPrimary },
    cardSubtitle: { fontFamily: FONTS.regular, fontSize: 12, color: colors.textSubtle },
    emptyState: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 64, paddingHorizontal: 32 },
    emptyStateTitle: { fontFamily: FONTS.semiBold, fontSize: 15, color: colors.textPrimary },
    emptyStateText: { fontFamily: FONTS.regular, fontSize: 13, color: colors.textSubtle, textAlign: 'center' },
    switchButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    switchButtonText: { fontFamily: FONTS.medium, fontSize: 14, color: colors.textPrimary },
  });
}
