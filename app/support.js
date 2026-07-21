import { useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';

const SUPPORT_EMAIL = 'support@wopecar.com';

export default function SupportScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const openMail = (subject) => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`);
  };

  const ITEMS = [
    { label: 'Help Centre', subtitle: 'FAQs', icon: 'help-circle-outline', onPress: () => router.push('/settings/help-centre') },
    { label: 'Contact Support', subtitle: 'Email us', icon: 'mail-outline', onPress: () => openMail('Support request') },
    { label: 'Report a Problem', subtitle: 'Submit issue', icon: 'alert-circle-outline', onPress: () => openMail('Report a Problem') },
    { label: 'Safety Centre', subtitle: 'Emergency & safety resources', icon: 'shield-checkmark-outline', onPress: () => router.push('/settings/safety-centre') },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.intro}>Get help with bookings, report an issue, or reach the WopeCar team directly.</Text>
      <View style={styles.menu}>
        {ITEMS.map((item, index) => (
          <TouchableOpacity
            key={item.label}
            style={[styles.row, index === ITEMS.length - 1 && styles.rowLast]}
            onPress={item.onPress}
          >
            <View style={styles.icon}>
              <Ionicons name={item.icon} size={20} color={colors.teal} />
            </View>
            <View style={styles.info}>
              <Text style={styles.label}>{item.label}</Text>
              <Text style={styles.subtitle}>{item.subtitle}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: 16,
    },
    intro: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      lineHeight: 19,
      marginBottom: 16,
    },
    menu: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingHorizontal: 16,
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    icon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    info: {
      flex: 1,
    },
    label: {
      fontFamily: FONTS.medium,
      fontSize: 14,
      color: colors.textPrimary,
    },
    subtitle: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 2,
    },
  });
}
