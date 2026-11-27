import { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import RichBody from '../components/RichBody';

const SECTIONS = [
  {
    heading: '1. Information We Collect',
    body: `We collect various types of information from and about you to provide and improve our Services. This may include:

• Personal Identification Information — name, email address, phone number, physical address, driver's licence details, passport/ID number, and other identification necessary for verification and compliance.
• Vehicle Information (for Car Owners/Partners) — vehicle make, model, year, registration details, insurance information, maintenance records, and photos.
• Transaction Information — details about rentals you book or provide, payment amounts, and dates.
• Usage Data — how you access and use our Services, such as IP address, browser type, operating system, pages viewed, time spent on pages, and referring URLs.
• Location Information — if you enable location services, we may collect precise location data to facilitate car finding and delivery. When a fleet officer delivers or collects a car, we collect the officer's location during the trip, as described in section 8.
• Communications — records of your communications with us and with other users through our platform.`,
  },
  {
    heading: '2. How We Use Your Information',
    body: `We use the information we collect for various purposes, including:

• Providing, operating, and maintaining our Services, including facilitating car bookings and rentals.
• Processing your transactions and managing your account.
• Verifying your identity and ensuring the safety and security of our platform.
• Communicating with you about your bookings, account, updates, and promotional offers.
• Personalizing your experience and recommending relevant vehicles or services.
• Improving and developing new features for our Services.
• Conducting research and analysis to understand market trends and user behavior.
• Complying with legal obligations and enforcing our terms and conditions.
• Preventing fraud, abuse, and other harmful activities.`,
  },
  {
    heading: '3. Information Sharing and Disclosure',
    body: `We may share your information with third parties in the following situations:

• With other users — limited information necessary to facilitate a rental (e.g. your name to the car owner, car details to the renter). For deliveries and pickups, the assigned fleet officer sees the details needed for the trip, and the renter sees the officer's name, photo and live location, as described in section 8.
• Service providers — third-party vendors, consultants, and other providers who perform services on our behalf (e.g. payment processing, identity verification, cloud hosting, marketing).
• Legal compliance and safety — when required by law or in response to valid requests by public authorities, or to protect our rights, privacy, safety, or property, and that of our users or the public.
• Business transfers — in connection with a merger, sale of company assets, financing, or acquisition of all or a portion of our business.
• With your consent — we may share your information for any other purpose with your explicit consent.`,
  },
  {
    heading: '4. Payment Information Security',
    body: `WopeCar takes your payment security seriously. To ensure the highest level of protection for your financial data:

WopeCar does not store your credit card numbers, debit card numbers, bank account details, or any other sensitive payment card data on its servers.

We use Paystack, a leading third-party payment gateway, to process all payment transactions. Paystack is a secure, reputable payment processor that adheres to the Payment Card Industry Data Security Standard (PCI DSS).

When you make a payment through WopeCar, your sensitive payment information is directly collected and processed by Paystack. WopeCar receives only a transaction confirmation from Paystack, without accessing or storing your full card details. By using our payment services, you acknowledge that your payment information will be handled by Paystack in accordance with their own privacy policy and terms of service.`,
  },
  {
    heading: '5. Data Security',
    body: `We implement reasonable technical and organizational measures designed to protect your personal information from unauthorized access, use, alteration, or destruction. However, no method of transmission over the Internet or method of electronic storage is 100% secure, and while we strive to use commercially acceptable means to protect your personal information, we cannot guarantee its absolute security.`,
  },
  {
    heading: '6. Disclaimers and Limitations of Liability',
    body: `This website and the information, names, images, and logos relating to WopeCar are provided "as is" without warranty of any kind, whether express or implied. The WopeCar Services and all content, materials, and products made available through them are provided on an "as is" and "as available" basis, and your use of the Services is at your sole risk.

Email communications relating to WopeCar's official business are proprietary, confidential, and legally privileged. If an email reaches you unintentionally, please notify the sender and do not read, disclose, or use its contents.

WopeCar attempts to be as accurate as possible, but does not warrant that any content is accurate, complete, reliable, current, or error-free. To the full extent permissible by law, WopeCar disclaims all warranties, express or implied, including implied warranties of merchantability and fitness for a particular purpose, and does not warrant that the Services or any communications from WopeCar are free of viruses or other harmful components.

In no event will WopeCar be liable for any damages — including indirect or consequential damages — arising from the use of, or inability to use, any WopeCar Service, unless otherwise specified in writing.`,
  },
  {
    heading: '7. Your Rights and Choices',
    body: `You may have certain rights regarding your personal information, depending on your location and applicable laws. These may include the right to:

• Access and obtain a copy of your personal data.
• Request correction of inaccurate or incomplete data.
• Request deletion of your personal data.
• Object to or restrict the processing of your data.
• Withdraw your consent, where processing is based on consent.

To exercise any of these rights, please contact us using the information below.`,
  },
  {
    heading: '8. Fleet Officer Deliveries and Pickups',
    body: `When you book a delivery or pickup, a WopeCar fleet officer may bring the car to you or collect it from you. This section explains the location and trip information we handle for these trips.

8.1 Location Information We Collect

When a WopeCar fleet officer delivers a car to you or collects a car from you, we collect the officer's real-time location through the WopeCar app. This includes GPS coordinates, direction of travel, speed, location accuracy and the time of each reading. We collect it only while the officer is on the way on an active delivery or pickup: from the moment they tap Start trip until they arrive, the trip ends, or they stop sharing. We do not collect an officer's location outside an active trip, during the rest of their shift, or when the WopeCar app is closed or running in the background.

If you are a renter or vendor, we do not collect your precise location for this feature. We use the delivery or pickup address in your booking to calculate the route and estimated arrival time.

We also keep a record of trip events, such as when a trip is assigned, started, running late or completed, and when location sharing starts and stops.

8.2 How We Use Location Information

We use fleet officer location information to:

• Show you a live map and estimated arrival time for your delivery or pickup.
• Let WopeCar support and administrators coordinate, assign and monitor trips, and help if a trip is delayed or there is a problem.
• Calculate routes and arrival times.
• Investigate incidents, disputes and safety concerns relating to a trip.
• Improve the reliability and accuracy of our delivery and pickup service.

We do not use fleet officer location information for advertising, and we do not sell it.

8.3 Who Can See Location Information

• Renters on the trip — you can see the assigned fleet officer's live location and estimated arrival time for your own booking only, and only while the trip is active. Your fleet officer's name and photo are also shown to you. Vendors do not see the officer's location.
• WopeCar administrators and support — authorised staff can see active officers' locations and trip records to manage deliveries and pickups.
• Service providers — we use trusted providers to run the app, store data and calculate routes and estimated arrival times, including Supabase (hosting and database), Google Maps Platform (maps, routes and arrival times), Apple Maps (maps on iPhone) and Expo (push notifications). They process the data only on our instructions.
• Where required by law — we may disclose information to authorities where the law requires it or to protect safety.

Fleet officers can see the booking information needed to complete their assigned trips, including the renter's and vendor's names and phone numbers, the car, the addresses and the schedule. Contact details are shown only while the trip is open. Fleet officers cannot see pricing, payment or payout information.

8.4 How Long We Keep It

We keep fleet officer location data for 30 days after it is recorded, then delete it. We may keep trip event records, and any location data needed for an open dispute, insurance claim, safety investigation or legal requirement, for as long as that matter requires.

8.5 Your Choices and Rights

• Fleet officers are told in the app when location sharing is on and can see when it stops. They can stop sharing at any time during a trip. Location is never collected outside active trips. Officers can contact support@wopecar.com about their data.
• Renters and vendors can ask us for a copy of the trip information we hold about them, ask us to correct it, or raise a concern about how it is used.
• Under Ghana's Data Protection Act, 2012 (Act 843), you may have rights to access, correct and object to the processing of your personal data. To use these rights, contact us at support@wopecar.com. You may also complain to the Data Protection Commission.

8.6 Security and Changes

We limit who can see location data with access controls, so each person sees only what their role needs, and we protect it with encryption in transit and at rest. We may update this section as we change how fleet officer location sharing works. When we make a material change, we will update the "Last updated" date at the top of this policy and notify users in the app or by email where appropriate.`,
  },
  {
    heading: '9. Changes to This Privacy Policy',
    body: `We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date at the top. We encourage you to review this Privacy Policy periodically. Your continued use of the Services after any modification signifies your acceptance of those changes.`,
  },
  {
    heading: '10. Contact Us',
    body: `If you have any questions about this Privacy Policy, your personal information, or our data practices, please contact us at:

Email: support@wopecar.com
Address: Impact Hub, 1aap Otswe Street, Accra, Ghana
Website: wopecar.com`,
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

export default function PrivacyScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Only reached from Profile's menu (pushed from inside the (tabs) group's
  // nested navigator) - same GO_BACK-unresolved-on-web fix as
  // protection-plan.js/account.js/documents.js.
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
      <Text style={styles.title}>Privacy Policy</Text>
      <Text style={styles.effectiveDate}>Last updated: November 27, 2026. Effective: November 27, 2026.</Text>
      <Text style={styles.intro}>
        At WopeCar Ghana ("WopeCar," "we," "us," or "our"), we are committed to protecting your privacy and handling your personal information with transparency and care. This Privacy Policy describes how we collect, use, process, and share your information when you use our website, mobile applications, and services (collectively, the "Services"). By using our Services, you agree to the collection and use of information in accordance with this policy. Tap a heading to expand it.
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
    marginBottom: 4,
  },
  effectiveDate: {
    fontFamily: FONTS.medium,
    fontSize: 12,
    color: colors.textSubtle,
    marginBottom: 14,
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
