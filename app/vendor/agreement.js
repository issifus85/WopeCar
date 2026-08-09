import { useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import VendorHeader from '../../components/VendorHeader';
import RichBody from '../../components/RichBody';

// Verbatim excerpt of app/terms.js's "Specific Terms for Partners" section -
// this is the real, already-live Partner/vendor-specific clause set (sourced
// from wopecar.com), just surfaced as its own screen instead of being
// buried inside the general Terms of Service. Not placeholder/invented text.
const PARTNER_TERMS = `As a Partner, you agree to take all necessary measures to ensure the safety and cleanliness of your vehicle; observe regulations including carrying a safety vest and warning triangle; ensure special equipment (e.g. baby seats) complies with safety standards; keep the vehicle in perfect working order and carry out manufacturer-recommended maintenance; audit the vehicle when a Client reports a problem; verify there's no incompatibility between your own insurance and use of the WOPECAR service; provide a compliant, accurate vehicle description including photos; keep your Vehicle Inventory up to date; and respond to rental requests within 24 hours.

You commit to providing a safe, legally registered and insured vehicle with current licence plates, a clean (non-salvage) title, and in good mechanical condition; that your listings will be complete and accurate; that you own or have authority to share the vehicle; and that you will not offer a vehicle that is unsafe, stolen, subject to an unaddressed safety recall, or not roadworthy.

Photography. We may offer photographers to take photos of your vehicle and/or you with it ("Images"). Wopecar may use the Images for advertising, marketing, and other business purposes across any media, without further notice or compensation.

Pricing, earnings, and payments. You may set and revise your vehicle's pricing. Wopecar will pay you the amount collected from Riders, less the applicable fees payable to Wopecar, according to your chosen payment plan.

Reporting vehicle damage. If you believe a rider caused damage to your vehicle, you must report it as soon as you become aware (no more than 24 hours after the scheduled trip end) and cooperate with the investigation to be eligible for coverage under your protection plan. All Partner protection plans include coverage under a third-party automobile liability insurance policy.

Missing vehicles. If your vehicle goes missing, is not returned, or is stolen during a reservation, you must immediately contact a Wopecar representative and follow their instructions, including filing a police report within 24 hours if instructed. If you selected a protection plan, its insurers will defend and indemnify you against qualifying claims, subject to your compliance with these Terms and any policy exclusions.`;

export default function VendorAgreementScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <VendorHeader title="Vendor Agreement" subtitle="Your terms as a WopeCar Partner" onBack={() => router.push('/vendor/menu')} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          As a WopeCar vendor ("Partner"), the terms below apply to you specifically - excerpted from WopeCar's Terms of Service. The complete Terms of Service, including the payments, liability, and dispute resolution provisions that also apply to Partners, governs your use of WopeCar alongside this agreement.
        </Text>

        <RichBody text={PARTNER_TERMS} colors={colors} />

        <TouchableOpacity style={styles.linkButton} onPress={() => router.push({ pathname: '/terms', params: { from: 'vendor-agreement' } })}>
          <Text style={styles.linkButtonText}>View Full Terms of Service</Text>
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
      color: colors.textSubtle,
      lineHeight: 19,
      marginBottom: 20,
    },
    linkButton: {
      alignSelf: 'flex-start',
      marginTop: 8,
    },
    linkButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.teal,
      textDecorationLine: 'underline',
    },
  });
}
