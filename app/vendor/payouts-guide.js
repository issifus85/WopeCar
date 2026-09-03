import { useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import VendorHeader from '../../components/VendorHeader';

// The bi-weekly / end-of-month rule and the "amount collected less
// WopeCar's fees" calculation are both real: the payout schedule was
// confirmed directly by the WopeCar team, and the fee line is quoted from
// the real Partner Terms (app/vendor/agreement.js's PARTNER_TERMS,
// "Pricing, earnings, and payments" clause). No specific fee percentage is
// stated anywhere in this app, so this guide deliberately doesn't invent
// one - it points to the vendor's own agreement instead.
const PAYOUT_PLANS = [
  {
    icon: 'flash-outline',
    title: 'Bi-Weekly Payout',
    body: 'Paid every two weeks, covering all trips completed since your last payout.',
  },
  {
    icon: 'calendar-outline',
    title: 'Monthly Payout',
    body: 'Paid once, at the end of each calendar month, covering all trips completed that month.',
  },
];

const CALC_STEPS = [
  { icon: 'receipt-outline', label: 'Booking Total', body: 'The full amount collected from the renter for the trip.' },
  { icon: 'remove-circle-outline', label: "WopeCar's Service Fee", body: 'The fee set out in your Vendor Agreement is deducted.' },
  { icon: 'cash-outline', label: 'Your Payout', body: 'The remainder is paid out to you on your plan\'s schedule.' },
];

const PAYMENT_METHODS = [
  { icon: 'phone-portrait-outline', label: 'Mobile Money' },
  { icon: 'business-outline', label: 'Bank Transfer' },
];

export default function VendorPayoutsGuideScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <VendorHeader title="Getting Paid" subtitle="How and when your payouts arrive" onBack={() => router.replace('/vendor/resources')} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Once a trip is completed, WopeCar collects the payment from the renter and pays you out on one of two schedules.
        </Text>

        <View style={styles.planCard}>
          {PAYOUT_PLANS.map((plan, index) => (
            <View key={plan.title} style={[styles.planRow, index === PAYOUT_PLANS.length - 1 && styles.planRowLast]}>
              <View style={styles.planIconBadge}>
                <Ionicons name={plan.icon} size={20} color={colors.white} />
              </View>
              <View style={styles.planContent}>
                <Text style={styles.planTitle}>{plan.title}</Text>
                <Text style={styles.planBody}>{plan.body}</Text>
              </View>
            </View>
          ))}
          <View style={styles.planNote}>
            <Ionicons name="information-circle-outline" size={14} color="rgba(255,255,255,0.7)" />
            <Text style={styles.planNoteText}>Which plan applies to you is set out in your WopeCar Vendor Agreement.</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>How Your Payout Is Calculated</Text>
        <View style={styles.calcRow}>
          {CALC_STEPS.map((step, index) => (
            <View key={step.label} style={styles.calcStepWrap}>
              <View style={styles.calcStep}>
                <Ionicons name={step.icon} size={18} color={colors.teal} />
                <Text style={styles.calcLabel}>{step.label}</Text>
              </View>
              {index < CALC_STEPS.length - 1 && (
                <Ionicons name="arrow-forward" size={16} color={colors.textSubtle} style={styles.calcArrow} />
              )}
            </View>
          ))}
        </View>
        {CALC_STEPS.map((step) => (
          <Text key={step.label} style={styles.calcBody}>
            <Text style={styles.calcBodyBold}>{step.label}: </Text>
            {step.body}
          </Text>
        ))}

        <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Payment Methods</Text>
        <View style={styles.methodsRow}>
          {PAYMENT_METHODS.map((method) => (
            <View key={method.label} style={styles.methodCard}>
              <Ionicons name={method.icon} size={22} color={colors.teal} />
              <Text style={styles.methodLabel}>{method.label}</Text>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Track Your Earnings</Text>
        <Text style={styles.trackBody}>
          Your Booking History shows total earnings for any month, filterable by car, so you can always see what's been paid
          and what's pending.
        </Text>

        <View style={styles.disclaimer}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textSubtle} />
          <Text style={styles.disclaimerText}>
            Your exact payout schedule and fee rate are set out in your Vendor Agreement.
          </Text>
        </View>

        <TouchableOpacity style={styles.ctaButton} onPress={() => router.push('/vendor/history')}>
          <Text style={styles.ctaButtonText}>View Booking History</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkButton} onPress={() => router.push('/vendor/agreement')}>
          <Text style={styles.linkButtonText}>View Vendor Agreement</Text>
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
    planCard: {
      backgroundColor: colors.navy,
      borderRadius: 18,
      padding: 18,
      marginBottom: 28,
    },
    planRow: {
      flexDirection: 'row',
      gap: 14,
      marginBottom: 16,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.12)',
    },
    planRowLast: {
      marginBottom: 8,
      paddingBottom: 0,
      borderBottomWidth: 0,
    },
    planIconBadge: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.teal,
      alignItems: 'center',
      justifyContent: 'center',
    },
    planContent: {
      flex: 1,
      justifyContent: 'center',
    },
    planTitle: {
      fontFamily: FONTS.bold,
      fontSize: 15,
      color: colors.white,
      marginBottom: 4,
    },
    planBody: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: 'rgba(255,255,255,0.75)',
      lineHeight: 18,
    },
    planNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      marginTop: 4,
    },
    planNoteText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: 'rgba(255,255,255,0.7)',
      lineHeight: 16,
    },
    sectionTitle: {
      fontFamily: FONTS.bold,
      fontSize: 16,
      color: colors.textPrimary,
      marginBottom: 14,
    },
    sectionSpaced: {
      marginTop: 28,
    },
    calcRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
    },
    calcStepWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    calcStep: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 8,
      alignItems: 'center',
      gap: 6,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    calcLabel: {
      fontFamily: FONTS.semiBold,
      fontSize: 10,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    calcArrow: {
      marginHorizontal: 2,
    },
    calcBody: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 20,
      marginBottom: 6,
    },
    calcBodyBold: {
      fontFamily: FONTS.bold,
      color: colors.textPrimary,
    },
    methodsRow: {
      flexDirection: 'row',
      gap: 12,
    },
    methodCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingVertical: 18,
      alignItems: 'center',
      gap: 8,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    methodLabel: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
    },
    trackBody: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 19,
    },
    disclaimer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginTop: 24,
      marginBottom: 8,
    },
    disclaimerText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
      lineHeight: 16,
    },
    ctaButton: {
      backgroundColor: colors.teal,
      borderRadius: 12,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 16,
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
