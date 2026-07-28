import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useInspection } from '../../../contexts/InspectionContext';
import { useVendor } from '../../../contexts/VendorContext';
import InspectionHeader from '../../../components/InspectionHeader';
import CheckoutFooterButton from '../../../components/CheckoutFooterButton';
import SignaturePad from '../../../components/SignaturePad';
import ConfirmModal from '../../../components/ConfirmModal';

const MODES = [
  { key: 'draw', label: 'Signature' },
  { key: 'initials', label: 'Initials' },
];

function SignatureSlot({ label, value, mode, onModeChange, padRef, onOK, onEmpty, onBegin, onEnd, onEdit, styles }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{label}</Text>
        {!!value && (
          <TouchableOpacity onPress={onEdit}>
            <Text style={styles.clearLink}>Edit</Text>
          </TouchableOpacity>
        )}
      </View>

      {!value && (
        <View style={styles.modeToggle}>
          {MODES.map((m) => (
            <TouchableOpacity
              key={m.key}
              style={[styles.modeButton, mode === m.key && styles.modeButtonActive]}
              onPress={() => onModeChange(m.key)}
            >
              <Text style={[styles.modeButtonText, mode === m.key && styles.modeButtonTextActive]}>{m.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View pointerEvents={value ? 'none' : 'auto'}>
        <SignaturePad key={mode} ref={padRef} mode={mode} onOK={onOK} onEmpty={onEmpty} onBegin={onBegin} onEnd={onEnd} />
      </View>

      {!value && (
        <TouchableOpacity style={styles.confirmButton} onPress={() => padRef.current?.readSignature()}>
          <Text style={styles.confirmButtonText}>Confirm {mode === 'initials' ? 'Initials' : 'Signature'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// Vendor Mode variant of app/inspection/signatures.js. The renter-side
// version's final submit hits the real inspection API (generates a signed
// PDF, emails it) - that endpoint is hard-restricted to the booking's
// renter and Vendor Mode's bookings have no real server id to call it with
// anyway (see mileage.js's header comment). Submitting here instead writes
// the full checklist snapshot straight into VendorContext via
// submitVendorInspection, matching how every other Vendor Mode action
// (addCar, respondToBookingRequest, etc.) already persists locally.
export default function VendorInspectionSignaturesScreen() {
  const { bookingId, type } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { draft, updateDraft, resetInspection } = useInspection();
  const { submitVendorInspection } = useVendor();
  const renterPadRef = useRef(null);
  const agentPadRef = useRef(null);
  const [renterMode, setRenterMode] = useState('draw');
  const [agentMode, setAgentMode] = useState('draw');
  const [scrollLocked, setScrollLocked] = useState(false);
  const [showSubmitted, setShowSubmitted] = useState(false);

  const handleRenterOK = (dataUri) => updateDraft({ signatures: { ...draft.signatures, renter: dataUri } });
  const handleAgentOK = (dataUri) => updateDraft({ signatures: { ...draft.signatures, agent: dataUri } });

  const editRenter = () => {
    renterPadRef.current?.clearSignature();
    updateDraft({ signatures: { ...draft.signatures, renter: null } });
  };
  const editAgent = () => {
    agentPadRef.current?.clearSignature();
    updateDraft({ signatures: { ...draft.signatures, agent: null } });
  };

  const canSubmit = !!draft.signatures.renter && !!draft.signatures.agent;

  const handleSubmit = () => {
    submitVendorInspection(bookingId, type, {
      mileage: draft.mileage,
      fuelLevel: draft.fuelLevel,
      checklist: draft.checklist,
      damagePoints: draft.damagePoints,
      photos: draft.photos,
      photoMeta: draft.photoMeta ?? {},
      signatures: draft.signatures,
    });
    setShowSubmitted(true);
  };

  const handleDone = () => {
    resetInspection();
    router.dismissTo('/vendor/inspections');
  };

  return (
    <View style={styles.container}>
      <InspectionHeader title="Signatures" step={5} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} scrollEnabled={!scrollLocked}>
        <Text style={styles.hint}>Both the renter and you (or your agent) sign below to confirm this report.</Text>

        <SignatureSlot
          label="Renter Signature"
          value={draft.signatures.renter}
          mode={renterMode}
          onModeChange={setRenterMode}
          padRef={renterPadRef}
          onOK={handleRenterOK}
          onEmpty={() => {}}
          onBegin={() => setScrollLocked(true)}
          onEnd={() => setScrollLocked(false)}
          onEdit={editRenter}
          styles={styles}
        />

        <SignatureSlot
          label="Host / Agent Signature"
          value={draft.signatures.agent}
          mode={agentMode}
          onModeChange={setAgentMode}
          padRef={agentPadRef}
          onOK={handleAgentOK}
          onEmpty={() => {}}
          onBegin={() => setScrollLocked(true)}
          onEnd={() => setScrollLocked(false)}
          onEdit={editAgent}
          styles={styles}
        />
      </ScrollView>

      <CheckoutFooterButton label="Submit Inspection" onPress={handleSubmit} disabled={!canSubmit} />

      <ConfirmModal
        visible={showSubmitted}
        title="Inspection Submitted"
        message="The checklist has been saved to this booking's inspection record."
        confirmLabel="Done"
        cancelLabel={null}
        onConfirm={handleDone}
        onCancel={handleDone}
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    hint: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      marginBottom: 16,
    },
    section: {
      marginBottom: 24,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    sectionTitle: {
      fontFamily: FONTS.bold,
      fontSize: 15,
      color: colors.textPrimary,
    },
    clearLink: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.teal,
    },
    modeToggle: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 10,
    },
    modeButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 8,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modeButtonActive: {
      backgroundColor: colors.teal,
      borderColor: colors.teal,
    },
    modeButtonText: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.textMuted,
    },
    modeButtonTextActive: {
      fontFamily: FONTS.semiBold,
      color: colors.white,
    },
    confirmButton: {
      marginTop: 10,
      alignSelf: 'flex-start',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.teal,
    },
    confirmButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.teal,
    },
  });
}
