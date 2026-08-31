import { useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';

export default function BookingChoiceModal({ visible, onClose, onInquiry, onContinue }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>Ready to Rent</Text>
          <Text style={styles.subtitle}>Choose how you want to proceed</Text>

          <TouchableOpacity style={styles.inquiryButton} onPress={onInquiry}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.textPrimary} />
            <Text style={styles.inquiryButtonText}>Inquiry</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.continueButton} onPress={onContinue}>
            <Text style={styles.continueButtonText}>Add to Cart</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.white} />
          </TouchableOpacity>
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
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 20,
      paddingBottom: 30,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    closeButton: {
      marginTop: -4,
    },
    title: {
      fontFamily: FONTS.bold,
      fontSize: 20,
      color: colors.textPrimary,
      textAlign: 'center',
    },
    subtitle: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textSubtle,
      textAlign: 'center',
      marginTop: 4,
      marginBottom: 24,
    },
    inquiryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 12,
      paddingVertical: 15,
      marginBottom: 12,
    },
    inquiryButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 15,
      color: colors.textPrimary,
    },
    continueButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.teal,
      borderRadius: 12,
      paddingVertical: 15,
    },
    continueButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 15,
      color: colors.white,
    },
  });
}
