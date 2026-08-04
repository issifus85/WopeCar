import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Modal, Pressable } from 'react-native';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';

// Amount + optional note, sent to adminVendorsApi.recordVendorPayout(). Same
// sheet-modal shape as ReasonModal/ConfirmModal, just with a second field.
export default function RecordPayoutModal({ visible, vendor, onCancel, onSubmit, isSaving }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (visible) {
      setAmount('');
      setNote('');
    }
  }, [visible]);

  const parsedAmount = Number(amount);
  const isValid = amount.trim() !== '' && Number.isFinite(parsedAmount) && parsedAmount > 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Record Payout</Text>
          <Text style={styles.subtitle}>
            Logs a payout for {vendor?.business_name || 'this vendor'} and emails them a confirmation. This doesn't move any money - record it after sending the transfer yourself.
          </Text>

          <Text style={styles.label}>Amount (GHS)</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            placeholderTextColor={colors.textSubtle}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Note (optional)</Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            placeholder="e.g. September payout, ref #..."
            placeholderTextColor={colors.textSubtle}
            value={note}
            onChangeText={setNote}
            multiline
            numberOfLines={2}
          />

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitButton, (!isValid || isSaving) && styles.submitButtonDisabled]}
              disabled={!isValid || isSaving}
              onPress={() => onSubmit({ amount: parsedAmount, note: note.trim() })}
            >
              <Text style={styles.submitButtonText}>{isSaving ? 'Recording…' : 'Record Payout'}</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    sheet: {
      width: '100%',
      maxWidth: 380,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
    },
    title: {
      fontFamily: FONTS.bold,
      fontSize: 17,
      color: colors.textPrimary,
      marginBottom: 4,
    },
    subtitle: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginBottom: 16,
      lineHeight: 17,
    },
    label: {
      fontFamily: FONTS.semiBold,
      fontSize: 12,
      color: colors.textPrimary,
      marginBottom: 6,
    },
    input: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textPrimary,
      backgroundColor: colors.background,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      marginBottom: 14,
    },
    noteInput: {
      minHeight: 60,
      textAlignVertical: 'top',
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
    },
    cancelButton: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 13,
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    cancelButtonText: {
      fontFamily: FONTS.semiBold,
      color: colors.textMuted,
      fontSize: 14,
    },
    submitButton: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 13,
      alignItems: 'center',
      backgroundColor: colors.teal,
    },
    submitButtonDisabled: {
      opacity: 0.5,
    },
    submitButtonText: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
      fontSize: 14,
    },
  });
}
