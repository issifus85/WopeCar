import { useCallback, useLayoutEffect, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';

// Matches the phone/email every other Support-adjacent screen already
// uses (app/support.js, app/settings/safety-centre.js) - each of those
// re-declares its own copy rather than importing a shared constant, so
// this follows that same existing convention rather than introducing one.
const SUPPORT_EMAIL = 'support@wopecar.com';
const SUPPORT_PHONE = '+233551478540';
const SUPPORT_PHONE_DISPLAY = '+233 551 478 540';

const PLAN_ROWS = [
  { name: 'Basic', cost: '8% of daily rate', benefit: 'Up to GH₵1,500' },
  { name: 'Plus', cost: '12% of daily rate', benefit: 'Up to GH₵3,000' },
  { name: 'Premium', cost: '16% of daily rate', benefit: 'Up to GH₵5,000' },
];

const COVERED_ITEMS = [
  'Scratches and scuffs',
  'Minor dents',
  'Minor bumper damage',
  'Minor exterior body damage',
];

const NOT_COVERED_ITEMS = [
  'Major accidents or collisions',
  'Theft or total loss',
  'Interior damage',
  'Lost or damaged keys',
  'Missing parts or accessories',
  'Mechanical damage from misuse',
  'Incorrect fueling',
  'Intentional or reckless damage',
  'Damage while driving under the influence',
  'Damage by an unauthorized driver',
  'Damage from breaching your Rental Agreement',
  'Pre-existing damage noted at collection',
  'Damage not reported within 24 hours of rental end',
];

const IMPORTANT_CONDITIONS = [
  'WopeCare must be selected before your rental begins — it cannot be added after',
  'WopeCare applies to one rental period only',
  'You remain responsible for the vehicle at all times',
  'If damage costs exceed your plan limit you pay the difference',
  'If damage costs are within your plan limit WopeCare covers the full amount',
];

const REMEMBER_ITEMS = [
  'Damage above your plan limit',
  'Damage not covered by WopeCare',
  'All other obligations in your Rental Agreement',
];

function SectionHeading({ children, styles }) {
  return <Text style={styles.sectionHeading}>{children}</Text>;
}

function IconListItem({ text, covered, styles, colors }) {
  return (
    <View style={styles.listRow}>
      <Ionicons
        name={covered ? 'checkmark-circle' : 'close-circle'}
        size={16}
        color={covered ? colors.success : colors.error}
      />
      <Text style={styles.listText}>{text}</Text>
    </View>
  );
}

function DotListItem({ text, styles }) {
  return (
    <View style={styles.listRow}>
      <View style={styles.dotBullet} />
      <Text style={styles.listText}>{text}</Text>
    </View>
  );
}

export default function ProtectionPlanScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Same GO_BACK-on-web fix as booking/[id].js - see PROJECT.md 3.3.
  const handleBack = useCallback(() => {
    router.replace('/(tabs)/profile');
  }, [router]);

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>WopeCare Terms & Conditions Summary</Text>
      <Text style={styles.updatedText}>Last updated: August 2026</Text>

      <SectionHeading styles={styles}>What is WopeCare?</SectionHeading>
      <Text style={styles.paragraph}>
        WopeCare is an optional vehicle damage protection product offered by WopeCar. It is not insurance. WopeCare
        provides a financial benefit toward eligible incidental damage to your rental vehicle up to the limit of
        your selected plan.
      </Text>

      <SectionHeading styles={styles}>Your Plans</SectionHeading>
      <View style={styles.table}>
        <View style={[styles.tableRow, styles.tableHeaderRow]}>
          <Text style={[styles.tableCell, styles.tableHeaderText, styles.planCol]}>Plan</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, styles.costCol]}>Cost</Text>
          <Text style={[styles.tableCell, styles.tableHeaderText, styles.benefitCol]}>Maximum Benefit</Text>
        </View>
        {PLAN_ROWS.map((row) => (
          <View key={row.name} style={styles.tableRow}>
            <Text style={[styles.tableCell, styles.tableCellBold, styles.planCol]}>{row.name}</Text>
            <Text style={[styles.tableCell, styles.costCol]}>{row.cost}</Text>
            <Text style={[styles.tableCell, styles.benefitCol]}>{row.benefit}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.tableNote}>
        Your daily WopeCare cost and trip total are shown clearly before you confirm your booking.
      </Text>

      <SectionHeading styles={styles}>What WopeCare Covers</SectionHeading>
      <Text style={styles.paragraph}>WopeCare may cover eligible incidental exterior damage including:</Text>
      <View style={styles.list}>
        {COVERED_ITEMS.map((item) => (
          <IconListItem key={item} text={item} covered styles={styles} colors={colors} />
        ))}
      </View>

      <SectionHeading styles={styles}>What WopeCare Does Not Cover</SectionHeading>
      <View style={styles.list}>
        {NOT_COVERED_ITEMS.map((item) => (
          <IconListItem key={item} text={item} covered={false} styles={styles} colors={colors} />
        ))}
      </View>

      <SectionHeading styles={styles}>Important Conditions</SectionHeading>
      <View style={styles.list}>
        {IMPORTANT_CONDITIONS.map((item) => (
          <DotListItem key={item} text={item} styles={styles} />
        ))}
      </View>

      <SectionHeading styles={styles}>How to Make a Claim</SectionHeading>
      <Text style={styles.paragraph}>Report damage within 24 hours of your rental ending:</Text>
      <View style={styles.contactList}>
        <TouchableOpacity style={styles.contactRow} onPress={() => router.push('/inbox')}>
          <View style={styles.contactIcon}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.teal} />
          </View>
          <Text style={styles.contactText}>In-app Support inbox</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.contactRow} onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`)}>
          <View style={styles.contactIcon}>
            <Ionicons name="call-outline" size={18} color={colors.teal} />
          </View>
          <Text style={styles.contactText}>{SUPPORT_PHONE_DISPLAY}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.contactRow}
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('WopeCare Damage Claim')}`)}
        >
          <View style={styles.contactIcon}>
            <Ionicons name="mail-outline" size={18} color={colors.teal} />
          </View>
          <Text style={styles.contactText}>{SUPPORT_EMAIL}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.paragraph}>
        Provide photographs of all damage and complete WopeCar&apos;s damage report. WopeCar will assess your claim
        within 5 business days.
      </Text>

      <SectionHeading styles={styles}>Refunds</SectionHeading>
      <Text style={styles.paragraph}>
        WopeCare fees are non-refundable once your rental has started. If you cancel before your rental begins your
        WopeCare fee is refunded under WopeCar&apos;s standard cancellation policy.
      </Text>

      <SectionHeading styles={styles}>Remember</SectionHeading>
      <Text style={styles.paragraph}>
        WopeCare is a benefit toward eligible damage — not a transfer of responsibility. You remain responsible for:
      </Text>
      <View style={styles.list}>
        {REMEMBER_ITEMS.map((item) => (
          <DotListItem key={item} text={item} styles={styles} />
        ))}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          This is a summary only. Full WopeCare Terms &amp; Conditions apply and are available at
          wopecar.com/terms-and-conditions
        </Text>
        <Text style={styles.footerLocation}>WopeCar — Accra, Ghana</Text>
      </View>
    </ScrollView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    headerBackButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingRight: 8,
    },
    headerBackLabel: {
      fontFamily: FONTS.regular,
      fontSize: 17,
      color: colors.textPrimary,
      marginLeft: -4,
    },
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    content: {
      padding: 20,
      paddingBottom: 48,
    },
    title: {
      fontFamily: FONTS.bold,
      fontSize: 20,
      color: colors.textPrimary,
      marginBottom: 4,
    },
    updatedText: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginBottom: 20,
    },
    sectionHeading: {
      fontFamily: FONTS.bold,
      fontSize: 15,
      color: colors.textPrimary,
      marginTop: 22,
      marginBottom: 8,
    },
    paragraph: {
      fontFamily: FONTS.regular,
      fontSize: 13.5,
      color: colors.textBody,
      lineHeight: 20,
      marginBottom: 8,
    },
    table: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      overflow: 'hidden',
      marginTop: 4,
    },
    tableRow: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    tableHeaderRow: {
      borderTopWidth: 0,
      backgroundColor: colors.background,
    },
    tableCell: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 12.5,
      color: colors.textBody,
      paddingVertical: 10,
      paddingHorizontal: 10,
    },
    tableCellBold: {
      fontFamily: FONTS.semiBold,
      color: colors.textPrimary,
    },
    tableHeaderText: {
      fontFamily: FONTS.bold,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      color: colors.textSubtle,
    },
    planCol: {
      flex: 0.8,
    },
    costCol: {
      flex: 1.1,
    },
    benefitCol: {
      flex: 1.1,
    },
    tableNote: {
      fontFamily: FONTS.regular,
      fontSize: 11.5,
      color: colors.textSubtle,
      fontStyle: 'italic',
      marginTop: 8,
    },
    list: {
      gap: 6,
      marginBottom: 4,
    },
    listRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    listText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textBody,
      lineHeight: 19,
    },
    dotBullet: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.textSubtle,
      marginTop: 8,
      marginLeft: 3,
      marginRight: 3,
    },
    contactList: {
      gap: 8,
      marginBottom: 8,
    },
    contactRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.background,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    contactIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    contactText: {
      flex: 1,
      fontFamily: FONTS.medium,
      fontSize: 13.5,
      color: colors.textPrimary,
    },
    footer: {
      marginTop: 28,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    footerText: {
      fontFamily: FONTS.regular,
      fontSize: 11.5,
      color: colors.textSubtle,
      lineHeight: 17,
      fontStyle: 'italic',
      marginBottom: 8,
    },
    footerLocation: {
      fontFamily: FONTS.medium,
      fontSize: 11.5,
      color: colors.textSubtle,
    },
  });
}
