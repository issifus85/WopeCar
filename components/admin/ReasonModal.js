import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Modal, Pressable } from 'react-native';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';

// Shared "type a reason, it gets sent to the affected user" modal - reused
// by Vendor rejection, Car rejection, and Booking cancellation, all of
// which require a reason per spec rather than a bare confirm.
export default function ReasonModal({
  visible,
  title,
  subtitle = 'This reason is sent to the affected user.',
  placeholder = 'Reason...',
  submitLabel = 'Submit',
  onCancel,
  onSubmit,
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [reason, setReason] = useState('');

  useEffect(() => { if (visible) setReason(''); }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
          <TextInput
            style={styles.input}
            placeholder={placeholder}
            placeholderTextColor={colors.textSubtle}
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={3}
          />
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitButton, !reason.trim() && styles.submitButtonDisabled]}
              disabled={!reason.trim()}
              onPress={() => onSubmit(reason.trim())}
            >
              <Text style={styles.submitButtonText}>{submitLabel}</Text>
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
      marginBottom: 14,
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
      minHeight: 80,
      textAlignVertical: 'top',
      marginBottom: 16,
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
      backgroundColor: colors.error,
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
