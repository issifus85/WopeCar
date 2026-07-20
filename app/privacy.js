import { useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView } from 'react-native';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';

const SECTIONS = [
  {
    heading: '1. Information We Collect',
    body: `We collect various types of information from and about you to provide and improve our Services. This may include:

• Personal Identification Information — name, email address, phone number, physical address, driver's licence details, passport/ID number, and other identification necessary for verification and compliance.
• Vehicle Information (for Car Owners/Hosts) — vehicle make, model, year, registration details, insurance information, maintenance records, and photos.
• Transaction Information — details about rentals you book or provide, payment amounts, and dates.
• Usage Data — how you access and use our Services, such as IP address, browser type, operating system, pages viewed, time spent on pages, and referring URLs.
• Location Information — if you enable location services, we may collect precise location data to facilitate car finding and delivery.
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

• With other users — limited information necessary to facilitate a rental (e.g. your name to the car owner, car details to the renter).
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
    heading: '8. Changes to This Privacy Policy',
    body: `We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Effective Date" at the top. We encourage you to review this Privacy Policy periodically. Your continued use of the Services after any modification signifies your acceptance of those changes.`,
  },
  {
    heading: '9. Contact Us',
    body: `If you have any questions about this Privacy Policy, your personal information, or our data practices, please contact us at:

Email: support@wopecar.com
Address: Impact Hub, 1aap Otswe Street, Accra, Ghana
Website: wopecar.com`,
  },
];

export default function PrivacyScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Privacy Policy</Text>
      <Text style={styles.effectiveDate}>Effective Date: June 7, 2025</Text>
      <Text style={styles.intro}>
        At WopeCar Ghana ("WopeCar," "we," "us," or "our"), we are committed to protecting your privacy and handling your personal information with transparency and care. This Privacy Policy describes how we collect, use, process, and share your information when you use our website, mobile applications, and services (collectively, the "Services"). By using our Services, you agree to the collection and use of information in accordance with this policy.
      </Text>

      {SECTIONS.map((section) => (
        <View key={section.heading} style={styles.section}>
          <Text style={styles.heading}>{section.heading}</Text>
          <Text style={styles.body}>{section.body}</Text>
        </View>
      ))}
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
    marginBottom: 22,
  },
  heading: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  body: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: colors.textBody,
    lineHeight: 21,
  },
  });
}
