import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useCurrency } from '../../../contexts/CurrencyContext';
import { formatCurrency } from '../../../constants/pricing';
import { useAddCar } from '../../../contexts/AddCarContext';
import { useVendor } from '../../../contexts/VendorContext';
import { uploadCarDocument } from '../../../services/documentsApi';
import { joinLocation } from '../../../constants/vehicleCatalog';
import VendorWizardHeader from '../../../components/VendorWizardHeader';
import CheckoutFooterButton from '../../../components/CheckoutFooterButton';
import ConfirmModal from '../../../components/ConfirmModal';

function formatVettingDate(iso) {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function SummaryRow({ label, value, styles }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

export default function AddCarReviewScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { activeCurrency } = useCurrency();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { draft, resetAddCar } = useAddCar();
  const { addCar } = useVendor();
  const [showSubmitted, setShowSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const enabledRegions = draft.offersRegionalAddons
    ? draft.regionalAddons.filter((r) => Number(r.price) > 0)
    : [];

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const car = await addCar({
        name: `${draft.make} ${draft.model}`,
        make: draft.make,
        model: draft.model,
        year: draft.year,
        drivenBy: draft.drivenBy,
        energySource: draft.energySource,
        location: joinLocation(draft.region, draft.location),
        pricePerDay: Number(draft.pricePerDay),
        regionalAddons: enabledRegions.map((r) => ({ name: r.name, price: Number(r.price), type: 'per_day' })),
        vettingAppointment: { date: draft.vettingDate, time: draft.vettingTime },
        description: draft.description.trim(),
        transmission: draft.transmission,
        seats: draft.seats ? Number(draft.seats) : null,
        doors: draft.doors ? Number(draft.doors) : null,
        baggage: draft.baggage ? Number(draft.baggage) : null,
        features: draft.features,
        type: draft.type,
        vehicleClass: draft.vehicleClass,
        insurancePolicyNumber: draft.insurancePolicyNumber.trim(),
      });

      // Needs the car's own id, so these can only upload after addCar()
      // above returns - not part of the same insert.
      await Promise.all([
        uploadCarDocument(car.id, 'roadworthy', draft.roadworthyDocUri, draft.roadworthyExpiryDate),
        uploadCarDocument(car.id, 'insurance', draft.insuranceDocUri, draft.insuranceExpiryDate),
      ]);

      setShowSubmitted(true);
    } catch (e) {
      Alert.alert('Could not submit listing', e?.message || 'Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDone = () => {
    resetAddCar();
    router.replace('/vendor/fleet');
  };

  return (
    <View style={styles.container}>
      <VendorWizardHeader title="Review & Submit" step={6} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Vehicle</Text>
        <View style={styles.card}>
          <SummaryRow label="Make & Model" value={`${draft.make} ${draft.model}`} styles={styles} />
          <SummaryRow label="Year" value={draft.year} styles={styles} />
          <SummaryRow label="Type" value={draft.type} styles={styles} />
          <SummaryRow label="Vehicle Class" value={draft.vehicleClass} styles={styles} />
          <SummaryRow label="Driven By" value={draft.drivenBy} styles={styles} />
          <SummaryRow label="Energy Source" value={draft.energySource} styles={styles} />
          <SummaryRow label="Transmission" value={draft.transmission} styles={styles} />
          <SummaryRow label="Seats" value={draft.seats || 'Not provided'} styles={styles} />
          <SummaryRow label="Doors" value={draft.doors || 'Not provided'} styles={styles} />
          <SummaryRow label="Trunk Size (Bags)" value={draft.baggage || 'Not provided'} styles={styles} />
        </View>

        <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Features</Text>
        <View style={styles.card}>
          {draft.features.length === 0 ? (
            <Text style={styles.emptyText}>Not provided.</Text>
          ) : (
            <Text style={styles.descriptionText}>{draft.features.map((f) => f.title).join(', ')}</Text>
          )}
        </View>

        <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Description</Text>
        <View style={styles.card}>
          <Text style={styles.descriptionText}>{draft.description.trim() || 'Not provided.'}</Text>
        </View>

        <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Location & Pricing</Text>
        <View style={styles.card}>
          <SummaryRow label="Location" value={joinLocation(draft.region, draft.location)} styles={styles} />
          <SummaryRow label="Price per Day" value={`${formatCurrency(Number(draft.pricePerDay), activeCurrency)}/day`} styles={styles} />
        </View>

        <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Regional Add-ons</Text>
        <View style={styles.card}>
          {enabledRegions.length === 0 ? (
            <Text style={styles.emptyText}>Not offered for this car.</Text>
          ) : (
            enabledRegions.map((region) => (
              <SummaryRow
                key={region.name}
                label={region.name}
                value={`${formatCurrency(Number(region.price), activeCurrency)}/day`}
                styles={styles}
              />
            ))
          )}
        </View>

        <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Vetting Appointment</Text>
        <View style={styles.card}>
          <SummaryRow label="Date" value={formatVettingDate(draft.vettingDate)} styles={styles} />
          <SummaryRow label="Time" value={draft.vettingTime} styles={styles} />
        </View>

        <Text style={[styles.sectionTitle, styles.sectionSpaced]}>Compliance Documents</Text>
        <View style={styles.card}>
          <SummaryRow label="Insurance Policy #" value={draft.insurancePolicyNumber || 'Not provided'} styles={styles} />
          <SummaryRow label="Roadworthy Cert." value={draft.roadworthyDocUri ? 'Attached' : 'Not attached'} styles={styles} />
          <SummaryRow label="Roadworthy Expiry" value={formatVettingDate(draft.roadworthyExpiryDate) || 'Not provided'} styles={styles} />
          <SummaryRow label="Insurance Document" value={draft.insuranceDocUri ? 'Attached' : 'Not attached'} styles={styles} />
          <SummaryRow label="Insurance Expiry" value={formatVettingDate(draft.insuranceExpiryDate) || 'Not provided'} styles={styles} />
        </View>

        <View style={styles.noticeBox}>
          <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
          <Text style={styles.noticeText}>
            Your car will be listed as <Text style={styles.noticeBold}>Pending</Text> and won't be visible to renters
            until WopeCar support completes the photo verification and vetting visit above and approves your
            listing. There is no way to publish a listing automatically.
          </Text>
        </View>
      </ScrollView>

      <CheckoutFooterButton
        label={isSubmitting ? 'Submitting...' : 'Submit for Review'}
        onPress={handleSubmit}
        disabled={isSubmitting}
      />

      <ConfirmModal
        visible={showSubmitted}
        title="Submitted for Review"
        message="Your car has been added as Pending. We'll be in touch to confirm your vetting appointment, and your listing will go live once it's approved."
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
      backgroundColor: colors.background,
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    sectionTitle: {
      fontFamily: FONTS.bold,
      fontSize: 14,
      color: colors.textSubtle,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 10,
    },
    sectionSpaced: {
      marginTop: 20,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 16,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 10,
    },
    summaryLabel: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
    },
    summaryValue: {
      flexShrink: 1,
      textAlign: 'right',
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.textPrimary,
    },
    emptyText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
    },
    descriptionText: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textPrimary,
      lineHeight: 19,
    },
    noticeBox: {
      flexDirection: 'row',
      gap: 10,
      backgroundColor: colors.warningBg,
      borderRadius: 12,
      padding: 14,
      marginTop: 20,
    },
    noticeText: {
      flex: 1,
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 18,
    },
    noticeBold: {
      fontFamily: FONTS.bold,
      color: colors.warning,
    },
  });
}
