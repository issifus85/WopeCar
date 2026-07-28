import { useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useSettings } from '../../../contexts/SettingsContext';
import VendorHeader from '../../../components/VendorHeader';

function Row({ icon, label, subtitle, onPress, last, styles, colors, tintColor }) {
  return (
    <TouchableOpacity style={[styles.row, last && styles.rowLast]} onPress={onPress} activeOpacity={0.6}>
      <View style={[styles.rowIcon, tintColor && { backgroundColor: `${tintColor}22` }]}>
        <Ionicons name={icon} size={18} color={tintColor ?? colors.teal} />
      </View>
      <View style={styles.rowLabelWrap}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
    </TouchableOpacity>
  );
}

export default function VendorMenuScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { updateSetting } = useSettings();

  const switchToClientMode = () => {
    updateSetting('appMode', 'client');
    router.replace('/(tabs)/profile');
  };

  return (
    <View style={styles.container}>
      <VendorHeader title="Menu" subtitle="Resources, agreement, and settings" showBack={false} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Row
            icon="clipboard-outline"
            label="Vehicle Inspections"
            subtitle="Pre & post-rental checklists"
            onPress={() => router.push('/vendor/inspections')}
            styles={styles}
            colors={colors}
          />
          <Row
            icon="book-outline"
            label="Vendor Resources"
            subtitle="Guides for WopeCar hosts"
            onPress={() => router.push('/vendor/resources')}
            styles={styles}
            colors={colors}
          />
          <Row
            icon="document-text-outline"
            label="Vendor Agreement"
            subtitle="Your terms as a WopeCar Partner"
            onPress={() => router.push('/vendor/agreement')}
            styles={styles}
            colors={colors}
          />
          <Row
            icon="settings-outline"
            label="Vendor Settings"
            subtitle="Listing and payout preferences"
            last
            onPress={() => router.push('/vendor/settings')}
            styles={styles}
            colors={colors}
          />
        </View>

        <View style={styles.card}>
          <Row
            icon="swap-horizontal-outline"
            label="Switch to Client Mode"
            subtitle="Go back to booking cars as a renter"
            last
            onPress={switchToClientMode}
            styles={styles}
            colors={colors}
            tintColor={colors.orange}
          />
        </View>
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
      gap: 20,
    },
    card: {
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
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
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
