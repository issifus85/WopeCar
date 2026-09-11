import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import RichBody from '../components/RichBody';

// Mirrors wopecar-website's /eula page content (same content_blocks row,
// slug 'eula') - kept as plain native text rather than fetched live so this
// screen renders reliably offline and during signup, matching app/terms.js's
// existing native/hardcoded convention. Keep in sync with that page (and its
// own FALLBACK constant) if this ever changes.
const SECTIONS = [
  {
    heading: '1. Agreement to Terms',
    body: `By downloading, installing or using the WopeCar mobile application ("App"), you agree to be bound by this End-User License Agreement ("EULA"). If you do not agree to these terms, do not download or use the App.

This EULA is a legal agreement between you and ACRE Logistics Ltd ("WopeCar", "we", "us", "our"), the operator of the WopeCar car rental marketplace.`,
  },
  {
    heading: '2. License Grant',
    body: `WopeCar grants you a limited, non-exclusive, non-transferable, revocable license to download, install and use the App on a mobile device that you own or control, solely for your personal and non-commercial purposes in accordance with this EULA.`,
  },
  {
    heading: '3. Restrictions',
    body: `You agree that you will not:

• Copy, modify, or distribute the App or any content within it
• Reverse engineer, decompile or disassemble the App
• Rent, lease, lend, sell or sublicense the App
• Use the App for any unlawful or unauthorised purpose
• Attempt to gain unauthorised access to any part of the App or its connected systems
• Use the App in any way that could damage, disable or impair the service`,
  },
  {
    heading: '4. Intellectual Property',
    body: `The App and all content, features and functionality within it — including but not limited to the WopeCar name, logo, design, text and graphics — are owned by ACRE Logistics Ltd and are protected by intellectual property laws. Nothing in this EULA transfers any intellectual property rights to you.`,
  },
  {
    heading: '5. User Accounts',
    body: `To use certain features of the App you must create an account. You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You must notify WopeCar immediately of any unauthorised use of your account at support@wopecar.com.`,
  },
  {
    heading: '6. Payments and Transactions',
    body: `All payments made through the App are processed by Paystack, a third-party payment gateway. By making a payment through the App you also agree to Paystack's terms of service. WopeCar does not store your card or payment details.

All prices are displayed in Ghana Cedis (GHS). WopeCar reserves the right to change pricing at any time without notice.`,
  },
  {
    heading: '7. Third-Party Services',
    body: `The App integrates with third-party services including Paystack (payments), Supabase (data storage), Firebase (analytics and crash reporting) and Expo (app infrastructure). Your use of these services is subject to their respective terms and privacy policies. WopeCar is not responsible for the practices of any third-party service providers.`,
  },
  {
    heading: '8. Disclaimer of Warranties',
    body: `The App is provided "as is" and "as available" without warranties of any kind, either express or implied. WopeCar does not warrant that the App will be uninterrupted, error-free, or free of viruses or other harmful components.`,
  },
  {
    heading: '9. Limitation of Liability',
    body: `To the maximum extent permitted by applicable law, ACRE Logistics Ltd shall not be liable for any indirect, incidental, special, consequential or punitive damages arising from your use of or inability to use the App.

WopeCar's total liability to you for any claim arising from this EULA shall not exceed the amount you paid to WopeCar in the 12 months preceding the claim.`,
  },
  {
    heading: '10. Termination',
    body: `WopeCar may terminate or suspend your access to the App at any time, with or without cause, with or without notice. Upon termination your right to use the App ceases immediately.

You may terminate this agreement at any time by deleting the App from your device and closing your WopeCar account.`,
  },
  {
    heading: '11. User Conduct and Objectionable Content',
    body: `WopeCar has zero tolerance for objectionable content and abusive behaviour by any user. You may not use the App to post, send, or otherwise share content that is illegal, threatening, harassing, hateful, obscene, fraudulent, or otherwise objectionable, and you may not use the App to abuse, harass, or defraud another user.

The App provides a way to report an objectionable listing (from any car's detail page) and a way to block a host, which immediately removes their listings from your search results. We review every report and block within 24 hours of receipt and will remove violating content and may suspend or terminate the account responsible for it. To report a concern directly, contact us at support@wopecar.com.`,
  },
  {
    heading: '12. Governing Law',
    body: `This EULA shall be governed by and construed in accordance with the laws of the Republic of Ghana. Any disputes arising under this agreement shall be subject to the exclusive jurisdiction of the courts of Ghana.`,
  },
  {
    heading: '13. Changes to This EULA',
    body: `WopeCar reserves the right to modify this EULA at any time. We will notify you of significant changes by posting a notice in the App or sending an email to your registered address. Your continued use of the App after changes are posted constitutes your acceptance of the revised EULA.`,
  },
  {
    heading: '14. Contact',
    body: `If you have any questions about this EULA please contact us:

ACRE Logistics Ltd
Impact Hub, 1aap Otswe Street
Accra, Greater Accra, Ghana
support@wopecar.com
+233 551 478 540
www.wopecar.com`,
  },
];

function AccordionSection({ heading, body, styles, colors }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.section}>
      <TouchableOpacity style={styles.sectionHeader} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
        <Text style={styles.heading}>{heading}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.teal} />
      </TouchableOpacity>
      {expanded && (
        <View style={styles.body}>
          <RichBody text={body} colors={colors} />
        </View>
      )}
    </View>
  );
}

export default function EulaScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { from } = useLocalSearchParams();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Same GO_BACK-unresolved-on-web fix as app/terms.js - `from` is set by
  // the signup checkbox's "EULA" link so it returns to Sign Up instead of
  // Account.
  const handleBack = useCallback(() => {
    if (from === 'signup') {
      router.replace('/login');
      return;
    }
    router.replace('/(tabs)/profile');
  }, [router, from]);

  const backLabel = from === 'signup' ? 'Sign Up' : 'Account';

  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity onPress={handleBack} hitSlop={10} style={styles.headerBackButton}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          <Text style={styles.headerBackLabel}>{backLabel}</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, handleBack, styles, colors, backLabel]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>End-User License Agreement</Text>
      <Text style={styles.intro}>
        WopeCar Mobile Application — iOS and Android. Last updated October 1, 2026. By using the App you agree to this EULA. Tap a heading to expand it.
      </Text>

      {SECTIONS.map((section) => (
        <AccordionSection key={section.heading} heading={section.heading} body={section.body} styles={styles} colors={colors} />
      ))}
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
  section: {
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 16,
  },
  heading: {
    flex: 1,
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: colors.textPrimary,
  },
  body: {
    paddingBottom: 8,
  },
  });
}
