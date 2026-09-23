import { useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal, Pressable } from 'react-native';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';

// Alert.alert() doesn't render any UI on React Native Web, so anything that
// needs a confirm dialog to actually work on web (and to look consistent
// with the rest of the app) uses this instead.
export default function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Pass cancelLabel={null} for a single-button info dialog (e.g. "Coming soon").
  const singleAction = cancelLabel === null;
  // Side-by-side flex:1 buttons only look clean when both labels fit on one
  // line - a longer pair (e.g. "Continue Without WopeCare") wraps unevenly
  // on the wider label while the shorter one sits mostly empty, which reads
  // as a layout bug. Stack full-width instead once either label is long -
  // every other call site in the app uses short labels (Cancel/Confirm,
  // Continue/Change Dates, etc.) so this only changes this specific pairing.
  const stackButtons = !singleAction && (confirmLabel.length > 20 || cancelLabel.length > 20);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.message}>{message}</Text>}
          <View style={[styles.actions, stackButtons && styles.actionsStacked]}>
            {!singleAction && (
              <TouchableOpacity
                style={[styles.cancelButton, stackButtons && styles.actionStackedButton]}
                onPress={onCancel}
              >
                <Text style={styles.cancelButtonText}>{cancelLabel}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.confirmButton, destructive && styles.confirmButtonDestructive, stackButtons && styles.actionStackedButton]}
              onPress={onConfirm}
            >
              <Text style={styles.confirmButtonText}>{confirmLabel}</Text>
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
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 20,
    },
    title: {
      fontFamily: FONTS.bold,
      fontSize: 17,
      color: colors.textPrimary,
      marginBottom: 8,
    },
    message: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textMuted,
      lineHeight: 20,
      marginBottom: 20,
    },
    actions: {
      flexDirection: 'row',
      gap: 10,
    },
    actionsStacked: {
      flexDirection: 'column',
    },
    actionStackedButton: {
      flex: undefined,
      width: '100%',
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
      backgroundColor: colors.teal,
    },
    confirmButtonDestructive: {
      backgroundColor: colors.error,
    },
    confirmButtonText: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
      fontSize: 14,
    },
  });
}
