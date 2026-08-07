import { useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import VendorHeader from '../../components/VendorHeader';

// Real content and structure, sourced from wopecar.com/share-your-car (same
// discipline as app/vendor/agreement.js's PARTNER_TERMS excerpt - quote the
// live site rather than inventing copy). The icon-per-step mapping mirrors
// the site's own FontAwesome icons (fa-user/fa-car/fa-bell/fa-usd) 1:1 with
// their closest Ionicons equivalent, and the stat figures are read from the
// site's counter data-count attributes (3500/100/50), not the mid-animation
// numbers a screenshot might catch.
const STATS = [
  { value: '3500+', label: 'Earn money each month' },
  { value: '100%', label: 'Insurance coverage available' },
  { value: '50+', label: 'Cars Listed Across Ghana' },
];

const STEPS = [
  {
    icon: 'person-outline',
    title: 'Register & Create an Account',
    body: 'Start sharing your car by creating an account and profile for managing your car and bookings.',
  },
  {
    icon: 'car-outline',
    title: 'List Your Car',
    body: 'Complete the required information and provide all supporting documents (photos, etc) for your car to get started.',
    note: 'In the app, this is the Add a Car wizard - it also schedules your vetting and photo verification appointment.',
  },
  {
    icon: 'notifications-outline',
    title: 'Receive Bookings',
    body: 'Get notified via email, phone, and your dashboard with a booking confirmation of your ride, and accept the booking to start earning.',
  },
  {
    icon: 'cash-outline',
    title: 'Confirm Booking & Start Earning',
    body: 'WopeCar picks up your car for delivery, does a thorough walk-around inspection, and you receive payment within 3-5 business days.',
  },
];

const AUDIENCES = [
  {
    icon: 'person-circle-outline',
    title: 'Are you an individual entrepreneur?',
    body: 'Join WopeCar and start managing your own fleet of cars. You set your own prices and availability, and we handle the rest.',
  },
  {
    icon: 'business-outline',
    title: 'Do you own a rental agency?',
    body: 'List your cars on WopeCar and get more exposure and bookings. You keep control of your cars and customers, and we provide the support and insurance.',
  },
];

const INSURANCE = [
  { title: '15% Fleet Discount', body: 'The policy provides a 15% fleet discount for all members registered by Spoton Insurance Brokers partner insurers.' },
  { title: 'Personal Accident Benefits', body: 'Policy coverage for the sum of GHS 10,000 as personal accident benefit for the partner or any authorized persons during the time of accident.' },
  { title: 'All Trips Are Fully Insured', body: 'Partners can subscribe to Spoton Insurance Brokers for coverage, including GHS 250/day for 14 days for loss of rental income while your car is in the workshop.' },
];

export default function VendorGettingStartedScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <VendorHeader title="Getting Started as a Host" subtitle="From wopecar.com" onBack={() => router.push('/vendor/resources')} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.heroBlob} />
          <Ionicons name="car-sport" size={96} color="rgba(255,255,255,0.12)" style={styles.heroIcon} />
          <Text style={styles.heroTitle}>Turn Your Car Into{'\n'}Passive Income</Text>
        </View>

        <View style={styles.statsRow}>
          {STATS.map((stat) => (
            <View key={stat.label} style={styles.statCard}>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Getting Started Is Easy</Text>
        <View style={styles.timeline}>
          {STEPS.map((step, index) => (
            <View key={step.title} style={styles.stepRow}>
              <View style={styles.stepIconColumn}>
                <View style={styles.stepIconBadge}>
                  <Ionicons name={step.icon} size={20} color={colors.white} />
                </View>
                {index < STEPS.length - 1 && <View style={styles.stepConnector} />}
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepBody}>{step.body}</Text>
                {!!step.note && (
                  <View style={styles.stepNote}>
                    <Ionicons name="information-circle-outline" size={14} color={colors.teal} />
                    <Text style={styles.stepNoteText}>{step.note}</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Who Can Share Their Car On WopeCar?</Text>
        <Text style={styles.sectionIntro}>
          Whether you are an individual, an entrepreneur, or a rental agency, WopeCar can help you make money with your cars.
        </Text>
        {AUDIENCES.map((audience) => (
          <View key={audience.title} style={styles.audienceCard}>
            <View style={styles.audienceIconBadge}>
              <Ionicons name={audience.icon} size={22} color={colors.teal} />
            </View>
            <Text style={styles.audienceTitle}>{audience.title}</Text>
            <Text style={styles.audienceBody}>{audience.body}</Text>
            <TouchableOpacity style={styles.audienceButton} onPress={() => router.push('/vendor/add-car')}>
              <Text style={styles.audienceButtonText}>Get Started</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.white} />
            </TouchableOpacity>
          </View>
        ))}

        <Text style={[styles.sectionTitle, styles.sectionSpaced]}>All Rides Are Comprehensively Insured</Text>
        <View style={styles.insuranceGrid}>
          {INSURANCE.map((item) => (
            <View key={item.title} style={styles.insuranceCard}>
              <Ionicons name="shield-checkmark-outline" size={22} color={colors.teal} />
              <Text style={styles.insuranceTitle}>{item.title}</Text>
              <Text style={styles.insuranceBody}>{item.body}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity style={styles.ctaButton} onPress={() => router.push('/vendor/add-car')}>
          <Text style={styles.ctaButtonText}>List Your Car</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL('https://wopecar.com/share-your-car')}>
          <Text style={styles.linkButtonText}>View on wopecar.com</Text>
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
      paddingBottom: 40,
    },
    hero: {
      backgroundColor: colors.navy,
      paddingHorizontal: 20,
      paddingTop: 28,
      paddingBottom: 32,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      overflow: 'hidden',
    },
    heroBlob: {
      position: 'absolute',
      top: -60,
      right: -60,
      width: 180,
      height: 180,
      borderRadius: 90,
      backgroundColor: 'rgba(62,182,186,0.25)',
    },
    heroIcon: {
      position: 'absolute',
      bottom: -10,
      right: 10,
    },
    heroTitle: {
      fontFamily: FONTS.bold,
      fontSize: 26,
      lineHeight: 32,
      color: colors.white,
    },
    statsRow: {
      flexDirection: 'row',
      marginHorizontal: 20,
      marginTop: -20,
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingVertical: 16,
      shadowColor: colors.shadow,
      shadowOpacity: 0.1,
      shadowRadius: 10,
      elevation: 4,
    },
    statCard: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    statValue: {
      fontFamily: FONTS.bold,
      fontSize: 20,
      color: colors.textPrimary,
    },
    statLabel: {
      fontFamily: FONTS.regular,
      fontSize: 10,
      color: colors.textSubtle,
      textAlign: 'center',
      marginTop: 4,
      lineHeight: 13,
    },
    sectionTitle: {
      fontFamily: FONTS.bold,
      fontSize: 17,
      color: colors.textPrimary,
      marginHorizontal: 20,
      marginTop: 28,
      marginBottom: 16,
    },
    sectionSpaced: {
      marginTop: 32,
    },
    sectionIntro: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 19,
      marginHorizontal: 20,
      marginTop: -10,
      marginBottom: 16,
    },
    timeline: {
      marginHorizontal: 20,
    },
    stepRow: {
      flexDirection: 'row',
      gap: 14,
    },
    stepIconColumn: {
      alignItems: 'center',
    },
    stepIconBadge: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.teal,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepConnector: {
      width: 2,
      flex: 1,
      minHeight: 24,
      backgroundColor: colors.border,
      marginVertical: 4,
    },
    stepContent: {
      flex: 1,
      paddingBottom: 20,
    },
    stepTitle: {
      fontFamily: FONTS.bold,
      fontSize: 15,
      color: colors.textPrimary,
      marginBottom: 4,
      marginTop: 8,
    },
    stepBody: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 19,
    },
    stepNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
      marginTop: 8,
      backgroundColor: colors.highlight,
      borderRadius: 8,
      padding: 10,
    },
    stepNoteText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 17,
    },
    audienceCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 18,
      marginHorizontal: 20,
      marginBottom: 14,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    audienceIconBadge: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    audienceTitle: {
      fontFamily: FONTS.bold,
      fontSize: 15,
      color: colors.textPrimary,
      marginBottom: 6,
    },
    audienceBody: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 19,
      marginBottom: 14,
    },
    audienceButton: {
      flexDirection: 'row',
      alignSelf: 'flex-start',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.teal,
      borderRadius: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    audienceButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.white,
    },
    insuranceGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginHorizontal: 20,
    },
    insuranceCard: {
      flexBasis: '47%',
      flexGrow: 1,
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    insuranceTitle: {
      fontFamily: FONTS.bold,
      fontSize: 13,
      color: colors.textPrimary,
      marginTop: 10,
      marginBottom: 6,
    },
    insuranceBody: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 17,
    },
    ctaButton: {
      backgroundColor: colors.teal,
      borderRadius: 12,
      paddingVertical: 15,
      alignItems: 'center',
      marginHorizontal: 20,
      marginTop: 32,
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
