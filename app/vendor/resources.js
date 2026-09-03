import { useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import VendorHeader from '../../components/VendorHeader';

// Every topic now routes to a real guide screen - see each screen's own
// header comment for what it's grounded in (wopecar.com content, this
// app's own vehicle-class/pricing data, the real Partner Terms, or the
// real Vehicle Inspection checklist).
const TOPICS = [
  { icon: 'rocket-outline', label: 'Getting Started as a Host', route: '/vendor/getting-started' },
  { icon: 'pricetag-outline', label: 'Pricing Your Vehicle', route: '/vendor/pricing-guide' },
  { icon: 'calendar-outline', label: 'Managing Bookings & Availability', route: '/vendor/bookings-guide' },
  { icon: 'cash-outline', label: 'Getting Paid', route: '/vendor/payouts-guide' },
  { icon: 'shield-checkmark-outline', label: 'Vehicle Requirements & Safety', route: '/vendor/safety-guide' },
];

export default function VendorResourcesScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <VendorHeader title="Vendor Resources" subtitle="Guides for WopeCar hosts" onBack={() => router.replace('/vendor/menu')} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          {TOPICS.map((topic, index) => (
            <TouchableOpacity
              key={topic.label}
              style={[styles.row, index === TOPICS.length - 1 && styles.rowLast]}
              onPress={() => router.push(topic.route)}
            >
              <View style={styles.rowIcon}>
                <Ionicons name={topic.icon} size={18} color={colors.teal} />
              </View>
              <Text style={styles.rowLabel}>{topic.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
            </TouchableOpacity>
          ))}
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
      paddingBottom: 40,
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
    rowLabel: {
      flex: 1,
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
    },
  });
}
