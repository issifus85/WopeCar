import { useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import VendorHeader from '../../components/VendorHeader';

// Grounded entirely in features already built in this app - not invented.
// The 24-hour response line is quoted from the real Partner Terms
// (app/vendor/agreement.js's PARTNER_TERMS). The Availability Settings
// fields and calendar modes are read verbatim from
// app/vendor/car/availability/[id].js.
const LIFECYCLE = [
  {
    icon: 'time-outline',
    title: 'Requested',
    body: 'A renter sends a booking request for one of your cars. You get notified via the Bookings tab.',
  },
  {
    icon: 'checkmark-done-outline',
    title: 'Accept or Decline',
    body: 'Review the dates and reference, then Accept or Decline. Declining asks for a quick reason so support can follow up if needed.',
  },
  {
    icon: 'flag-outline',
    title: 'Completed',
    body: 'After the trip ends, the booking moves to your Booking History along with its earnings.',
  },
];

const AVAILABILITY_SETTINGS = [
  { icon: 'alarm-outline', title: 'Advance Notice Required', body: 'Same day, 1, 2, or 3 days - how much lead time you need before a booking can start.' },
  { icon: 'calendar-outline', title: 'Booking Window', body: '3 months, 6 months, or 1 year - how far ahead renters can book your car.' },
  { icon: 'hourglass-outline', title: 'Minimum Booking Length', body: '1, 3, or 7 days - the shortest rental you\'re willing to accept.' },
];

const TIPS = [
  'Respond to requests within 24 hours - it\'s part of your Vendor Agreement, and slow replies cost you bookings.',
  'Block dates for maintenance or personal use before requests come in, using Tap to Toggle or Block a Range.',
  'Check the Fleet Calendar weekly so you always know what\'s booked across your whole fleet at a glance.',
  'Keep Advance Notice realistic - too long a lead time can filter out last-minute renters.',
];

export default function VendorBookingsGuideScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <VendorHeader title="Managing Bookings & Availability" subtitle="Keep requests and your calendar on track" onBack={() => router.push('/vendor/resources')} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          How quickly you respond and how accurate your calendar is are the two biggest drivers of how often your car gets booked.
        </Text>

        <Text style={styles.sectionTitle}>How Booking Requests Work</Text>
        <View style={styles.timeline}>
          {LIFECYCLE.map((step, index) => (
            <View key={step.title} style={styles.stepRow}>
              <View style={styles.stepIconColumn}>
                <View style={styles.stepIconBadge}>
                  <Ionicons name={step.icon} size={18} color={colors.white} />
                </View>
                {index < LIFECYCLE.length - 1 && <View style={styles.stepConnector} />}
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepBody}>{step.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.ruleCard}>
          <Ionicons name="alarm" size={18} color={colors.white} />
          <Text style={styles.ruleCardText}>
            Respond to rental requests within <Text style={styles.ruleCardBold}>24 hours</Text> - a real requirement in your Vendor Agreement.
          </Text>
        </View>

        <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Availability Settings</Text>
        {AVAILABILITY_SETTINGS.map((item) => (
          <View key={item.title} style={styles.factorRow}>
            <View style={styles.factorIconBadge}>
              <Ionicons name={item.icon} size={20} color={colors.teal} />
            </View>
            <View style={styles.factorContent}>
              <Text style={styles.factorTitle}>{item.title}</Text>
              <Text style={styles.factorBody}>{item.body}</Text>
            </View>
          </View>
        ))}

        <View style={styles.modesRow}>
          <View style={styles.modeCard}>
            <Ionicons name="finger-print-outline" size={18} color={colors.teal} />
            <Text style={styles.modeTitle}>Tap to Toggle</Text>
            <Text style={styles.modeBody}>Tap any single day to block or unblock it.</Text>
          </View>
          <View style={styles.modeCard}>
            <Ionicons name="swap-horizontal-outline" size={18} color={colors.teal} />
            <Text style={styles.modeTitle}>Block a Range</Text>
            <Text style={styles.modeBody}>Tap a start date, then an end date, to block the whole span.</Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Quick Tips</Text>
        {TIPS.map((tip) => (
          <View key={tip} style={styles.tipRow}>
            <Ionicons name="checkmark-circle" size={16} color={colors.teal} />
            <Text style={styles.tipText}>{tip}</Text>
          </View>
        ))}

        <TouchableOpacity style={styles.ctaButton} onPress={() => router.push('/vendor/bookings')}>
          <Text style={styles.ctaButtonText}>Go to Booking Requests</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkButton} onPress={() => router.push('/vendor/calendar')}>
          <Text style={styles.linkButtonText}>Go to Fleet Calendar</Text>
        </TouchableOpacity>
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
    intro: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 19,
      marginBottom: 20,
    },
    sectionTitle: {
      fontFamily: FONTS.bold,
      fontSize: 16,
      color: colors.textPrimary,
      marginBottom: 14,
    },
    sectionSpaced: {
      marginTop: 8,
    },
    timeline: {
      marginBottom: 20,
    },
    stepRow: {
      flexDirection: 'row',
      gap: 14,
    },
    stepIconColumn: {
      alignItems: 'center',
    },
    stepIconBadge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.teal,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepConnector: {
      width: 2,
      flex: 1,
      minHeight: 20,
      backgroundColor: colors.border,
      marginVertical: 4,
    },
    stepContent: {
      flex: 1,
      paddingBottom: 18,
    },
    stepTitle: {
      fontFamily: FONTS.bold,
      fontSize: 14,
      color: colors.textPrimary,
      marginBottom: 4,
      marginTop: 6,
    },
    stepBody: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 19,
    },
    ruleCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.navy,
      borderRadius: 12,
      padding: 14,
      marginBottom: 8,
    },
    ruleCardText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.white,
      lineHeight: 19,
    },
    ruleCardBold: {
      fontFamily: FONTS.bold,
    },
    factorRow: {
      flexDirection: 'row',
      gap: 14,
      marginBottom: 18,
    },
    factorIconBadge: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    factorContent: {
      flex: 1,
    },
    factorTitle: {
      fontFamily: FONTS.bold,
      fontSize: 14,
      color: colors.textPrimary,
      marginBottom: 4,
    },
    factorBody: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 19,
    },
    modesRow: {
      flexDirection: 'row',
      gap: 12,
      marginBottom: 8,
    },
    modeCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      gap: 6,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    modeTitle: {
      fontFamily: FONTS.bold,
      fontSize: 13,
      color: colors.textPrimary,
    },
    modeBody: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 17,
    },
    tipRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginBottom: 12,
    },
    tipText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 19,
    },
    ctaButton: {
      backgroundColor: colors.teal,
      borderRadius: 12,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 24,
    },
    ctaButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 15,
      color: colors.white,
    },
    linkButton: {
      alignSelf: 'center',
      marginTop: 16,
    },
    linkButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.teal,
      textDecorationLine: 'underline',
    },
  });
}
