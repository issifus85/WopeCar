import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useVendor } from '../../contexts/VendorContext';
import VendorHeader from '../../components/VendorHeader';
import RichBody from '../../components/RichBody';
import SignaturePad from '../../components/SignaturePad';

const SIGNATURE_MODES = [
  { key: 'draw', label: 'Signature' },
  { key: 'initials', label: 'Initials' },
];

// The real Car Leasing Agreement between ACRE Logistics Ltd (WopeCar Group,
// "the Lessee") and the vehicle-owning Partner ("the Lessor") - replaces the
// old placeholder text (a verbatim excerpt of app/terms.js's general
// "Specific Terms for Partners" ToS section) with WopeCar's actual signed
// vendor contract, per the corrected version supplied 2026-09-07.
//
// This is a read-only informational display, not a signing flow - the
// blank-fill party-identification lines and physical signature blocks from
// the source contract are intentionally omitted here since they don't
// serve any purpose without an actual signing mechanism; the substantive
// clauses (rental terms, obligations, termination, etc.) are reproduced in
// full. The source document's own clause numbering (starting at 4) is kept
// as-is for consistency with the physical contract vendors sign.
const PARTNER_TERMS = `This Car Leasing Agreement is between ACRE Logistics Ltd (WopeCar Group), referred to below as "the Lessee", and you as the vehicle owner, referred to below as "the Lessor". WopeCar is an online car rental platform that partners with car owners and connects them to prospective clients (each such client being an end-user or renter, and not a party to this Agreement). The Lessee agrees with the Lessor to take possession of and manage the Lessor's vehicle for the purpose of leasing it to prospective clients, subject to the terms below.

4. RENTAL

(1) The Vehicle shall be leased to prospective clients at the daily rates specified by WopeCar.

(2) To pay a processing fee of TWO HUNDRED GHANA CEDIS (GHS 200) on each Vehicle.

(3) The Lessee shall be entitled to retain five percent (5%) of the total sales proceeds derived from the rental of the Vehicle, and the balance thereof shall be due and payable to the Lessor. The said five percent (5%) service fee shall constitute consideration for the Lessor's use of the Platform, together with the coordination and other operational support services rendered by the Lessee hereunder.

(4) Payments of the Lessor's earnings will be duly sent via transfer every month.

(5) The Lessee shall, on or before the third working day of each succeeding month, furnish the Lessor with a monthly statement and effect payment by electronic transfer of the net sum thereby shown as payable. The said statement shall particularise all bookings, rental periods, rates charged, total income received, deductions made and the net amount payable to the Lessor. Applicable deductions may include maintenance expenses, any amount duly approved and paid by the Lessee for and on behalf of the Lessor, and such other sums as the parties may from time to time agree in writing to be deductible.

(6) This Agreement shall remain in full force and effect for a term of one (1) year commencing from the date of execution, unless sooner determined in accordance with the provisions herein or extended by mutual written agreement. During the subsistence hereof, the rental rates and pricing mutually approved by the parties shall remain fixed and shall not be revised, varied or increased by either party save with the prior written agreement of both parties.

(7) Where the Lessor elects to place the Vehicle under the management of the Lessee, the Lessor shall pay to the Lessee a management fee of FOUR HUNDRED GHANA CEDIS (GHS 400) per Vehicle, where applicable. This fee covers parking, security, movement and coordination of the Vehicle, and related administrative support. For the avoidance of doubt, the management fee does not constitute consideration for, and does not include, any twenty-four (24) hour vehicle tracking or monitoring service.

5. THE LESSOR'S OBLIGATIONS

(1) To make available the Vehicle during the term specified in Clause 4 unless otherwise expressly provided herein.

(2) To keep the Vehicle commercially comprehensively insured with a reputable insurance company to be mutually agreed with the Lessee during the term of this Agreement.

(3) To furnish the Lessee with all documents requisite for the Vehicle and its operation under this Agreement, including the vehicle registration certificate, a valid roadworthy certificate, a valid insurance certificate, all applicable vehicle stickers, and any other document required under the laws of the Republic of Ghana or reasonably required by the Lessee.

(4) Prior to the delivery of the Vehicle for rental, to duly complete and execute a vehicle condition form disclosing every existing issue, damage, defect or warning pertaining to the Vehicle, including, where applicable, its accident history, scratches, dents, dashboard warnings, sensor faults, mechanical defects, electrical defects and any other known condition or deficiency.

(5) To ensure that the Vehicle is in good condition and repaired prior to delivery.

(6) To notify the Lessee in writing, prior to handing over the Vehicle to any client, of any pre-existing damage, defect, fault or other issue affecting the Vehicle.

(7) To respond to each rental request within twelve (12) to twenty-four (24) hours, subject always to confirmation of payment and the nature and circumstances of the request.

(8) Where the Lessor is unable to provide a replacement vehicle and the Lessee is thereby obliged to procure or arrange an alternative vehicle, any difference in vehicle category or cost may be borne by the Lessor, provided the necessity for such replacement arose from a breakdown, defect or other condition attributable to the Lessor's Vehicle.

(9) To ensure that the client's expectations in respect of refunds, where full services described are not delivered, are met.

(10) The Lessee shall peaceably and quietly have control of the Vehicle during the term hereby granted for the purpose of managing and leasing the Vehicle to prospective clients, subject to the rights of the Lessor as owner of the Vehicle.

(11) Not to have private dealings with clients without the prior written consent of the Lessee, as doing so would result in the termination of this Agreement.

6. THE LESSEE'S OBLIGATIONS

(1) To ensure that the Vehicle is used in a safe and skillful manner and driven by clients who hold valid driver's licenses and who are properly vetted.

(2) To ensure that the inventory of the Vehicle is solely managed in accordance with a leasing agreement between the Lessee and the client.

(3) To ensure that no alterations are made to the Vehicle by the client without the prior written consent of the Lessor, except in cases of emergency.

(4) To ensure that any component removed is replaced within 3 days by the same component, or by one of the same like, make and model, or an improved or advanced version.

(5) To ensure that the client informs the Lessee of any reports made to the Police concerning the Vehicle.

(6) To inform the Lessor within twenty-four (24) hours of any damage to or loss of the Vehicle.

(7) The Lessor shall remain liable for the routine maintenance of the Vehicle, including periodic servicing and ordinary upkeep. Any scratch, dent, accident damage, misuse or other loss caused by a client during a rental shall be dealt with separately from routine maintenance. The client shall bear the cost of fuel consumed during the rental period, provided that routine topping-up of engine oil between services shall be deemed an incident of maintenance and not part of the client's fuel obligation.

(8) Not to use or permit the Vehicle to be used for illegal purposes, and to indemnify the Lessor in respect of any liability incurred as a result of the same.

(9) Not to use or permit the Vehicle to be used for commercial purposes.

(10) To ensure that the client uses the Vehicle strictly within the agreed location and rental terms. Where the client removes the Vehicle beyond the agreed geographical area or otherwise breaches the agreed rental terms, the Lessee may impose the applicable penalty charge, and the client shall be liable for any additional cost, expense, loss or liability occasioned by such breach.

(11) To obtain "Hiring Insurance" from the Lessor in order to promptly and fully repair the Vehicle in cases of accidents.

(12) To pay for the use of the Vehicle by clients at the end of the month.

(13) Not to permit clients to use the Vehicle for more than the stipulated number of days unless different terms are agreed for that particular transaction.

(14) The Lessee may hold a security deposit as security for the cost of rectifying minor scratches, dents and other similar damage. Where the Vehicle sustains major damage or is involved in an accident, the claim shall be dealt with pursuant to the applicable comprehensive insurance policy. Where insurance proceeds are insufficient to make good the entire loss, the Lessee may coordinate recovery of the outstanding balance from the client.

(15) Where damage caused by a client has been duly verified, the Lessee may apply the security deposit towards the cost of rectification or recover such cost directly from the client. Where circumstances warrant, the Lessor shall, upon verification, be compensated accordingly.

(16) The Lessee may grant the Lessor access to an electronic dashboard displaying real-time information concerning the Vehicle and related booking activity. The Lessor shall keep all login credentials strictly confidential and secure and shall regularly review the information made available through the dashboard.

(17) The Lessee shall furnish the Lessor with updates as may be necessary from time to time, including upon the occurrence of an incident. Such updates may include the status of the Vehicle, incidents, maintenance history and booking information.

7. TERMINATION OF THE AGREEMENT

(1) Either party may terminate this Agreement after giving the other party at least forty-eight (48) hours' notice in writing, provided that where the Lessor terminates, any rental fees paid in advance shall be refunded to the Lessee.

(2) This Agreement shall absolutely determine upon a third occurrence of the Lessor refusing to make the Vehicle available to a client after a stipulated time.

8. NOTICES

Any notice required under this Agreement shall be sufficiently served if served on the Lessee at its registered office or via electronic mail, and on the Lessor if served personally or via electronic mail.

9. FORCE MAJEURE

Neither party shall be liable for failure to perform its obligations if this Agreement is frustrated by Acts of God or other supervening but man-made events beyond the control of the parties.

10. ENTIRE AGREEMENT

This Agreement contains the entire agreement of the parties and supersedes all previous agreements, understandings and/or representations between them.

11. ASSIGNMENT & CHANGE IN OWNERSHIP/MANAGEMENT

The Lessor shall not assign or transfer its obligations and/or rights under this Agreement to any third party, whether an associated entity or not, in whole or in part, without the prior written consent of the Lessee.

12. GOVERNING LAW

This Agreement shall in all respects be governed and construed in accordance with the laws of the Republic of Ghana.

13. RESOLUTION OF DISPUTES

Any dispute arising between the parties shall be determined by a court of competent jurisdiction in the Republic of Ghana, and may upon agreement between the parties be submitted for arbitration.`;

export default function VendorAgreementScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { vendorProfile, signVendorAgreement } = useVendor();

  const [isSigning, setIsSigning] = useState(false);
  const [mode, setMode] = useState('draw');
  const [signature, setSignature] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const padRef = useRef(null);

  const isSigned = !!vendorProfile?.agreementSignedAt;

  const handleSubmit = async () => {
    if (!signature) return;
    setIsSubmitting(true);
    try {
      await signVendorAgreement(signature);
      setIsSigning(false);
      setSignature(null);
      Alert.alert('Agreement Signed', 'Your signature has been saved to this agreement.');
    } catch (e) {
      Alert.alert('Could not save your signature', e?.message || 'Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <VendorHeader title="Vendor Agreement" subtitle="Your terms as a WopeCar Partner" onBack={() => router.replace('/vendor/menu')} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          This is the Car Leasing Agreement between you and ACRE Logistics Ltd (WopeCar Group) as a vehicle-owning Partner. WopeCar's general Terms of Service, including the payments, liability, and dispute resolution provisions that also apply to Partners, governs your use of WopeCar alongside this agreement.
        </Text>

        <RichBody text={PARTNER_TERMS} colors={colors} />

        <TouchableOpacity style={styles.linkButton} onPress={() => router.push({ pathname: '/terms', params: { from: 'vendor-agreement' } })}>
          <Text style={styles.linkButtonText}>View Full Terms of Service</Text>
        </TouchableOpacity>

        <View style={styles.signSection}>
          {isSigned ? (
            <View style={styles.signedBanner}>
              <Text style={styles.signedBannerText}>
                You signed this agreement on {new Date(vendorProfile.agreementSignedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}.
              </Text>
            </View>
          ) : isSigning ? (
            <View>
              <Text style={styles.sectionTitle}>Sign Agreement</Text>
              <Text style={styles.hint}>By signing below, you agree to the terms of this Car Leasing Agreement.</Text>

              {!signature && (
                <View style={styles.modeToggle}>
                  {SIGNATURE_MODES.map((m) => (
                    <TouchableOpacity
                      key={m.key}
                      style={[styles.modeButton, mode === m.key && styles.modeButtonActive]}
                      onPress={() => setMode(m.key)}
                    >
                      <Text style={[styles.modeButtonText, mode === m.key && styles.modeButtonTextActive]}>{m.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <View pointerEvents={signature ? 'none' : 'auto'}>
                <SignaturePad key={mode} ref={padRef} mode={mode} onOK={setSignature} onEmpty={() => {}} />
              </View>

              {signature ? (
                <View style={styles.signedActions}>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => {
                      padRef.current?.clearSignature();
                      setSignature(null);
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>Clear</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryButton} onPress={handleSubmit} disabled={isSubmitting}>
                    <Text style={styles.primaryButtonText}>{isSubmitting ? 'Saving...' : 'Confirm & Sign'}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.confirmButton} onPress={() => padRef.current?.readSignature()}>
                  <Text style={styles.confirmButtonText}>Confirm {mode === 'initials' ? 'Initials' : 'Signature'}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.cancelButton} onPress={() => { setIsSigning(false); setSignature(null); }}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.primaryButton} onPress={() => setIsSigning(true)}>
              <Text style={styles.primaryButtonText}>Sign Agreement</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    intro: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      lineHeight: 19,
      marginBottom: 20,
    },
    linkButton: {
      alignSelf: 'flex-start',
      marginTop: 8,
    },
    linkButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.teal,
      textDecorationLine: 'underline',
    },
    signSection: {
      marginTop: 28,
      paddingTop: 20,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    signedBanner: {
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
    },
    signedBannerText: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textPrimary,
      lineHeight: 19,
    },
    sectionTitle: {
      fontFamily: FONTS.bold,
      fontSize: 15,
      color: colors.textPrimary,
      marginBottom: 6,
    },
    hint: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      marginBottom: 14,
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
    signedActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 12,
    },
    primaryButton: {
      backgroundColor: colors.teal,
      borderRadius: 10,
      paddingVertical: 13,
      alignItems: 'center',
      flex: 1,
    },
    primaryButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.white,
    },
    secondaryButton: {
      borderRadius: 10,
      paddingVertical: 13,
      paddingHorizontal: 20,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    cancelButton: {
      marginTop: 14,
      alignSelf: 'center',
    },
    cancelButtonText: {
      fontFamily: FONTS.medium,
      fontSize: 13,
      color: colors.textSubtle,
    },
  });
}
