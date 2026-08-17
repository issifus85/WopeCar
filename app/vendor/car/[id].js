import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Switch, ActivityIndicator, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useCurrency } from '../../../contexts/CurrencyContext';
import { formatCurrency } from '../../../constants/pricing';
import { useVendor } from '../../../contexts/VendorContext';
import supabase from '../../../services/supabase';
import VendorHeader from '../../../components/VendorHeader';
import VendorStatusBadge from '../../../components/VendorStatusBadge';

const CANCELLATION_SETTING_KEYS = ['cancellation_full_refund_hours', 'cancellation_partial_refund_hours', 'cancellation_partial_refund_percentage'];

function hoursToPhrase(hours) {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

// Set platform-wide in Settings > Business Rules > Cancellation Policy - a
// vendor can see it here but not change it (matches how it was scoped:
// global, admin-only, per the actual product decision for this policy).
function useCancellationPolicySummary() {
  const [summary, setSummary] = useState('Loading…');

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('app_settings')
      .select('key, value')
      .in('key', CANCELLATION_SETTING_KEYS)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const map = Object.fromEntries(data.map((row) => [row.key, row.value]));
        const fullHours = Number(map.cancellation_full_refund_hours ?? 168);
        const partialHours = Number(map.cancellation_partial_refund_hours ?? 24);
        const partialPct = Math.round(Number(map.cancellation_partial_refund_percentage ?? 0.5) * 100);
        setSummary(
          `100% refund ${hoursToPhrase(fullHours)}+ before pickup · ${partialPct}% refund ${hoursToPhrase(partialHours)}–${hoursToPhrase(fullHours)} before · no refund under ${hoursToPhrase(partialHours)}`
        );
      })
      .catch(() => !cancelled && setSummary('Could not load — check your connection.'));
    return () => { cancelled = true; };
  }, []);

  return summary;
}

function Row({ icon, label, subtitle, onPress, right, last, styles, colors }) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={[styles.row, last && styles.rowLast]} onPress={onPress} activeOpacity={onPress ? 0.6 : 1}>
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={18} color={colors.teal} />
      </View>
      <View style={styles.rowLabelWrap}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      {right ?? (onPress && <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />)}
    </Wrapper>
  );
}

export default function VendorCarManagementScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const { activeCurrency } = useCurrency();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { cars, isLoading, updateCar } = useVendor();
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);
  const cancellationPolicySummary = useCancellationPolicySummary();

  const car = cars.find((c) => c.id === id);

  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  if (!car) {
    return (
      <View style={styles.container}>
        <VendorHeader title="Car Management" onBack={() => router.push('/vendor/fleet')} />
        <View style={styles.centerState}>
          <Ionicons name="alert-circle-outline" size={40} color={colors.disabled} />
          <Text style={styles.emptyText}>This car couldn't be found.</Text>
        </View>
      </View>
    );
  }

  const isPending = car.status === 'Pending';

  const handleToggleStatus = async (value) => {
    setIsTogglingStatus(true);
    try {
      await updateCar(car.id, { status: value ? 'Active' : 'Inactive' });
    } catch (e) {
      Alert.alert('Could not update listing', e?.message || 'Please check your connection and try again.');
    } finally {
      setIsTogglingStatus(false);
    }
  };

  return (
    <View style={styles.container}>
      <VendorHeader title={car.name} subtitle={`${formatCurrency(car.pricePerDay, activeCurrency)}/day`} onBack={() => router.push('/vendor/fleet')} />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryCard}>
          {car.image ? (
            <Image source={{ uri: car.image }} style={styles.image} contentFit="cover" />
          ) : (
            <View style={[styles.image, styles.imagePlaceholder]}>
              <Text style={styles.imagePlaceholderText}>🚗</Text>
            </View>
          )}
          <View style={styles.summaryInfo}>
            <Text style={styles.summaryName} numberOfLines={1}>{car.name}</Text>
            <VendorStatusBadge status={car.status} />
          </View>
        </View>

        <Text style={styles.sectionTitle}>Manage This Car</Text>
        <View style={styles.sectionCard}>
          <Row
            icon="power-outline"
            label="Active Listing"
            subtitle={isPending ? 'Awaiting approval' : car.status === 'Active' ? 'Visible to renters' : 'Hidden from search'}
            styles={styles}
            colors={colors}
            right={
              <Switch
                value={car.status === 'Active'}
                disabled={isPending || isTogglingStatus}
                onValueChange={handleToggleStatus}
                trackColor={{ false: colors.disabled, true: colors.teal }}
                thumbColor={colors.white}
              />
            }
          />
          <Row
            icon="create-outline"
            label="Edit Listing"
            subtitle="Update details, features, description, and pricing"
            onPress={() => router.push(`/vendor/car/edit/${car.id}`)}
            styles={styles}
            colors={colors}
          />
          <Row
            icon="calendar-outline"
            label="Manage Availability"
            subtitle="Block dates and set booking rules"
            onPress={() => router.push(`/vendor/car/availability/${car.id}`)}
            styles={styles}
            colors={colors}
          />
          <Row
            icon="pricetag-outline"
            label="Pricing & Discounts"
            subtitle="Set custom date pricing and discounts"
            onPress={() => router.push(`/vendor/car/pricing/${car.id}`)}
            styles={styles}
            colors={colors}
          />
          <Row
            icon="document-text-outline"
            label="Compliance Documents"
            subtitle="Roadworthy cert., insurance, and policy number"
            onPress={() => router.push(`/vendor/car/documents/${car.id}`)}
            styles={styles}
            colors={colors}
          />
          <Row
            icon="receipt-outline"
            label="View Bookings"
            subtitle="This car's booking history"
            onPress={() => router.push({ pathname: '/vendor/history', params: { carId: car.id } })}
            styles={styles}
            colors={colors}
          />
          <Row
            icon="shield-checkmark-outline"
            label="Cancellation Policy"
            subtitle={cancellationPolicySummary}
            onPress={() =>
              Alert.alert(
                'Cancellation Policy',
                `${cancellationPolicySummary}\n\nThis policy applies platform-wide and is set by WopeCar admin — it isn't something you can change per listing.`
              )
            }
            last
            styles={styles}
            colors={colors}
          />
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
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 20,
    },
    emptyText: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textSubtle,
      textAlign: 'center',
    },
    scrollContent: {
      padding: 20,
      paddingBottom: 40,
    },
    summaryCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 14,
      marginBottom: 24,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    image: {
      width: 72,
      height: 72,
      borderRadius: 10,
    },
    imagePlaceholder: {
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    imagePlaceholderText: {
      fontSize: 28,
    },
    summaryInfo: {
      flex: 1,
      gap: 6,
    },
    summaryName: {
      fontFamily: FONTS.bold,
      fontSize: 16,
      color: colors.textPrimary,
    },
    sectionTitle: {
      fontFamily: FONTS.bold,
      fontSize: 16,
      color: colors.textPrimary,
      marginBottom: 12,
    },
    sectionCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
      overflow: 'hidden',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
      gap: 12,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    rowIcon: {
      width: 34,
      height: 34,
      borderRadius: 8,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowLabelWrap: {
      flex: 1,
    },
    rowLabel: {
      fontFamily: FONTS.semiBold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    rowSubtitle: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 2,
    },
  });
}
