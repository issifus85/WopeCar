import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import { useCurrency } from '../contexts/CurrencyContext';
import { formatCurrency, WOPECARE_PLANS, calculateWopeCareCost, calculateWopeCareDailyRate } from '../constants/pricing';

const SELECTABLE_PLAN_IDS = ['basic', 'plus', 'premium'];

/**
 * The real, interactive plan picker - used only in the checkout Extra
 * Add-ons screen now (app/checkout/wopecare.js, real onSelect ->
 * updateDraft). app/protection-plan.js (Profile
 * > Protection Plan) used to render this in a read-only mode, but that was
 * a near-duplicate of this component's own header/plan cards, so it was
 * replaced with a plain WopeCare Terms & Conditions summary page instead -
 * this component's own "See WopeCare Terms & Conditions" link now points
 * there.
 */
export default function WopeCareSelector({ pricePerDay, days, selectedPlan, onSelect }) {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { activeCurrency } = useCurrency();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  const dayLabel = days === 1 ? 'day' : 'days';

  return (
    <View>
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Ionicons name="shield-checkmark-outline" size={22} color={colors.teal} />
          <Text style={styles.headerTitle}>Add WopeCare Protection</Text>
        </View>
        <Text style={styles.headerSubtitle}>Less worry about the unexpected.</Text>
        <Text style={styles.headerBody}>
          You&apos;re responsible for damage to your rental vehicle during your trip. Add WopeCare to receive
          protection toward eligible incidental damage such as scratches, scuffs and minor dents.
        </Text>
      </View>

      {SELECTABLE_PLAN_IDS.map((planId) => {
        const plan = WOPECARE_PLANS[planId];
        const isSelected = selectedPlan === planId;
        const dailyRate = calculateWopeCareDailyRate(pricePerDay, planId);
        const tripTotal = calculateWopeCareCost(pricePerDay, planId, days);
        const percentLabel = `${Math.round(plan.rate * 100)}% of your daily rental rate`;

        return (
          <View key={planId} style={[styles.card, isSelected && styles.cardSelected]}>
            <View style={styles.cardTopRow}>
              <Text style={styles.planName}>{plan.name.replace('WopeCare ', '')}</Text>
              <View style={[styles.labelBadge, { backgroundColor: plan.color }]}>
                <Text style={styles.labelBadgeText}>{plan.label}</Text>
              </View>
            </View>

            <Text style={styles.percentText}>{percentLabel}</Text>

            <View style={styles.coverageBlock}>
              <Text style={[styles.coverageAmount, { color: plan.color }]}>
                Up to {formatCurrency(plan.coverage, activeCurrency)}
              </Text>
              <Text style={styles.coverageCaption}>in eligible incidental damage protection</Text>
            </View>

            <View style={styles.priceBlock}>
              <Text style={styles.dailyRate}>{formatCurrency(dailyRate, activeCurrency)}/day</Text>
              <Text style={styles.tripTotal}>
                {formatCurrency(tripTotal, activeCurrency)} total for {days} {dayLabel}
              </Text>
            </View>

            <View style={styles.featureList}>
              {plan.features.map((feature) => (
                <View key={feature} style={styles.featureRow}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={styles.featureText}>{feature}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.selectButton, isSelected ? styles.selectButtonFilled : styles.selectButtonOutlined]}
              onPress={() => onSelect(planId)}
            >
              {isSelected && <Ionicons name="checkmark" size={16} color={colors.white} style={styles.selectButtonIcon} />}
              <Text style={[styles.selectButtonText, isSelected ? styles.selectButtonTextFilled : styles.selectButtonTextOutlined]}>
                {isSelected ? 'Selected' : `Select ${plan.name.replace('WopeCare ', '')}`}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}

      <View style={[styles.noneCard, selectedPlan === 'none' && styles.noneCardSelected]}>
        <Text style={styles.noneTitle}>Rather not add WopeCare?</Text>
        <Text style={styles.noneBody}>You can continue your booking without selecting a protection plan.</Text>
        <View style={styles.warningBox}>
          <Ionicons name="warning-outline" size={16} color={colors.warning} />
          <Text style={styles.warningText}>
            Without WopeCare, you remain responsible for the full cost of any damage to the vehicle in accordance
            with your Rental Agreement.
          </Text>
        </View>
        <TouchableOpacity style={styles.noneButton} onPress={() => onSelect('none')}>
          <Text style={styles.noneButtonText}>Continue Without WopeCare</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.howItWorksSection}>
        <TouchableOpacity style={styles.howItWorksHeader} onPress={() => setHowItWorksOpen((v) => !v)}>
          <Text style={styles.howItWorksTitle}>How WopeCare Works</Text>
          <Ionicons name={howItWorksOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSubtle} />
        </TouchableOpacity>

        {howItWorksOpen && (
          <View style={styles.howItWorksBody}>
            <Text style={styles.paragraph}>
              If eligible incidental damage occurs during your rental, WopeCare will cover the cost up to your
              selected plan limit.
            </Text>

            <Text style={styles.subHeading}>Example</Text>
            <Text style={styles.paragraph}>
              You select WopeCare Plus, which provides up to {formatCurrency(3000, activeCurrency)} of eligible
              incidental damage protection.
            </Text>

            <View style={styles.scenarioRow}>
              <ScenarioBox
                styles={styles}
                damage={formatCurrency(1500, activeCurrency)}
                covered={formatCurrency(1500, activeCurrency)}
                youPay={formatCurrency(0, activeCurrency)}
              />
              <ScenarioBox
                styles={styles}
                damage={formatCurrency(4000, activeCurrency)}
                covered={formatCurrency(3000, activeCurrency)}
                youPay={formatCurrency(1000, activeCurrency)}
              />
            </View>
            <Text style={styles.paragraph}>
              Your WopeCare benefit is the maximum total benefit available for eligible damage during each rental.
            </Text>

            <Text style={styles.subHeading}>What&apos;s Covered?</Text>
            <Text style={styles.paragraph}>WopeCare may cover eligible incidental exterior vehicle damage including:</Text>
            {['Scratches', 'Scuffs', 'Minor dents', 'Minor bumper damage', 'Minor exterior body damage'].map((item) => (
              <ListItem key={item} styles={styles} colors={colors} covered text={item} />
            ))}
            <Text style={styles.smallCaption}>Eligibility is determined by WopeCar in accordance with the WopeCare Terms.</Text>

            <Text style={styles.subHeading}>What&apos;s Not Covered?</Text>
            <Text style={styles.paragraph}>WopeCare is designed for incidental vehicle damage. It does not cover:</Text>
            {[
              'Major accidents or collisions requiring an insurance claim',
              'Theft or total loss',
              'Interior damage',
              'Lost or damaged keys',
              'Missing vehicle parts or accessories',
              'Mechanical damage caused by misuse',
              'Incorrect fueling',
              'Intentional or reckless damage',
              'Damage caused while driving under the influence',
              'Damage caused by an unauthorized driver',
              'Damage resulting from violation of the Rental Agreement',
            ].map((item) => (
              <ListItem key={item} styles={styles} colors={colors} covered={false} text={item} />
            ))}

            <Text style={styles.subHeading}>Important Information</Text>
            <Text style={styles.paragraph}>WopeCare is an optional vehicle damage protection product and is not insurance.</Text>
            <Text style={styles.paragraph}>
              You remain responsible for the rental vehicle and for damage occurring during your rental. WopeCare
              provides a benefit toward eligible incidental damage up to the maximum amount included with your
              selected plan.
            </Text>
            <Text style={styles.paragraph}>You remain responsible for:</Text>
            {[
              'Damage exceeding your WopeCare benefit;',
              'Damage that is not eligible for WopeCare; and',
              'All other obligations under your Rental Agreement.',
            ].map((item) => (
              <ListItem key={item} styles={styles} colors={colors} plain text={item} />
            ))}
            <Text style={styles.paragraph}>
              WopeCare protection applies to one rental and cannot be purchased after your rental has begun.
            </Text>
            <TouchableOpacity onPress={() => router.push('/protection-plan')}>
              <Text style={styles.termsLink}>See WopeCare Terms &amp; Conditions for complete details.</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

// Defined outside the main component (can't close over its useMemo'd
// styles/colors) - passed down explicitly, matching e.g. TimeField in
// checkout/dates.js. See PROJECT.md 6.9.
function ScenarioBox({ styles, damage, covered, youPay }) {
  return (
    <View style={styles.scenarioBox}>
      <Text style={styles.scenarioDamage}>{damage} eligible damage</Text>
      <View style={styles.scenarioRowLine}>
        <Text style={styles.scenarioLabel}>WopeCare</Text>
        <Text style={styles.scenarioValue}>{covered}</Text>
      </View>
      <View style={styles.scenarioRowLine}>
        <Text style={styles.scenarioLabel}>You pay</Text>
        <Text style={styles.scenarioValueEmphasis}>{youPay}</Text>
      </View>
    </View>
  );
}

function ListItem({ styles, colors, text, covered, plain }) {
  return (
    <View style={styles.listItemRow}>
      {plain ? (
        <View style={styles.plainBullet} />
      ) : (
        <Ionicons
          name={covered ? 'checkmark-circle' : 'close-circle'}
          size={15}
          color={covered ? colors.success : colors.error}
        />
      )}
      <Text style={styles.listItemText}>{text}</Text>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    header: {
      marginBottom: 20,
    },
    headerTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 6,
    },
    headerTitle: {
      fontFamily: FONTS.bold,
      fontSize: 18,
      color: colors.textPrimary,
    },
    headerSubtitle: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.teal,
      marginBottom: 8,
    },
    headerBody: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 19,
    },
    card: {
      backgroundColor: colors.background,
      borderRadius: 14,
      padding: 16,
      marginBottom: 14,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    cardSelected: {
      borderColor: colors.teal,
      backgroundColor: colors.highlight,
    },
    cardTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    planName: {
      fontFamily: FONTS.bold,
      fontSize: 16,
      color: colors.textPrimary,
    },
    labelBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 100,
    },
    labelBadgeText: {
      fontFamily: FONTS.bold,
      fontSize: 10,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      color: colors.white,
    },
    percentText: {
      fontFamily: FONTS.regular,
      fontSize: 11.5,
      color: colors.textSubtle,
      marginBottom: 12,
    },
    coverageBlock: {
      marginBottom: 14,
    },
    coverageAmount: {
      fontFamily: FONTS.bold,
      fontSize: 15,
    },
    coverageCaption: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    priceBlock: {
      marginBottom: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: colors.surface,
      borderRadius: 10,
    },
    dailyRate: {
      fontFamily: FONTS.bold,
      fontSize: 24,
      color: colors.textPrimary,
    },
    tripTotal: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.teal,
      marginTop: 2,
    },
    featureList: {
      gap: 8,
      marginBottom: 16,
    },
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    featureText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textBody,
      flex: 1,
    },
    selectButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: 10,
      paddingVertical: 13,
    },
    selectButtonFilled: {
      backgroundColor: colors.teal,
    },
    selectButtonOutlined: {
      borderWidth: 1.5,
      borderColor: colors.teal,
      backgroundColor: 'transparent',
    },
    selectButtonIcon: {
      marginRight: 2,
    },
    selectButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
    },
    selectButtonTextFilled: {
      color: colors.white,
    },
    selectButtonTextOutlined: {
      color: colors.teal,
    },
    noneCard: {
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 20,
    },
    noneCardSelected: {
      borderColor: colors.teal,
      backgroundColor: colors.highlight,
    },
    noneTitle: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
      marginBottom: 4,
    },
    noneBody: {
      fontFamily: FONTS.regular,
      fontSize: 12.5,
      color: colors.textMuted,
      marginBottom: 12,
    },
    warningBox: {
      flexDirection: 'row',
      gap: 8,
      backgroundColor: colors.warningBg,
      borderRadius: 10,
      padding: 12,
      marginBottom: 14,
    },
    warningText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.warning,
      lineHeight: 17,
    },
    noneButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.disabled,
      paddingVertical: 13,
    },
    noneButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.textMuted,
    },
    howItWorksSection: {
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      paddingTop: 16,
    },
    howItWorksHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    howItWorksTitle: {
      fontFamily: FONTS.bold,
      fontSize: 15,
      color: colors.textPrimary,
    },
    howItWorksBody: {
      marginTop: 14,
    },
    subHeading: {
      fontFamily: FONTS.bold,
      fontSize: 13.5,
      color: colors.textPrimary,
      marginTop: 16,
      marginBottom: 6,
    },
    paragraph: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 19,
      marginBottom: 6,
    },
    smallCaption: {
      fontFamily: FONTS.regular,
      fontSize: 11.5,
      color: colors.textSubtle,
      fontStyle: 'italic',
      marginTop: 4,
    },
    scenarioRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 6,
      marginBottom: 6,
    },
    scenarioBox: {
      flex: 1,
      backgroundColor: colors.background,
      borderRadius: 10,
      padding: 12,
    },
    scenarioDamage: {
      fontFamily: FONTS.semiBold,
      fontSize: 12,
      color: colors.textPrimary,
      marginBottom: 8,
    },
    scenarioRowLine: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    scenarioLabel: {
      fontFamily: FONTS.regular,
      fontSize: 11.5,
      color: colors.textSubtle,
    },
    scenarioValue: {
      fontFamily: FONTS.semiBold,
      fontSize: 11.5,
      color: colors.success,
    },
    scenarioValueEmphasis: {
      fontFamily: FONTS.bold,
      fontSize: 11.5,
      color: colors.textPrimary,
    },
    listItemRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginBottom: 6,
    },
    listItemText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 12.5,
      color: colors.textBody,
      lineHeight: 18,
    },
    plainBullet: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.textSubtle,
      marginTop: 7,
    },
    termsLink: {
      fontFamily: FONTS.semiBold,
      fontSize: 12.5,
      color: colors.teal,
      textDecorationLine: 'underline',
      marginTop: 8,
    },
  });
}
