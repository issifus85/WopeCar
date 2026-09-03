import { useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import VendorHeader from '../../components/VendorHeader';

// Both sections below are real, not invented: the eligibility bullets are
// quoted from the real Partner Terms (app/vendor/agreement.js's
// PARTNER_TERMS), and the vetting checklist mirrors the exact sections/items
// already built into the Vehicle Inspection checklist
// (app/inspection/interior.js / app/vendor/inspection/interior.js) - the
// same checklist WopeCar staff use during a real inspection.
const ELIGIBILITY = [
  'Legally registered and insured, with current licence plates',
  'A clean, non-salvage title',
  'In good mechanical condition and roadworthy',
  'Not unsafe, stolen, or subject to an unaddressed safety recall',
  'You own the vehicle, or have authority to share it',
];

const CHECKLIST_SECTIONS = [
  {
    title: 'Exterior & Lights',
    icon: 'car-outline',
    items: ['All lights operational', 'Mirrors in good condition', 'Windshield clear', 'Wipers & washer functioning', 'Body condition good', 'Doors & locks functioning'],
  },
  {
    title: 'Tyres & Safety',
    icon: 'ellipse-outline',
    items: ['Tyres in good condition', 'Wheel alignment & balance', 'Seat belts functioning'],
  },
  {
    title: 'Fluids & Engine',
    icon: 'water-outline',
    items: ['Engine oil level & condition', 'Brake fluid level', 'Coolant level'],
  },
  {
    title: 'Interior & Function',
    icon: 'thermometer-outline',
    items: ['No dashboard warning lights', 'Air conditioning functioning'],
  },
  {
    title: 'Safety Equipment',
    icon: 'shield-checkmark-outline',
    items: ['2 warning triangles', 'Spare tyre', 'Jack', 'Spanner / tools', 'Fire extinguisher'],
  },
];

export default function VendorSafetyGuideScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <VendorHeader title="Vehicle Requirements & Safety" subtitle="What your car needs to qualify" onBack={() => router.replace('/vendor/resources')} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Every car goes through a photo verification and vetting appointment before it can go live. Here's what qualifies,
          and what the inspection covers.
        </Text>

        <View style={styles.eligibilityCard}>
          <View style={styles.eligibilityHeader}>
            <Ionicons name="checkmark-circle" size={18} color={colors.white} />
            <Text style={styles.eligibilityHeaderText}>Eligibility Requirements</Text>
          </View>
          {ELIGIBILITY.map((rule) => (
            <View key={rule} style={styles.eligibilityRow}>
              <Ionicons name="checkmark" size={14} color={colors.teal} />
              <Text style={styles.eligibilityText}>{rule}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>What We Check During Vetting</Text>
        {CHECKLIST_SECTIONS.map((section) => (
          <View key={section.title} style={styles.checklistCard}>
            <View style={styles.checklistHeader}>
              <View style={styles.checklistIconBadge}>
                <Ionicons name={section.icon} size={16} color={colors.teal} />
              </View>
              <Text style={styles.checklistTitle}>{section.title}</Text>
            </View>
            {section.items.map((item) => (
              <View key={item} style={styles.checklistRow}>
                <View style={styles.checklistDot} />
                <Text style={styles.checklistItemText}>{item}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.disclaimer}>
          <Ionicons name="information-circle-outline" size={14} color={colors.textSubtle} />
          <Text style={styles.disclaimerText}>
            This is the same checklist WopeCar staff use during your car's real vetting appointment.
          </Text>
        </View>

        <TouchableOpacity style={styles.ctaButton} onPress={() => router.push('/vendor/getting-started')}>
          <Text style={styles.ctaButtonText}>Schedule Your Vetting</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkButton} onPress={() => router.push('/vendor/inspections')}>
          <Text style={styles.linkButtonText}>View Vehicle Inspections</Text>
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
      color: colors.textMuted,
      lineHeight: 19,
      marginBottom: 20,
    },
    eligibilityCard: {
      backgroundColor: colors.navy,
      borderRadius: 18,
      padding: 18,
      marginBottom: 28,
    },
    eligibilityHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 14,
    },
    eligibilityHeaderText: {
      fontFamily: FONTS.bold,
      fontSize: 15,
      color: colors.white,
    },
    eligibilityRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginBottom: 10,
    },
    eligibilityText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: 'rgba(255,255,255,0.85)',
      lineHeight: 19,
    },
    sectionTitle: {
      fontFamily: FONTS.bold,
      fontSize: 16,
      color: colors.textPrimary,
      marginBottom: 14,
    },
    checklistCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      marginBottom: 12,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    checklistHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10,
    },
    checklistIconBadge: {
      width: 30,
      height: 30,
      borderRadius: 9,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checklistTitle: {
      fontFamily: FONTS.bold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    checklistRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 5,
      paddingLeft: 4,
    },
    checklistDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: colors.teal,
    },
    checklistItemText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textMuted,
    },
    disclaimer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginTop: 8,
      marginBottom: 8,
    },
    disclaimerText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
      lineHeight: 16,
    },
    ctaButton: {
      backgroundColor: colors.teal,
      borderRadius: 12,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 16,
    },
    ctaButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 15,
      color: colors.white,
    },
    linkButton: {
      alignSelf: 'center',
      marginTop: 16,
    },
    linkButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.teal,
      textDecorationLine: 'underline',
    },
  });
}
