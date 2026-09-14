import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Modal, Pressable } from 'react-native';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';

// Title + body, sent to adminVendorsApi.sendVendorNotification() as an
// in-app notification (+ push) to this one vendor. Same sheet-modal shape
// as RecordPayoutModal, just with two text fields instead of amount+note.
export default function SendVendorNotificationModal({ visible, vendor, onCancel, onSubmit, isSaving }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => {
    if (visible) {
      setTitle('');
      setBody('');
    }
  }, [visible]);

  const isValid = title.trim() !== '' && body.trim() !== '';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Notify Vendor</Text>
          <Text style={styles.subtitle}>
            Sends {vendor?.business_name || 'this vendor'} an in-app notification and a push alert right away.
          </Text>

          <Text style={styles.label}>Title</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Update your documents"
            placeholderTextColor={colors.textSubtle}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
          />

          <Text style={styles.label}>Message</Text>
          <TextInput
            style={[styles.input, styles.bodyInput]}
            placeholder="What do you want this vendor to know?"
            placeholderTextColor={colors.textSubtle}
            value={body}
            onChangeText={setBody}
            multiline
            numberOfLines={4}
          />

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitButton, (!isValid || isSaving) && styles.submitButtonDisabled]}
              disabled={!isValid || isSaving}
              onPress={() => onSubmit({ title: title.trim(), body: body.trim() })}
            >
              <Text style={styles.submitButtonText}>{isSaving ? 'Sending…' : 'Send'}</Text>
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
    bodyInput: {
      minHeight: 90,
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
