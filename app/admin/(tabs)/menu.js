import { useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';

// Catch-all admin destinations not already covered by the Dashboard/
// Bookings/Inbox tabs - same "Menu" role as app/vendor/(tabs)/menu.js for
// vendor mode.
const MENU_LINKS = [
  { key: 'users', icon: 'people-outline', label: 'Users', subtitle: 'Manage renter, vendor, and admin accounts', route: '/admin/users' },
  { key: 'vendors', icon: 'briefcase-outline', label: 'Vendors', subtitle: 'Review and approve vendor applications', route: '/admin/vendors' },
  { key: 'cars', icon: 'car-sport-outline', label: 'Cars', subtitle: 'Approve, deactivate, and review listings', route: '/admin/cars' },
  { key: 'reviews', icon: 'star-outline', label: 'Reviews', subtitle: 'Moderate renter reviews', route: '/admin/reviews' },
  { key: 'settings', icon: 'settings-outline', label: 'Settings', subtitle: 'Business rules, regions, promo codes', route: '/admin/settings' },
];

function Row({ icon, label, subtitle, onPress, last, styles, colors, tintColor }) {
  return (
    <TouchableOpacity style={[styles.row, last && styles.rowLast]} onPress={onPress} activeOpacity={0.6}>
      <View style={[styles.rowIcon, tintColor && { backgroundColor: `${tintColor}22` }]}>
        <Ionicons name={icon} size={18} color={tintColor ?? colors.teal} />
      </View>
      <View style={styles.rowLabelWrap}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
    </TouchableOpacity>
  );
}

export default function AdminMenuScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Menu</Text>
        <View style={styles.card}>
          {MENU_LINKS.map((link, index) => (
            <Row
              key={link.key}
              icon={link.icon}
              label={link.label}
              subtitle={link.subtitle}
              last={index === MENU_LINKS.length - 1}
              onPress={() => router.push(link.route)}
              styles={styles}
              colors={colors}
            />
          ))}
        </View>

        <View style={[styles.card, styles.cardSpaced]}>
          <Row
            icon="exit-outline"
            label="Back to Main App"
            subtitle="Return to the regular WopeCar app"
            last
            onPress={() => router.replace('/(tabs)/profile')}
            styles={styles}
            colors={colors}
            tintColor={colors.orange}
          />
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 140,
    },
    title: {
      fontFamily: FONTS.bold,
      fontSize: 22,
      color: colors.textPrimary,
      marginBottom: 16,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
      overflow: 'hidden',
    },
    cardSpaced: {
      marginTop: 20,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    rowIcon: {
      width: 34,
      height: 34,
      borderRadius: 8,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowLabelWrap: {
      flex: 1,
    },
    rowLabel: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    rowSubtitle: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 2,
    },
  });
}
