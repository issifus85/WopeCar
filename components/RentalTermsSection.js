import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import SectionHeading from './SectionHeading';

const COLLAPSED_COUNT = 3;

function TermsAccordionBlock({ title, bullet, bulletColor, items, styles }) {
  const [showAll, setShowAll] = useState(false);
  const hasMore = items.length > COLLAPSED_COUNT;
  const visibleItems = showAll ? items : items.slice(0, COLLAPSED_COUNT);

  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>{title}</Text>
      <View style={styles.itemList}>
        {visibleItems.map((item) => (
          <View key={item} style={styles.itemRow}>
            <Text style={[styles.itemBullet, { color: bulletColor }]}>{bullet}</Text>
            <Text style={styles.itemText}>{item}</Text>
          </View>
        ))}
      </View>
      {hasMore && (
        <TouchableOpacity style={styles.viewMoreRow} onPress={() => setShowAll((v) => !v)} activeOpacity={0.7}>
          <Text style={styles.viewMoreText}>{showAll ? 'View less' : 'View more'}</Text>
          <Ionicons name={showAll ? 'chevron-up' : 'chevron-down'} size={14} color={styles.viewMoreText.color} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// A car with no drivenBy value at all (shouldn't happen for real listings,
// but the field is nullable) is treated like Self-drive - showing both
// blocks is the safer default over silently hiding the self-drive terms.
// `items` is { chauffeur: string[], self_drive: string[] } from
// services/rentalTermsApi.js's getRentalTermsSummaryItems() - fetched by
// the parent screen (app/car/[id].js), matching how FaqSection/the old
// RentalTermsSection also received their data as a prop.
export default function RentalTermsSection({ drivenBy, items }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const showSelfDrive = drivenBy !== 'Chauffeur';

  if (!items) return null;

  return (
    <View>
      <SectionHeading>Rental Terms & Conditions</SectionHeading>

      <TermsAccordionBlock title="Chauffeur rental terms" bullet="✓" bulletColor={colors.teal} items={items.chauffeur} styles={styles} />
      {showSelfDrive && (
        <TermsAccordionBlock title="Self-drive rental terms" bullet="✓" bulletColor={colors.teal} items={items.self_drive} styles={styles} />
      )}

      <TouchableOpacity style={styles.fullTermsButton} onPress={() => router.push('/rental-terms')}>
        <Text style={styles.fullTermsText}>View Full Terms & Conditions</Text>
        <Ionicons name="arrow-forward" size={15} color={colors.teal} />
      </TouchableOpacity>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    block: {
      borderWidth: 1,
      borderColor: colors.divider,
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
    },
    blockTitle: {
      fontFamily: FONTS.bold,
      fontSize: 14,
      color: colors.textPrimary,
      marginBottom: 10,
    },
    itemList: {
      gap: 8,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    itemBullet: {
      fontFamily: FONTS.bold,
      fontSize: 13,
      lineHeight: 19,
    },
    itemText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textBody,
      lineHeight: 19,
    },
    viewMoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 10,
      alignSelf: 'flex-start',
    },
    viewMoreText: {
      fontFamily: FONTS.semiBold,
      fontSize: 12.5,
      color: colors.teal,
    },
    fullTermsButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 4,
      paddingVertical: 10,
    },
    fullTermsText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.teal,
    },
  });
}
