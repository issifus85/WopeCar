import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import WopeCareSelector from '../components/WopeCareSelector';

// Representative example price/duration for this purely-informational
// screen - there's no real car or booking in context here (unlike the
// addons checkout step, where WopeCareSelector gets the actual trip's
// pricePerDay/days). Matches the price point used elsewhere in this app's
// own example screenshots.
const EXAMPLE_PRICE_PER_DAY = 145;
const EXAMPLE_DAYS = 1;

export default function ProtectionPlanScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // Purely local/visual - no checkout draft exists on this screen, so
  // tapping a plan here just highlights it for illustration; nothing is
  // persisted or carried into an actual booking.
  const [selectedPlan, setSelectedPlan] = useState('none');

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <WopeCareSelector
          pricePerDay={EXAMPLE_PRICE_PER_DAY}
          days={EXAMPLE_DAYS}
          selectedPlan={selectedPlan}
          onSelect={setSelectedPlan}
        />

        <TouchableOpacity style={styles.ctaButton} onPress={() => router.push('/(tabs)')}>
          <Text style={styles.ctaButtonText}>Browse Cars & Add WopeCare</Text>
          <Ionicons name="arrow-forward" size={18} color={colors.white} />
        </TouchableOpacity>
      </ScrollView>
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
    ctaButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.teal,
      borderRadius: 12,
      paddingVertical: 16,
      marginTop: 8,
    },
    ctaButtonText: {
      fontFamily: FONTS.semiBold,
      fontSize: 15,
      color: colors.white,
    },
  });
}
