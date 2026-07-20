import { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../constants/theme';

// Pulled from the live FAQ page at wopecar.com/faq - keep in sync with that
// page if it changes, since these are the company's official answers.
const FAQS = [
  {
    question: 'Can I rent a car with cash?',
    answer: 'No, Wopecar prefers online payment via Visa card, Mobile Money (MOMO), or direct bank transfer.',
  },
  {
    question: 'What do you need to rent a car at Wopecar?',
    answer: "A valid driver's license, any other national ID location in Ghana, minimum age requirements, acceptable modes of payment, and a proof of residence.",
  },
  {
    question: 'How can I obtain a receipt or proof of payment?',
    answer: 'An email of your invoice and receipt will be sent directly to your email.',
  },
  {
    question: 'What forms of payment are available to rent a car?',
    answer: '1. Paystack online payment (Visa, Mastercard, Mobile Money) 2. Direct mobile money 3. Direct bank transfer.',
  },
  {
    question: 'How do I cancel my booking?',
    answer: 'You can cancel online with your confirmation number, by emailing support@wopecar.com, or by calling customer care.',
  },
  {
    question: 'Do I pay a fee for returning a rented car late?',
    answer: "Late returning of your ride will attract a full day's charge unless a time extension is requested by the rider.",
  },
  {
    question: 'What are the business days & hours of work?',
    answer: 'Business days are Monday - Saturday. Working hours are 8:30am - 5pm each working day. We do not operate on Sundays.',
  },
  {
    question: 'Can I have my car delivered to me?',
    answer: 'Yes, all rides are delivered directly to your location at a flat fee of GHS 200 within Accra.',
  },
  {
    question: 'How do I contact Wopecar to make enquiries?',
    answer: 'You can reach us through online support, social media, phone, or email.',
  },
  {
    question: 'What do I do if I have an accident?',
    answer: "Contact customer support immediately. All cars are comprehensively insured as a requirement, but damages such as small dents, scratches, or flat tires caused by the rider will need to be covered by the rider.",
  },
  {
    question: 'What are the cleaning and safety policies on Wopecar?',
    answer: 'All cars are delivered clean and disinfected by Wopecar. Riders returning cars are required to return their booked cars completely clean.',
  },
  {
    question: 'What do I do about fuel?',
    answer: 'Cars are delivered fully fueled to riders. Cars must be returned in the same condition, i.e. fully fueled. Riders must report and obtain evidence of the fuel level before and after the booked trip.',
  },
  {
    question: 'Is there an age requirement?',
    answer: 'Wopecar renters must be 22 years and above.',
  },
  {
    question: 'Can I make a one-day booking?',
    answer: "Yes, if you're booking a chauffeured service. No if you want a self-drive service - the minimum number of days for self-drive is 3 days.",
  },
  {
    question: 'Does the same rate apply to all destinations?',
    answer: 'No, rates differ from region to region.',
  },
  {
    question: 'Are there other costs aside from the rental amount?',
    answer: 'Yes. Self-drive bookings include a security deposit and delivery fee. Chauffeured services include a driver allowance and accommodation where applicable.',
  },
  {
    question: 'What is a security deposit?',
    answer: 'This fee is refundable when the vehicle is returned in the same condition as it was given (washed, fueled, and without any physical damage). It is 25% of the rental amount or a flat fee of GHS 500, depending on the type of car and the rental period.',
  },
  {
    question: 'Where can I charge my EV?',
    answer: 'You can charge at the following locations: Home, Tseaddo, AnC Mall, Nungua, and East Legon.',
  },
  {
    question: 'How much notice is required to make a reservation?',
    answer: 'A 24-hour notice is required to make a reservation.',
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
