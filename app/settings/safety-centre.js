import { useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, Linking, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';

const SECTIONS = [
  {
    icon: 'shield-checkmark-outline',
    heading: 'Before your trip',
    body: 'Check the car photos and condition notes on the listing, confirm your pickup location and time, and make sure your driver\'s licence is up to date under Account.',
  },
  {
    icon: 'car-outline',
    heading: 'During your trip',
    body: 'Inspect the vehicle at pickup and report any existing damage immediately. Follow all road safety laws and keep your emergency contact details current under Account.',
  },
  {
    icon: 'alert-circle-outline',
    heading: 'In an emergency',
    body: 'For accidents, breakdowns, or safety concerns during a trip, call WopeCar support immediately using the button below, or contact your local emergency services first if anyone is in danger.',
  },
  {
    icon: 'flag-outline',
    heading: 'Report a safety concern',
    body: 'If something about a car, driver, or trip felt unsafe, use Report a Problem in Settings so our team can look into it.',
  },
];

const SUPPORT_EMAIL = 'support@wopecar.com';
const SUPPORT_PHONE = '+233551478540';

export default function SafetyCentreScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Safety Centre</Text>
      <Text style={styles.intro}>Resources to help you stay safe before, during, and after a WopeCar trip.</Text>

      {SECTIONS.map((section) => (
        <View key={section.heading} style={styles.card}>
          <View style={styles.cardIcon}>
            <Ionicons name={section.icon} size={20} color={colors.teal} />
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardHeading}>{section.heading}</Text>
            <Text style={styles.cardText}>{section.body}</Text>
          </View>
        </View>
      ))}

      <TouchableOpacity style={styles.emergencyButton} onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE}`)}>
        <Ionicons name="call-outline" size={18} color={colors.white} />
        <Text style={styles.emergencyButtonText}>Call WopeCar Support</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Safety concern')}`)}
      >
        <Ionicons name="mail-outline" size={18} color={colors.textPrimary} />
        <Text style={styles.secondaryButtonText}>Email WopeCar Support</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
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
    fontSize: 24,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  intro: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: colors.textSubtle,
    marginBottom: 20,
    lineHeight: 19,
  },
  card: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: colors.background,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  cardIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.highlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
  },
  cardHeading: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  cardText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  emergencyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.navy,
    borderRadius: 12,
    paddingVertical: 15,
    marginTop: 8,
  },
  emergencyButtonText: {
    fontFamily: FONTS.semiBold,
    color: colors.white,
    fontSize: 15,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 15,
    marginTop: 10,
  },
  secondaryButtonText: {
    fontFamily: FONTS.semiBold,
    color: colors.textPrimary,
    fontSize: 15,
  },
  });
}
