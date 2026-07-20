import { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../constants/theme';

const FAQS = [
  {
    question: 'How do I book a car?',
    answer: 'Search for a car on the Home tab, pick your dates and pickup/return times, choose any regional add-ons, fill in your booking details, and pay securely through Paystack to confirm.',
  },
  {
    question: "What's the difference between Self-Drive and Chauffeur cars?",
    answer: 'Self-Drive cars are handed over to you for the rental period and include a delivery fee plus a refundable security deposit. Chauffeur cars come with a driver for the trip.',
  },
  {
    question: 'Is the security deposit refundable?',
    answer: "Yes. The security deposit shown at checkout is refundable and is separate from your rental cost - it's held to cover any damage during the trip.",
  },
  {
    question: 'Can I change my booking dates after paying?',
    answer: "Yes. Open the booking from the Bookings tab and tap Modify Booking. You'll see the new total and only pay the difference if the new dates cost more.",
  },
  {
    question: 'Can I book on a Sunday?',
    answer: "Sundays aren't a working day for pickups or returns, so they're not selectable in the date picker.",
  },
  {
    question: 'How do I cancel a booking?',
    answer: 'Open the booking from the Bookings tab and tap Cancel Booking. Refund timing for already-paid bookings is handled by our support team.',
  },
  {
    question: 'What documents do I need to book?',
    answer: "A valid driver's licence is required for Self-Drive bookings. You can manage your documents from the Account screen.",
  },
];

function FaqItem({ question, answer }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <TouchableOpacity style={styles.faqItem} onPress={() => setExpanded(!expanded)} activeOpacity={0.7}>
      <View style={styles.faqHeader}>
        <Text style={styles.faqQuestion}>{question}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={COLORS.teal} />
      </View>
      {expanded && <Text style={styles.faqAnswer}>{answer}</Text>}
    </TouchableOpacity>
  );
}

export default function HelpCentreScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Help Centre</Text>
      <Text style={styles.intro}>Answers to common questions about booking and using WopeCar.</Text>

      <View style={styles.faqList}>
        {FAQS.map((faq) => (
          <FaqItem key={faq.question} question={faq.question} answer={faq.answer} />
        ))}
      </View>

      <Text style={styles.footer}>
        Can't find what you're looking for? Reach out from the Contact Support option in Settings.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 24,
    color: COLORS.navy,
    marginBottom: 8,
  },
  intro: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#888',
    marginBottom: 20,
    lineHeight: 19,
  },
  faqList: {
    backgroundColor: COLORS.background,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  faqItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  faqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  faqQuestion: {
    flex: 1,
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    color: COLORS.navy,
  },
  faqAnswer: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#666',
    lineHeight: 19,
    marginTop: 10,
  },
  footer: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 18,
  },
});
