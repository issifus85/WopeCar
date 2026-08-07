import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import VendorHeader from '../../components/VendorHeader';

// Base daily-rate ranges (GHS) per vehicle tier. This is general market
// guidance, not a published WopeCar rate card - grounded in this app's own
// real data: the mock vendor fleet (Toyota Camry/Hyundai Tucson/Kia
// Sportage) already lists at GHS 350-480/day and sits squarely in the
// Comfort band below, and the example makes per tier are pulled from the
// real constants/vehicleCatalog.js catalog rather than invented.
const TYPES = [
  { key: 'economy', label: 'Economy', icon: 'wallet-outline', min: 150, max: 300, examples: ['Kia Picanto', 'Hyundai i10', 'Toyota Yaris'] },
  { key: 'comfort', label: 'Comfort', icon: 'car-outline', min: 300, max: 600, examples: ['Toyota Camry', 'Hyundai Tucson', 'Kia Sportage'] },
  { key: 'luxury', label: 'Luxury', icon: 'diamond-outline', min: 700, max: 2000, examples: ['Mercedes-Benz', 'BMW', 'Land Rover', 'Lexus'] },
];

const AGE_BANDS = [
  { key: 'new', label: '0-2 yrs', multiplier: 1.15 },
  { key: 'mid', label: '3-5 yrs', multiplier: 1.0 },
  { key: 'old', label: '6+ yrs', multiplier: 0.85 },
];

const PROMO_OPTIONS = [10, 15, 20];

const FACTORS = [
  {
    icon: 'pricetag-outline',
    title: 'Vehicle Type',
    body: 'Economy, Comfort, or Luxury sets your baseline. A Luxury SUV commands a higher nightly rate than a compact Economy hatchback.',
  },
  {
    icon: 'calendar-outline',
    title: 'Manufacturing & Registration Year',
    body: 'Newer cars (0-2 years) can price above the baseline; older cars (6+ years) typically need to price below it to stay competitive.',
  },
  {
    icon: 'car-sport-outline',
    title: 'Driven By',
    body: 'Chauffeur listings often price higher than self-drive, since the fare bundles in the driver\'s time and fuel.',
  },
];

const PROMO_IDEAS = [
  { icon: 'rocket-outline', title: 'New Listing Boost', body: 'A short-term discount on a freshly listed car to earn your first reviews and build trust faster.' },
  { icon: 'calendar-number-outline', title: 'Weekly / Monthly Discount', body: 'A lower daily rate for renters booking 7+ or 30+ days - longer bookings mean less turnover for you.' },
  { icon: 'moon-outline', title: 'Off-Peak Rate', body: 'A reduced rate during historically slower weeks to keep your car earning instead of sitting idle.' },
];

function roundTo10(n) {
  return Math.round(n / 10) * 10;
}

export default function VendorPricingGuideScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [typeKey, setTypeKey] = useState('comfort');
  const [ageKey, setAgeKey] = useState('mid');
  const [promoOn, setPromoOn] = useState(false);
  const [promoPct, setPromoPct] = useState(10);

  const type = TYPES.find((t) => t.key === typeKey);
  const age = AGE_BANDS.find((a) => a.key === ageKey);

  const baseMin = roundTo10(type.min * age.multiplier);
  const baseMax = roundTo10(type.max * age.multiplier);
  const promoMin = roundTo10(baseMin * (1 - promoPct / 100));
  const promoMax = roundTo10(baseMax * (1 - promoPct / 100));

  return (
    <View style={styles.container}>
      <VendorHeader title="Pricing Your Vehicle" subtitle="Guidance for setting your daily rate" onBack={() => router.push('/vendor/resources')} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Your daily rate is one of the biggest levers for how often your car gets booked. Adjust the options below to see a
          suggested starting range.
        </Text>

        <View style={styles.estimatorCard}>
          <Text style={styles.estimatorLabel}>Suggested Daily Rate</Text>
          {promoOn ? (
            <>
              <Text style={styles.estimatorRangeStrike}>GHS {baseMin.toLocaleString()} - {baseMax.toLocaleString()}</Text>
              <Text style={styles.estimatorRange}>GHS {promoMin.toLocaleString()} - {promoMax.toLocaleString()}</Text>
              <View style={styles.promoBadge}>
                <Ionicons name="pricetag" size={12} color={colors.white} />
                <Text style={styles.promoBadgeText}>{promoPct}% promo applied</Text>
              </View>
            </>
          ) : (
            <Text style={styles.estimatorRange}>GHS {baseMin.toLocaleString()} - {baseMax.toLocaleString()}</Text>
          )}
          <Text style={styles.estimatorSub}>per day, before add-ons</Text>

          <Text style={styles.controlLabel}>Vehicle Type</Text>
          <View style={styles.pillRow}>
            {TYPES.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[styles.pill, typeKey === t.key && styles.pillActive]}
                onPress={() => setTypeKey(t.key)}
              >
                <Ionicons name={t.icon} size={14} color={typeKey === t.key ? colors.white : colors.textMuted} />
                <Text style={[styles.pillText, typeKey === t.key && styles.pillTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.controlLabel}>Manufacturing Year</Text>
          <View style={styles.pillRow}>
            {AGE_BANDS.map((a) => (
              <TouchableOpacity
                key={a.key}
                style={[styles.pill, ageKey === a.key && styles.pillActive]}
                onPress={() => setAgeKey(a.key)}
              >
                <Text style={[styles.pillText, ageKey === a.key && styles.pillTextActive]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.promoHeader}>
            <Text style={styles.controlLabel}>Add a Promotional Rate</Text>
            <TouchableOpacity
              style={[styles.toggle, promoOn && styles.toggleOn]}
              onPress={() => setPromoOn(!promoOn)}
            >
              <View style={[styles.toggleKnob, promoOn && styles.toggleKnobOn]} />
            </TouchableOpacity>
          </View>
          {promoOn && (
            <View style={styles.pillRow}>
              {PROMO_OPTIONS.map((pct) => (
                <TouchableOpacity
                  key={pct}
                  style={[styles.pill, promoPct === pct && styles.pillActive]}
                  onPress={() => setPromoPct(pct)}
                >
                  <Text style={[styles.pillText, promoPct === pct && styles.pillTextActive]}>{pct}% off</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <Text style={styles.sectionTitle}>Factors That Influence Your Price</Text>
        {FACTORS.map((factor) => (
          <View key={factor.title} style={styles.factorRow}>
            <View style={styles.factorIconBadge}>
              <Ionicons name={factor.icon} size={20} color={colors.teal} />
            </View>
            <View style={styles.factorContent}>
              <Text style={styles.factorTitle}>{factor.title}</Text>
              <Text style={styles.factorBody}>{factor.body}</Text>
            </View>
          </View>
        ))}

        <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Typical Rate Ranges by Tier</Text>
        {TYPES.map((t) => (
          <View key={t.key} style={styles.tierCard}>
            <View style={styles.tierHeader}>
              <View style={styles.tierIconBadge}>
                <Ionicons name={t.icon} size={18} color={colors.teal} />
              </View>
              <Text style={styles.tierLabel}>{t.label}</Text>
              <Text style={styles.tierRange}>GHS {t.min.toLocaleString()} - {t.max.toLocaleString()}</Text>
            </View>
            <Text style={styles.tierExamples}>e.g. {t.examples.join(', ')}</Text>
          </View>
        ))}

        <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Promotional Rate Ideas</Text>
        {PROMO_IDEAS.map((idea) => (
          <View key={idea.title} style={styles.factorRow}>
            <View style={styles.factorIconBadge}>
              <Ionicons name={idea.icon} size={20} color={colors.orange} />
            </View>
            <View style={styles.factorContent}>
              <Text style={styles.factorTitle}>{idea.title}</Text>
              <Text style={styles.factorBody}>{idea.body}</Text>
            </View>
          </View>
        ))}

        <View style={styles.disclaimer}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textSubtle} />
          <Text style={styles.disclaimerText}>
            These are general guidelines, not fixed platform rates - you always set and can change your own price per car.
          </Text>
        </View>

        <TouchableOpacity style={styles.linkButton} onPress={() => router.push('/vendor/fleet')}>
          <Text style={styles.linkButtonText}>Go to My Fleet</Text>
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
    estimatorCard: {
      backgroundColor: colors.navy,
      borderRadius: 18,
      padding: 20,
      marginBottom: 28,
    },
    estimatorLabel: {
      fontFamily: FONTS.semiBold,
      fontSize: 12,
      color: 'rgba(255,255,255,0.7)',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    estimatorRangeStrike: {
      fontFamily: FONTS.semiBold,
      fontSize: 16,
      color: 'rgba(255,255,255,0.5)',
      textDecorationLine: 'line-through',
      marginTop: 6,
    },
    estimatorRange: {
      fontFamily: FONTS.bold,
      fontSize: 30,
      color: colors.white,
      marginTop: 4,
    },
    promoBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 5,
      backgroundColor: colors.orange,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginTop: 8,
    },
    promoBadgeText: {
      fontFamily: FONTS.semiBold,
      fontSize: 11,
      color: colors.white,
    },
    estimatorSub: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: 'rgba(255,255,255,0.6)',
      marginTop: 6,
      marginBottom: 18,
    },
    controlLabel: {
      fontFamily: FONTS.semiBold,
      fontSize: 12,
      color: 'rgba(255,255,255,0.85)',
      marginBottom: 8,
      marginTop: 4,
    },
    pillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 18,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 13,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.08)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.15)',
    },
    pillActive: {
      backgroundColor: colors.teal,
      borderColor: colors.teal,
    },
    pillText: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: 'rgba(255,255,255,0.7)',
    },
    pillTextActive: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
    },
    promoHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    toggle: {
      width: 44,
      height: 26,
      borderRadius: 13,
      backgroundColor: 'rgba(255,255,255,0.15)',
      padding: 3,
      marginBottom: 8,
    },
    toggleOn: {
      backgroundColor: colors.teal,
    },
    toggleKnob: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.white,
    },
    toggleKnobOn: {
      transform: [{ translateX: 18 }],
    },
    sectionTitle: {
      fontFamily: FONTS.bold,
      fontSize: 16,
      color: colors.textPrimary,
      marginBottom: 14,
    },
    sectionSpaced: {
      marginTop: 12,
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
    tierCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    tierHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    tierIconBadge: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tierLabel: {
      flex: 1,
      fontFamily: FONTS.bold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    tierRange: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
    },
    tierExamples: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 8,
      marginLeft: 42,
    },
    disclaimer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginTop: 16,
      marginBottom: 8,
    },
    disclaimerText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
      lineHeight: 16,
    },
    linkButton: {
      alignSelf: 'center',
      marginTop: 12,
    },
    linkButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.teal,
      textDecorationLine: 'underline',
    },
  });
}
