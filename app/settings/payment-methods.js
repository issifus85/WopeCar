import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';

// WopeCar's checkout (services/paystackCheckout.js) opens Paystack's own
// hosted payment page for every booking - there's no card-on-file vault
// tokenized server-side yet, so there's genuinely nothing saved to list
// here. An honest empty state beats fabricating fake cards, same call made
// for Documents Hub's Trip Documents section before VIR/Rental Agreement
// existed to fill it.
export default function PaymentMethodsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.emptyState}>
        <Ionicons name="card-outline" size={32} color={colors.disabled} />
        <Text style={styles.emptyStateTitle}>No Saved Payment Methods</Text>
        <Text style={styles.emptyStateText}>
          You enter your card details fresh at checkout each time - nothing is saved to your account yet. Once
          saved cards are supported, you'll be able to pick a default one here.
        </Text>
      </View>

      <View style={styles.linkRow}>
        <Ionicons name="receipt-outline" size={18} color={colors.teal} />
        <Text style={styles.linkText} onPress={() => router.push('/settings/payment-history')}>
          View Payment History instead
        </Text>
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
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 24,
      paddingBottom: 60,
    },
    emptyStateTitle: {
      fontFamily: FONTS.semiBold,
      fontSize: 15,
      color: colors.textPrimary,
      marginTop: 4,
    },
    emptyStateText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      textAlign: 'center',
      lineHeight: 19,
    },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 16,
    },
    linkText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.teal,
    },
  });
}
