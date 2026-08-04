import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import SectionHeading from './SectionHeading';
import { CHAUFFEUR_TERMS, SELF_DRIVE_TERMS } from '../constants/rentalTerms';

function TermsBlock({ block, styles }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <View style={styles.block}>
      <TouchableOpacity style={styles.blockHeader} onPress={() => setIsExpanded((v) => !v)} activeOpacity={0.7}>
        <Text style={styles.blockTitle}>{block.title}</Text>
        <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={styles.chevronColor} />
      </TouchableOpacity>

      {isExpanded && (
        <View style={styles.clauseList}>
          {block.clauses.map((clause, index) => (
            <View key={clause.title} style={styles.clause}>
              <Text style={styles.clauseTitle}>{index + 1}. {clause.title}</Text>
              <Text style={styles.clauseBody}>{clause.body}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// A car with no drivenBy value at all (shouldn't happen for real listings,
// but the field is nullable) is treated like Self-drive - showing both
// blocks is the safer default over silently hiding the self-drive terms.
export default function RentalTermsSection({ drivenBy }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const showSelfDrive = drivenBy !== 'Chauffeur';

  return (
    <View>
      <SectionHeading>Rental Terms & Conditions</SectionHeading>

      <TermsBlock block={CHAUFFEUR_TERMS} styles={{ ...styles, chevronColor: colors.textMuted }} />
      {showSelfDrive && <TermsBlock block={SELF_DRIVE_TERMS} styles={{ ...styles, chevronColor: colors.textMuted }} />}

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
      marginBottom: 10,
      overflow: 'hidden',
    },
    blockHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 13,
      backgroundColor: colors.background,
    },
    blockTitle: {
      flex: 1,
      fontFamily: FONTS.bold,
      fontSize: 14,
      color: colors.textPrimary,
      marginRight: 8,
    },
    clauseList: {
      paddingHorizontal: 14,
      paddingBottom: 14,
      paddingTop: 4,
      gap: 12,
    },
    clause: {
      gap: 3,
    },
    clauseTitle: {
      fontFamily: FONTS.bold,
      fontSize: 13,
      color: colors.textPrimary,
    },
    clauseBody: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textBody,
      lineHeight: 19,
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
