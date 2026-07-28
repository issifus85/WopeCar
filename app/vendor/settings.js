import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import VendorHeader from '../../components/VendorHeader';
import ConfirmModal from '../../components/ConfirmModal';

function Section({ title, children, styles }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Row({ icon, label, subtitle, onPress, right, last, styles, colors }) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={[styles.row, last && styles.rowLast]} onPress={onPress} activeOpacity={onPress ? 0.6 : 1}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={colors.teal} />
      </View>
      <View style={styles.rowLabelWrap}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      {right ?? (onPress && <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />)}
    </Wrapper>
  );
}

export default function VendorSettingsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [comingSoon, setComingSoon] = useState(null);

  return (
    <View style={styles.container}>
      <VendorHeader title="Vendor Settings" subtitle="Fleet and listing preferences" onBack={() => router.push('/vendor/menu')} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Section title="Payouts & Verification" styles={styles}>
          <Row
            icon="card-outline"
            label="Payout Method"
            subtitle="How you get paid for completed bookings"
            onPress={() => setComingSoon('Payout Method')}
            styles={styles}
            colors={colors}
          />
          <Row
            icon="document-text-outline"
            label="Business & Tax Information"
            subtitle="Registration and tax details for payouts"
            onPress={() => setComingSoon('Business & Tax Information')}
            styles={styles}
            colors={colors}
          />
          <Row
            icon="shield-checkmark-outline"
            label="Document Verification"
            subtitle="Ownership and identity documents"
            last
            onPress={() => setComingSoon('Document Verification')}
            styles={styles}
            colors={colors}
          />
        </Section>
      </ScrollView>

      <ConfirmModal
        visible={!!comingSoon}
        title={comingSoon}
        message="This feature isn't available yet - we're working on it."
        confirmLabel="OK"
        cancelLabel={null}
        onConfirm={() => setComingSoon(null)}
        onCancel={() => setComingSoon(null)}
      />
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
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontFamily: FONTS.bold,
      fontSize: 14,
      color: colors.textSubtle,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 10,
    },
    sectionCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
      gap: 12,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    rowIcon: {
      width: 34,
      height: 34,
      borderRadius: 8,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowLabelWrap: {
      flex: 1,
    },
    rowLabel: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    rowSubtitle: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 2,
    },
  });
}
