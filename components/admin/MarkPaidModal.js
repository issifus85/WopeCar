import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, Modal, Pressable, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { formatCurrency } from '../../constants/pricing';

export const MANUAL_PAYMENT_METHODS = [
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'cash', label: 'Cash' },
  { value: 'paystack_dashboard', label: 'Paystack (seen in dashboard)' },
  { value: 'other', label: 'Other' },
];

// "Mark as Paid" asks for the proof - how the money arrived plus a reference (or a note) - and the database records who did it. Payments made
// on Paystack through the app/website are recorded automatically; this is only for money received some other way.
export default function MarkPaidModal({ visible, bookingRef, amount, onCancel, onSubmit }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [method, setMethod] = useState('bank_transfer');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (visible) { setMethod('bank_transfer'); setReference(''); setNote(''); }
  }, [visible]);

  const hasProof = reference.trim().length > 0 || note.trim().length >= 10;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.backdrop} onPress={onCancel}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.title}>Mark {bookingRef} as paid?</Text>
              <Text style={styles.subtitle}>
                Only do this once you have seen the money{amount != null ? ` (${formatCurrency(amount)})` : ''}. Payments made on Paystack in the app or website are recorded
                automatically. Your name is saved with this entry and the renter and vendor are told the payment was received.
              </Text>

              <Text style={styles.label}>How was it received?</Text>
              <View style={styles.chips}>
                {MANUAL_PAYMENT_METHODS.map((m) => (
                  <TouchableOpacity key={m.value} style={[styles.chip, method === m.value && styles.chipActive]} onPress={() => setMethod(m.value)}>
                    <Text style={[styles.chipText, method === m.value && styles.chipTextActive]}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Payment reference</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. bank transaction ID or Paystack reference"
                placeholderTextColor={colors.textSubtle}
                value={reference}
                onChangeText={setReference}
                autoCapitalize="none"
              />

              <Text style={styles.label}>Note {reference.trim() ? '(optional)' : '(required if there is no reference)'}</Text>
              <TextInput
                style={[styles.input, styles.noteInput]}
                placeholder="e.g. Cash received at the office, confirmed by Ama"
                placeholderTextColor={colors.textSubtle}
                value={note}
                onChangeText={setNote}
                multiline
              />

              <View style={styles.actions}>
                <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.submitButton, !hasProof && styles.submitButtonDisabled]}
                  disabled={!hasProof}
                  onPress={() => onSubmit({ method, reference: reference.trim(), note: note.trim() })}
                >
                  <Text style={styles.submitButtonText}>Mark as Paid</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    sheet: { width: '100%', maxWidth: 400, maxHeight: '90%', backgroundColor: colors.surface, borderRadius: 16, padding: 20 },
    title: { fontFamily: FONTS.bold, fontSize: 17, color: colors.textPrimary, marginBottom: 6 },
    subtitle: { fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 18, color: colors.textSubtle, marginBottom: 14 },
    label: { fontFamily: FONTS.semiBold, fontSize: 12.5, color: colors.textPrimary, marginBottom: 6 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
    chip: { borderRadius: 100, borderWidth: 1.5, borderColor: colors.border, paddingVertical: 7, paddingHorizontal: 12 },
    chipActive: { backgroundColor: colors.teal, borderColor: colors.teal },
    chipText: { fontFamily: FONTS.semiBold, fontSize: 12.5, color: colors.textMuted },
    chipTextActive: { color: colors.white },
    input: {
      fontFamily: FONTS.regular, fontSize: 14, color: colors.textPrimary, backgroundColor: colors.background,
      borderRadius: 10, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 14,
    },
    noteInput: { minHeight: 70, textAlignVertical: 'top' },
    actions: { flexDirection: 'row', gap: 10, marginTop: 2 },
    cancelButton: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border },
    cancelButtonText: { fontFamily: FONTS.semiBold, color: colors.textMuted, fontSize: 14 },
    submitButton: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', backgroundColor: colors.teal },
    submitButtonDisabled: { opacity: 0.5 },
    submitButtonText: { fontFamily: FONTS.semiBold, color: colors.white, fontSize: 14 },
  });
}
