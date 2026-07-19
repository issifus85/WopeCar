import { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../constants/theme';
import SectionHeading from './SectionHeading';

const COLLAPSED_COUNT = 3;

export default function FaqSection({ faqs }) {
  const [showAll, setShowAll] = useState(false);
  const [openIndexes, setOpenIndexes] = useState(new Set());

  if (!faqs?.length) return null;

  const visibleFaqs = showAll ? faqs : faqs.slice(0, COLLAPSED_COUNT);
  const hasMore = faqs.length > COLLAPSED_COUNT;

  const toggleOpen = (index) => {
    setOpenIndexes(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <View>
      <SectionHeading>FAQs</SectionHeading>
      {visibleFaqs.map((faq, index) => {
        const isOpen = openIndexes.has(index);
        return (
          <View key={index} style={styles.faqItem}>
            <TouchableOpacity style={styles.faqQuestion} onPress={() => toggleOpen(index)}>
              <Text style={styles.faqQuestionText}>{faq.title}</Text>
              <Ionicons
                name={isOpen ? 'chevron-up' : 'chevron-down'}
                size={16}
                color="#888"
              />
            </TouchableOpacity>
            {isOpen && <Text style={styles.faqAnswerText}>{faq.content}</Text>}
          </View>
        );
      })}
      {hasMore && (
        <TouchableOpacity onPress={() => setShowAll(v => !v)} style={styles.toggleButton}>
          <Text style={styles.toggleText}>
            {showAll ? 'Show Less' : `View All ${faqs.length} FAQs`}
          </Text>
          <Ionicons
            name={showAll ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={COLORS.teal}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  faqItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingVertical: 12,
  },
  faqQuestion: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  faqQuestionText: {
    flex: 1,
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    color: COLORS.navy,
  },
  faqAnswerText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#666',
    lineHeight: 19,
    marginTop: 8,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 12,
    paddingVertical: 8,
  },
  toggleText: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    color: COLORS.teal,
  },
});
