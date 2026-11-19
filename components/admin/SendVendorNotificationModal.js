import { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
  Keyboard,
  Platform,
} from 'react-native';
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

  // Keyboard height, used as bottom padding on the backdrop so the sheet is
  // laid out in the space ABOVE the keyboard. We measure it ourselves rather
  // than relying on a KeyboardAvoidingView: on Android the app runs
  // edge-to-edge (app.json edgeToEdgeEnabled + softwareKeyboardLayoutMode
  // "pan"), so the Modal window is never resized for the keyboard and RN's
  // KeyboardAvoidingView 'height' behaviour gets nothing to work with. That is
  // why the Message box and buttons ended up hidden behind the keyboard.
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // Android fallback: if a device ever fails to report a keyboard height,
  // pin the sheet to the top of the screen while a field is focused so the
  // fields and buttons still sit above the keyboard.
  const [inputFocused, setInputFocused] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e?.endCoordinates?.height || 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (visible) {
      setTitle('');
      setBody('');
    } else {
      setKeyboardHeight(0);
      setInputFocused(false);
    }
  }, [visible]);

  const isValid = title.trim() !== '' && body.trim() !== '';

  // Same Android Modal/keyboard-dismiss race as components/LocationSearchModal.js:
  // dismiss the keyboard before the parent flips `visible`.
  const handleCancel = () => {
    Keyboard.dismiss();
    onCancel?.();
  };

  const handleSubmit = () => {
    Keyboard.dismiss();
    onSubmit({ title: title.trim(), body: body.trim() });
  };

  const pinToTop = Platform.OS === 'android' && inputFocused && keyboardHeight === 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <Pressable
        style={[
          styles.backdrop,
          keyboardHeight > 0 && { paddingBottom: keyboardHeight + 12 },
          pinToTop && styles.backdropTop,
        ]}
        onPress={handleCancel}
      >
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={styles.sheetContent}
          >
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
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              maxLength={80}
            />

            <Text style={styles.label}>Message</Text>
            <TextInput
              style={[styles.input, styles.bodyInput]}
              placeholder="What do you want this vendor to know?"
              placeholderTextColor={colors.textSubtle}
              value={body}
              onChangeText={setBody}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              multiline
              numberOfLines={4}
            />

            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelButton} onPress={handleCancel}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, (!isValid || isSaving) && styles.submitButtonDisabled]}
                disabled={!isValid || isSaving}
                onPress={handleSubmit}
              >
                <Text style={styles.submitButtonText}>{isSaving ? 'Sending…' : 'Send'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
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
    backdropTop: {
      justifyContent: 'flex-start',
      paddingTop: 56,
    },
    sheet: {
      width: '100%',
      maxWidth: 380,
      // Lets the sheet shrink to the space left above the keyboard; the
      // ScrollView inside then scrolls instead of anything being cut off.
      maxHeight: '100%',
      flexShrink: 1,
      backgroundColor: colors.surface,
      borderRadius: 16,
      overflow: 'hidden',
    },
    sheetContent: {
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
      maxHeight: 160,
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
