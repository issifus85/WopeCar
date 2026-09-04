import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import ConfirmModal from '../../components/ConfirmModal';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { deleteAccount } = useAuth();

  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDelete = async () => {
    setShowConfirm(false);
    setError(null);
    setIsSubmitting(true);
    try {
      await deleteAccount(password);
      router.replace('/login');
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.warningBox}>
        <Ionicons name="warning-outline" size={22} color={colors.error} />
        <Text style={styles.warningText}>
          Deleting your account is permanent. Your profile, bookings, and preferences will be removed and you'll be signed out on every device. This cannot be undone.
        </Text>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Enter your password to confirm</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor={colors.textSubtle}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
      </View>

      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <TouchableOpacity
        style={[styles.deleteButton, (isSubmitting || !password) && styles.deleteButtonDisabled]}
        onPress={() => setShowConfirm(true)}
        disabled={isSubmitting || !password}
      >
        {isSubmitting ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.deleteButtonText}>Delete My Account</Text>
        )}
      </TouchableOpacity>

      <ConfirmModal
        visible={showConfirm}
        title="Delete Account"
        message={
          'Are you sure you want to permanently delete your WopeCar account?\n\n' +
          'This will delete:\n' +
          '• Your profile and personal data\n' +
          '• Your booking history\n' +
          '• Your saved cars and favourites\n\n' +
          'This action cannot be undone.'
        }
        confirmLabel="Delete My Account"
        destructive
        onConfirm={handleDelete}
        onCancel={() => setShowConfirm(false)}
      />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    flex: {
      flex: 1,
    },
    content: {
      padding: 20,
      paddingBottom: 40,
    },
    warningBox: {
      flexDirection: 'row',
      gap: 10,
      backgroundColor: colors.errorBg,
      borderRadius: 12,
      padding: 14,
      marginBottom: 24,
    },
    warningText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.error,
      lineHeight: 19,
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
    deleteButton: {
      backgroundColor: colors.error,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center',
      marginTop: 4,
    },
    deleteButtonDisabled: {
      opacity: 0.5,
    },
    deleteButtonText: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
      fontSize: 16,
    },
  });
}
