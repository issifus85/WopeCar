import { useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';

// Text mirrors resources/views/pdf/rental-agreement.blade.php's "2. The
// Lessor's Obligations" / "3. The Lessee's Obligations" sections exactly -
// this is a read-only reference so a lessee can review the terms before
// signing, not a second source of truth for the contract language.
const LESSOR_OBLIGATIONS = [
  'To grant the Lessee exclusive use and possession of the motor vehicle during the duration of this agreement, save as is provided for by the agreement;',
  'To grant the Lessee quiet possession of the motor vehicle, strictly self-driven;',
  'To keep the motor vehicle comprehensively insured with a reputable insurance company throughout the duration of this agreement;',
  'To provide the Lessee with the roadworthy document and sticker of the motor vehicle.',
];

const LESSEE_OBLIGATIONS_BASE = [
  'To ensure that the motor vehicle is used in a skillful and proper manner and only driven by the company driver;',
  'To be responsible for costs relating to fuel;',
  'To ensure the motor vehicle is not used for any fraudulent or criminal activity - if so used, the Lessee is solely responsible and liable by law during the period of rent;',
  'To ensure that the motor vehicle is not used for commercial reasons;',
];

const LESSEE_OBLIGATIONS_REST = [
  'To return the vehicle to the Lessor in good mechanical condition on expiration of the contract, in the same condition as was given - the Lessee must first contact the Lessor before making any changes to the car;',
  'The rate per day will increase if the Lessee decides to reduce the number of days instead of the initial duration agreed upon, or goes beyond destinations stated in this contract;',
  'The vehicle will be repaired by the Lessee in case of any damage caused by the Lessee.',
];

function ObligationsList({ items, styles }) {
  return items.map((text, index) => (
    <View key={index} style={styles.itemRow}>
      <Text style={styles.itemIndex}>{index + 1}.</Text>
      <Text style={styles.itemText}>{text}</Text>
    </View>
  ));
}

export default function ObligationsModal({ visible, onClose, ghanaOnlyUse = true }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const ghanaClause = `To ensure that the motor vehicle is only used within Ghana ${ghanaOnlyUse ? '(agreed)' : '(not agreed - see note below)'};`;
  const lesseeObligations = [
    ...LESSEE_OBLIGATIONS_BASE,
    ghanaClause,
    ...LESSEE_OBLIGATIONS_REST,
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Both Party Obligations</Text>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            <Text style={styles.sectionTitle}>The Lessor's Obligations</Text>
            <Text style={styles.sectionIntro}>The Lessor hereby agrees:</Text>
            <ObligationsList items={LESSOR_OBLIGATIONS} styles={styles} />

            <Text style={[styles.sectionTitle, styles.sectionTitleSpaced]}>The Lessee's Obligations</Text>
            <Text style={styles.sectionIntro}>The Lessee hereby agrees:</Text>
            <ObligationsList items={lesseeObligations} styles={styles} />
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
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 20,
      paddingHorizontal: 20,
      // Bounded height so the ScrollView below has something definite to
      // flex against - without this, `body`'s flexGrow/flexShrink has
      // nothing to shrink relative to and the sheet just grows to fit all
      // the content instead of scrolling it.
      maxHeight: '85%',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    headerTitle: {
      fontFamily: FONTS.bold,
      fontSize: 18,
      color: colors.textPrimary,
    },
    body: {
      // flexGrow/flexShrink (not a fixed maxHeight) - takes exactly the
      // space left over after the header within sheet's bounded maxHeight,
      // so it reliably becomes the scrollable region regardless of how
      // tall the device viewport is.
      flexGrow: 0,
      flexShrink: 1,
    },
    bodyContent: {
      paddingBottom: 30,
    },
    sectionTitle: {
      fontFamily: FONTS.bold,
      fontSize: 15,
      color: colors.textPrimary,
    },
    sectionTitleSpaced: {
      marginTop: 20,
    },
    sectionIntro: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      marginTop: 4,
      marginBottom: 10,
    },
    itemRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 10,
    },
    itemIndex: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.teal,
      width: 18,
    },
    itemText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textPrimary,
      lineHeight: 19,
    },
  });
}
