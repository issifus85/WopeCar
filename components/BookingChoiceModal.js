import { StyleSheet, Text, View, TouchableOpacity, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../constants/theme';

export default function BookingChoiceModal({ visible, onClose, onInquiry, onContinue }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={COLORS.navy} />
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>Ready to Rent</Text>
          <Text style={styles.subtitle}>Choose how you want to proceed</Text>

          <TouchableOpacity style={styles.inquiryButton} onPress={onInquiry}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={COLORS.navy} />
            <Text style={styles.inquiryButtonText}>Inquiry</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.continueButton} onPress={onContinue}>
            <Text style={styles.continueButtonText}>Continue</Text>
            <Ionicons name="arrow-forward" size={18} color="#ffffff" />
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
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
    color: COLORS.navy,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: '#888',
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
    borderColor: '#ddd',
    borderRadius: 12,
    paddingVertical: 15,
    marginBottom: 12,
  },
  inquiryButtonText: {
    fontFamily: FONTS.semiBold,
    fontSize: 15,
    color: COLORS.navy,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.teal,
    borderRadius: 12,
    paddingVertical: 15,
  },
  continueButtonText: {
    fontFamily: FONTS.semiBold,
    fontSize: 15,
    color: '#ffffff',
  },
});
