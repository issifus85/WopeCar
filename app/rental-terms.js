import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import { getRentalTermsSections } from '../services/rentalTermsApi';

function TermsGroup({ group, colors, styles }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle}>{group.title}</Text>
      {group.clauses.map((clause, index) => (
        <ClauseAccordion key={clause.title} index={index + 1} clause={clause} colors={colors} styles={styles} />
      ))}
    </View>
  );
}

function ClauseAccordion({ index, clause, colors, styles }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={styles.clauseSection}>
      <TouchableOpacity style={styles.clauseHeader} onPress={() => setExpanded((v) => !v)} activeOpacity={0.7}>
        <Text style={styles.clauseTitle}>{index}. {clause.title}</Text>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.teal} />
      </TouchableOpacity>
      {expanded && <Text style={styles.clauseBody}>{clause.body}</Text>}
    </View>
  );
}

export default function RentalTermsScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [sections, setSections] = useState(null);

  useEffect(() => {
    getRentalTermsSections().then(setSections).catch(() => setSections(null));
  }, []);

  if (!sections) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Rental Terms & Conditions</Text>
      <Text style={styles.intro}>
        These are WopeCar's standard rental terms, covering both chauffeured and self-drive bookings. Tap a clause to expand it. A car's own listing shows only the terms that apply to how it's booked.
      </Text>

      <TermsGroup group={sections.chauffeur} colors={colors} styles={styles} />
      <TermsGroup group={sections.self_drive} colors={colors} styles={styles} />
    </ScrollView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
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
      marginBottom: 24,
      lineHeight: 19,
    },
    group: {
      marginBottom: 20,
    },
    groupTitle: {
      fontFamily: FONTS.bold,
      fontSize: 17,
      color: colors.textPrimary,
      marginBottom: 6,
    },
    clauseSection: {
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    clauseHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 14,
    },
    clauseTitle: {
      flex: 1,
      fontFamily: FONTS.bold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    clauseBody: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textBody,
      lineHeight: 20,
      paddingBottom: 14,
    },
  });
}
