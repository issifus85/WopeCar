import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';

export default function BillingAddressScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, updateProfile } = useAuth();

  const [address, setAddress] = useState(user?.address ?? '');
  const [address2, setAddress2] = useState(user?.address2 ?? '');
  const [city, setCity] = useState(user?.city ?? '');
  const [state, setState] = useState(user?.state ?? '');
  const [country, setCountry] = useState(user?.country ?? '');
  const [zipCode, setZipCode] = useState(user?.zipCode ?? '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await updateProfile({
        address,
        address2,
        city,
        state,
        country,
        zip_code: zipCode,
      });
      Alert.alert('Billing Address Updated', 'Your billing details have been saved.', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.intro}>Used for billing and receipts.</Text>

      <View style={styles.field}>
        <Text style={styles.label}>Address Line 1</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 12 Independence Ave"
          placeholderTextColor={colors.textSubtle}
          value={address}
          onChangeText={setAddress}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Address Line 2</Text>
        <TextInput
          style={styles.input}
          placeholder="Apartment, suite, etc. (optional)"
          placeholderTextColor={colors.textSubtle}
          value={address2}
          onChangeText={setAddress2}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>City</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Accra"
          placeholderTextColor={colors.textSubtle}
          value={city}
          onChangeText={setCity}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>State / Region</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Greater Accra"
          placeholderTextColor={colors.textSubtle}
          value={state}
          onChangeText={setState}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Country</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Ghana"
          placeholderTextColor={colors.textSubtle}
          value={country}
          onChangeText={setCountry}
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>ZIP / Postal Code</Text>
        <TextInput
          style={styles.input}
          placeholder="Optional"
          placeholderTextColor={colors.textSubtle}
          value={zipCode}
          onChangeText={setZipCode}
        />
      </View>

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <TouchableOpacity
        style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.submitButtonText}>Save Billing Address</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      padding: 20,
      paddingBottom: 40,
    },
    intro: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      lineHeight: 19,
      marginBottom: 20,
    },
    field: {
      marginBottom: 16,
    },
    label: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textPrimary,
      marginBottom: 6,
    },
    input: {
      fontFamily: FONTS.regular,
      backgroundColor: colors.surface,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.textPrimary,
    },
    errorText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.error,
      marginBottom: 16,
      textAlign: 'center',
    },
    submitButton: {
      backgroundColor: colors.teal,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 4,
    },
    submitButtonDisabled: {
      opacity: 0.7,
    },
    submitButtonText: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
      fontSize: 16,
    },
  });
}
