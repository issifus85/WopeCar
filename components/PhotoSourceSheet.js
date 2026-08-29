import { StyleSheet, Text, View, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';

// Deliberately not RN's <Modal> - dismissing one in the same gesture that
// then presents the camera/library picker races that picker's own native
// presentation (confirmed broken on-device: neither camera nor library
// opened). A plain absolutely-positioned overlay has no such transition to
// race - this is account.js's original avatar-photo-source sheet, promoted
// to a shared component so every "take a photo or pick from library" spot
// in the app (identity documents, vendor documents, avatar) uses the same
// working pattern instead of re-implementing it.
export default function PhotoSourceSheet({ visible, title = 'Add a Photo', onClose, onChooseCamera, onChooseLibrary }) {
  const { colors } = useAppTheme();
  if (!visible) return null;
  const styles = createStyles(colors);

  return (
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
      <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.title}>{title}</Text>

        <TouchableOpacity style={styles.optionButton} onPress={onChooseCamera}>
          <Ionicons name="camera-outline" size={18} color={colors.textPrimary} />
          <Text style={styles.optionButtonText}>Take Photo</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.optionButton, styles.optionButtonPrimary]} onPress={onChooseLibrary}>
          <Ionicons name="images-outline" size={18} color={colors.white} />
          <Text style={styles.optionButtonTextPrimary}>Choose from Library</Text>
        </TouchableOpacity>
      </Pressable>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
      zIndex: 10,
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
    title: {
      fontFamily: FONTS.bold,
      fontSize: 18,
      color: colors.textPrimary,
      textAlign: 'center',
      marginTop: -8,
      marginBottom: 20,
    },
    optionButton: {
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
    optionButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 15,
      color: colors.textPrimary,
    },
    optionButtonPrimary: {
      borderWidth: 0,
      backgroundColor: colors.teal,
      marginBottom: 0,
    },
    optionButtonTextPrimary: {
      fontFamily: FONTS.semiBold,
      fontSize: 15,
      color: colors.white,
    },
  });
}
