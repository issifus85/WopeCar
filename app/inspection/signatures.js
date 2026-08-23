import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useInspection } from '../../contexts/InspectionContext';
import { syncInspection, uploadInspectionSignature, submitInspection, generateInspectionReport } from '../../services/inspectionsApi';
import InspectionHeader from '../../components/InspectionHeader';
import CheckoutFooterButton from '../../components/CheckoutFooterButton';
import SignaturePad from '../../components/SignaturePad';

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

      {/* Locks the pad once a mark has been confirmed - a stray touch can no
          longer alter it silently; Edit above clears it and re-enables
          input rather than leaving two separate ways to change the same
          value out of sync with each other. */}
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

export default function InspectionSignaturesScreen() {
  const { bookingId, localId, type } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { draft, updateDraft, resetInspection } = useInspection();
  const renterPadRef = useRef(null);
  const agentPadRef = useRef(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [renterMode, setRenterMode] = useState('draw');
  const [agentMode, setAgentMode] = useState('draw');
  // Drawing on the pad is a drag gesture identical to a scroll gesture as far
  // as the surrounding ScrollView's responder is concerned - without this it
  // fights the pad for the touch and the whole screen drifts mid-signature.
  // Locked to whichever pad reports it's actively being drawn on.
  const [scrollLocked, setScrollLocked] = useState(false);

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

  const ensureServerId = async () => {
    if (draft.serverId) return draft.serverId;
    try {
      const inspection = await syncInspection(bookingId, {
        type,
        mileage: draft.mileage,
        fuelLevel: draft.fuelLevel,
        checklist: draft.checklist,
        damagePoints: draft.damagePoints,
      });
      updateDraft({ serverId: inspection.id, pendingSync: false });
      return inspection.id;
    } catch (e) {
      return null;
    }
  };

  const canSubmit = !!draft.signatures.renter && !!draft.signatures.agent;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const inspectionId = await ensureServerId();
      if (!inspectionId) {
        Alert.alert('You appear to be offline', 'Your signatures are saved on this device - reconnect and try Submit again.');
        updateDraft({ pendingSync: true });
        return;
      }

      await uploadInspectionSignature(inspectionId, 'renter', draft.signatures.renter);
      await uploadInspectionSignature(inspectionId, 'agent', draft.signatures.agent);

      await submitInspection(inspectionId);
      updateDraft({ pendingSync: false });

      // Best-effort - the inspection is already submitted and viewable
      // in-app either way. A PDF-generation hiccup must never block the
      // confirmation the user already earned by completing the wizard.
      generateInspectionReport(inspectionId).catch(() => {});

      Alert.alert(
        'Inspection Submitted',
        'The inspection report has been saved and is available in Documents.',
        [
          { text: 'View Report', onPress: () => router.push({ pathname: '/inspection/report', params: { bookingId, type } }) },
          {
            text: 'Done',
            onPress: () => {
              resetInspection();
              // dismissTo (not push) - the wizard is 5 screens deep on top
              // of the Booking Detail screen that launched it; push would
              // stack a *second* Booking Detail instance on top of all of
              // that instead of returning to the original one, leaving the
              // back button/swipe gesture pointing into a duplicated stack.
              router.dismissTo(`/booking/${localId}`);
            },
          },
        ]
      );
    } catch (e) {
      updateDraft({ pendingSync: true });
      Alert.alert('Could not submit inspection', e?.message || 'Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <InspectionHeader title="Signatures" step={5} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} scrollEnabled={!scrollLocked}>
        <Text style={styles.hint}>Both the renter and the WopeCar agent sign below to confirm this report.</Text>

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

      <CheckoutFooterButton
        label={isSubmitting ? 'Submitting...' : 'Submit Inspection'}
        onPress={handleSubmit}
        disabled={!canSubmit || isSubmitting}
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
