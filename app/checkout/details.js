import { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../constants/theme';
import { useCheckout } from '../../contexts/CheckoutContext';
import CheckoutHeader from '../../components/CheckoutHeader';
import CheckoutFooterButton from '../../components/CheckoutFooterButton';

// Matches the FAQ-stated delivery window ("Deliveries start at 8am while
// return time is capped at 5pm") already confirmed on the car detail FAQs.
const TIME_SLOTS = [
  '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM',
  '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM',
];

function TimeSlotPicker({ label, value, onChange }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.slotGrid}>
        {TIME_SLOTS.map((slot) => (
          <TouchableOpacity
            key={slot}
            style={[styles.slot, value === slot && styles.slotActive]}
            onPress={() => onChange(slot)}
          >
            <Text style={[styles.slotText, value === slot && styles.slotTextActive]}>
              {slot}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function CheckoutDetailsScreen() {
  const { carId } = useLocalSearchParams();
  const router = useRouter();
  const { draft, updateDraft } = useCheckout();

  const [pickupTime, setPickupTime] = useState(draft.pickupTime);
  const [returnTime, setReturnTime] = useState(draft.returnTime);
  const [pickupLocation, setPickupLocation] = useState(draft.pickupLocation);
  const [returnLocation, setReturnLocation] = useState(draft.returnLocation);
  const [sameAsPickup, setSameAsPickup] = useState(
    !!draft.pickupLocation && draft.pickupLocation === draft.returnLocation
  );

  const handlePickupLocationChange = (text) => {
    setPickupLocation(text);
    if (sameAsPickup) setReturnLocation(text);
  };

  const toggleSameAsPickup = () => {
    const next = !sameAsPickup;
    setSameAsPickup(next);
    if (next) setReturnLocation(pickupLocation);
  };

  const isValid = pickupTime && returnTime && pickupLocation.trim() && returnLocation.trim();

  const handleContinue = () => {
    updateDraft({ pickupTime, returnTime, pickupLocation, returnLocation });
    router.push({ pathname: '/checkout/addons', params: { carId } });
  };

  return (
    <View style={styles.container}>
      <CheckoutHeader title="Pickup & Return" step={2} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <TimeSlotPicker label="Pickup Time" value={pickupTime} onChange={setPickupTime} />
        <TimeSlotPicker label="Return Time" value={returnTime} onChange={setReturnTime} />

        <View style={styles.field}>
          <Text style={styles.label}>Pickup Location</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Impact Hub, Accra"
            placeholderTextColor="#999"
            value={pickupLocation}
            onChangeText={handlePickupLocationChange}
          />
        </View>

        <TouchableOpacity style={styles.checkboxRow} onPress={toggleSameAsPickup}>
          <View style={[styles.checkbox, sameAsPickup && styles.checkboxChecked]}>
            {sameAsPickup && <Ionicons name="checkmark" size={14} color="#ffffff" />}
          </View>
          <Text style={styles.checkboxLabel}>Return to the same location</Text>
        </TouchableOpacity>

        {!sameAsPickup && (
          <View style={styles.field}>
            <Text style={styles.label}>Return Location</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Kotoka Airport, Accra"
              placeholderTextColor="#999"
              value={returnLocation}
              onChangeText={setReturnLocation}
            />
          </View>
        )}
      </ScrollView>

      <CheckoutFooterButton label="Continue" onPress={handleContinue} disabled={!isValid} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  field: {
    marginBottom: 22,
  },
  label: {
    fontFamily: FONTS.semiBold,
    fontSize: 14,
    color: COLORS.navy,
    marginBottom: 10,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slot: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  slotActive: {
    backgroundColor: COLORS.teal,
    borderColor: COLORS.teal,
  },
  slotText: {
    fontFamily: FONTS.medium,
    fontSize: 13,
    color: '#666',
  },
  slotTextActive: {
    fontFamily: FONTS.semiBold,
    color: '#ffffff',
  },
  input: {
    fontFamily: FONTS.regular,
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#e5e5e5',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 22,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.teal,
    borderColor: COLORS.teal,
  },
  checkboxLabel: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: COLORS.navy,
  },
});
