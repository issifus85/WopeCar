import { StyleSheet, Text, View, TouchableOpacity, Modal, Pressable } from 'react-native';
import { COLORS, FONTS } from '../constants/theme';

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
  // Pass cancelLabel={null} for a single-button info dialog (e.g. "Coming soon").
  const singleAction = cancelLabel === null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>
          {!!message && <Text style={styles.message}>{message}</Text>}
          <View style={styles.actions}>
            {!singleAction && (
              <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
                <Text style={styles.cancelButtonText}>{cancelLabel}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.confirmButton, destructive && styles.confirmButtonDestructive]}
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

const styles = StyleSheet.create({
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
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 17,
    color: COLORS.navy,
    marginBottom: 8,
  },
  message: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 20,
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
    borderColor: '#e5e5e5',
  },
  cancelButtonText: {
    fontFamily: FONTS.semiBold,
    color: '#666',
    fontSize: 14,
  },
  confirmButton: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: COLORS.teal,
  },
  confirmButtonDestructive: {
    backgroundColor: '#C62828',
  },
  confirmButtonText: {
    fontFamily: FONTS.semiBold,
    color: '#ffffff',
    fontSize: 14,
  },
});
