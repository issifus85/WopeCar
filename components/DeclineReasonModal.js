import { useState, useMemo, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';

const DECLINE_REASONS = [
  'Car unavailable for these dates',
  'Vehicle undergoing maintenance',
  'Pricing or payment concern',
  'Other',
];

// Combines OptionPickerModal's selectable bottom-sheet list with
// ConfirmModal's destructive-confirm footer - decline needs a reason
// selected before it can be confirmed, unlike a plain single/double-button
// dialog either of those components support on their own.
export default function DeclineReasonModal({ visible, onCancel, onConfirm }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [reason, setReason] = useState(null);

  useEffect(() => {
    if (visible) setReason(null);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Decline Booking</Text>
          <Text style={styles.message}>Let the renter know why this request can't be accepted.</Text>

          {DECLINE_REASONS.map((option) => {
            const isSelected = option === reason;
            return (
              <TouchableOpacity key={option} style={styles.option} onPress={() => setReason(option)}>
                <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{option}</Text>
                {isSelected && <Ionicons name="checkmark" size={20} color={colors.teal} />}
              </TouchableOpacity>
            );
          })}

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmButton, !reason && styles.confirmButtonDisabled]}
              onPress={() => reason && onConfirm(reason)}
              disabled={!reason}
            >
              <Text style={styles.confirmButtonText}>Decline</Text>
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
      marginBottom: 6,
    },
    message: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textMuted,
      lineHeight: 19,
      marginBottom: 12,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 13,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    optionText: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textPrimary,
      flexShrink: 1,
      paddingRight: 8,
    },
    optionTextSelected: {
      fontFamily: FONTS.semiBold,
      color: colors.teal,
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 20,
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
    confirmButton: {
      flex: 1,
      borderRadius: 10,
      paddingVertical: 13,
      alignItems: 'center',
      backgroundColor: colors.error,
    },
    confirmButtonDisabled: {
      backgroundColor: colors.disabled,
    },
    confirmButtonText: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
      fontSize: 14,
    },
  });
}
