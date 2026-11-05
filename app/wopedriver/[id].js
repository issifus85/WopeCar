// One WopeDriver request: status, driver details once confirmed, the day-by-day plan, payment, change and cancel.
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Linking, RefreshControl } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { formatCurrency } from '../../constants/pricing';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import DriverStatusPill from '../../components/wopedriver/DriverStatusPill';
import { dayLabel } from '../../components/wopedriver/DriverDayCalendar';
import { getDriverBooking, cancelDriverBooking, payDriverBooking } from '../../services/wopedriverApi';
import { timeLabel, fromTimeString } from '../../services/wopedriverPricing';

const STATUS_MESSAGES = {
  requested: 'We are matching you with a driver. WopeCar confirms within 24 hours.',
  confirmed: 'Your driver is booked.',
  in_progress: 'Your driver is on the job.',
  completed: 'This driver booking is complete. Thanks for riding with WopeDriver.',
  cancelled: 'This driver booking was cancelled.',
  declined: "Sorry, we didn't have a driver available for these days.",
};

export default function DriverBookingScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { activeCurrency } = useCurrency();
  const money = (n) => formatCurrency(n, activeCurrency);

  const [booking, setBooking] = useState(undefined);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [paying, setPaying] = useState(false);

  const load = useCallback(async () => {
    try {
      setBooking(await getDriverBooking(id));
    } catch {
      setBooking(null);
    }
  }, [id]);

  // Reloads when coming back from changing or paying for the request.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/wopedriver'));

  const confirmCancel = () => {
    Alert.alert('Cancel driver request?', `${booking.ref} will be cancelled.${booking.amountPaid > 0 ? ` We'll refund the ${money(booking.amountPaid)} you paid.` : ''}`, [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Cancel request',
        style: 'destructive',
        onPress: async () => {
          setCancelling(true);
          try {
            await cancelDriverBooking(booking.id);
            await load();
          } catch (e) {
            Alert.alert('Could not cancel', e?.message || 'Please try again.');
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
  };

  const pay = async () => {
    setPaying(true);
    try {
      await payDriverBooking(booking.id, booking.amountDue);
      await load();
      Alert.alert('Payment received', `Thanks, we received ${money(booking.amountDue)}.`);
    } catch (e) {
      Alert.alert('Payment not completed', e?.message || 'Please try again.');
    } finally {
      setPaying(false);
    }
  };

  if (booking === undefined) {
    return <View style={[styles.container, styles.center]}><ActivityIndicator color={colors.teal} /></View>;
  }

  const open = !!booking && ['requested', 'confirmed'].includes(booking.status);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{booking ? booking.ref : 'Driver booking'}</Text>
        {!!booking && <Text style={styles.subtitle}>{booking.serviceType === 'rental_addon' ? 'Driver for your WopeCar rental' : 'Driver for your own car'}</Text>}
      </View>

      {!booking ? (
        <View style={styles.center}><Text style={styles.muted}>We couldn't find this driver booking.</Text></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        >
          <View style={styles.card}>
            <DriverStatusPill status={booking.status} />
            <Text style={[styles.body, { marginTop: 8 }]}>{STATUS_MESSAGES[booking.status]}</Text>
            {!!booking.cancelReason && ['cancelled', 'declined'].includes(booking.status) && (
              <Text style={[styles.muted, { marginTop: 4 }]}>Reason: {booking.cancelReason}</Text>
            )}
          </View>

          {open && booking.amountDue > 0 && (
            <View style={[styles.card, styles.payCard]}>
              <Text style={styles.cardTitle}>{booking.amountPaid > 0 ? 'Balance to pay' : 'Payment due'}</Text>
              <Text style={styles.body}>
                {booking.amountPaid > 0
                  ? `You've paid ${money(booking.amountPaid)}. Your changes added ${money(booking.amountDue)}.`
                  : 'Pay to send your request to our drivers. You get a full refund if we can\'t confirm a driver.'}
              </Text>
              <TouchableOpacity style={styles.payButton} onPress={pay} disabled={paying}>
                {paying ? <ActivityIndicator color={colors.white} /> : <Text style={styles.payText}>Pay {money(booking.amountDue)}</Text>}
              </TouchableOpacity>
            </View>
          )}

          {!!booking.driverName && ['confirmed', 'in_progress'].includes(booking.status) && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Your driver</Text>
              <View style={styles.driverRow}>
                <View style={styles.driverAvatar}><Ionicons name="person" size={22} color={colors.white} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.driverName}>{booking.driverName}</Text>
                  {!!booking.driverPhone && <Text style={styles.muted}>{booking.driverPhone}</Text>}
                </View>
                {!!booking.driverPhone && (
                  <TouchableOpacity style={styles.callButton} onPress={() => Linking.openURL(`tel:${booking.driverPhone.replace(/\s/g, '')}`)} accessibilityLabel="Call driver">
                    <Ionicons name="call" size={18} color={colors.white} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Trip</Text>
            <Row styles={styles} label="Car" value={[booking.carDescription, booking.carTransmission, booking.carPlate].filter(Boolean).join(' · ')} />
            <Row styles={styles} label={booking.serviceType === 'own_car' ? 'Pickup address' : 'Meeting point'} value={booking.meetingPoint} />
            <Row styles={styles} label="Contact" value={[booking.contactName, booking.contactPhone].filter(Boolean).join(' · ')} />
            {!!booking.notes && <Row styles={styles} label="Notes" value={booking.notes} />}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Driver days</Text>
            {booking.days.map((d) => {
              const start = fromTimeString(d.startTime);
              return (
                <View key={d.id} style={styles.dayRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.dayTitle}>{dayLabel(d.date)}</Text>
                    <Text style={styles.muted}>{timeLabel(start)} – {timeLabel(start + d.hours)} · {d.zoneLabel}</Text>
                    <Text style={styles.mutedSmall}>{d.packageLabel}{d.extraHours ? ` + ${d.extraHours} extra hrs` : ''}{d.addon ? ` + ${money(d.addon)} location` : ''}</Text>
                  </View>
                  <Text style={styles.dayPrice}>{money(d.total)}</Text>
                </View>
              );
            })}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{money(booking.total)}</Text>
            </View>
            {booking.amountPaid > 0 && (
              <View style={styles.paidRow}>
                <Text style={styles.muted}>{booking.paymentStatus === 'refunded' ? 'Refunded' : 'Paid'}</Text>
                <Text style={styles.muted}>{money(booking.amountPaid)}</Text>
              </View>
            )}
            {booking.refundDue > 0 && booking.paymentStatus !== 'refunded' && (
              <Text style={[styles.mutedSmall, { marginTop: 4 }]}>Your new total is lower. WopeCar will refund {money(booking.refundDue)}.</Text>
            )}
          </View>

          {open && (
            <TouchableOpacity style={styles.changeButton} onPress={() => router.push({ pathname: '/wopedriver', params: { edit: booking.id } })}>
              <Ionicons name="create-outline" size={18} color={colors.white} />
              <Text style={styles.changeText}>Change request</Text>
            </TouchableOpacity>
          )}
          {open && booking.status === 'confirmed' && (
            <Text style={[styles.mutedSmall, { textAlign: 'center', marginBottom: 8 }]}>Changing a confirmed request sends it back to WopeCar to re-confirm your driver.</Text>
          )}

          {open && (
            <TouchableOpacity style={styles.cancelButton} onPress={confirmCancel} disabled={cancelling}>
              {cancelling ? <ActivityIndicator color={colors.error} /> : <Text style={styles.cancelText}>Cancel request</Text>}
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.supportButton} onPress={() => router.push('/support')}>
            <Ionicons name="help-buoy-outline" size={18} color={colors.teal} />
            <Text style={styles.supportText}>Need help? Contact support</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

function Row({ styles, label, value }) {
  if (!value) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    header: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
    title: { fontFamily: FONTS.bold, fontSize: 22, color: colors.textPrimary, marginTop: 10 },
    subtitle: { fontFamily: FONTS.regular, fontSize: 13, color: colors.textSubtle, marginTop: 2 },
    content: { padding: 16, paddingBottom: 48 },
    card: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: colors.border },
    cardTitle: { fontFamily: FONTS.semiBold, fontSize: 15, color: colors.textPrimary, marginBottom: 8 },
    body: { fontFamily: FONTS.regular, fontSize: 14, color: colors.textBody, lineHeight: 20 },
    muted: { fontFamily: FONTS.regular, fontSize: 13, color: colors.textMuted },
    mutedSmall: { fontFamily: FONTS.regular, fontSize: 12, color: colors.textSubtle, marginTop: 1 },
    driverRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    driverAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center' },
    driverName: { fontFamily: FONTS.semiBold, fontSize: 16, color: colors.textPrimary },
    callButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.teal, alignItems: 'center', justifyContent: 'center' },
    row: { paddingVertical: 6 },
    rowLabel: { fontFamily: FONTS.regular, fontSize: 12, color: colors.textSubtle },
    rowValue: { fontFamily: FONTS.medium, fontSize: 14, color: colors.textPrimary, marginTop: 1 },
    dayRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.divider },
    dayTitle: { fontFamily: FONTS.semiBold, fontSize: 14, color: colors.textPrimary },
    dayPrice: { fontFamily: FONTS.bold, fontSize: 14, color: colors.textPrimary },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10 },
    totalLabel: { fontFamily: FONTS.semiBold, fontSize: 14, color: colors.textPrimary },
    totalValue: { fontFamily: FONTS.bold, fontSize: 18, color: colors.textPrimary },
    payCard: { borderColor: colors.teal },
    payButton: { marginTop: 12, borderRadius: 12, paddingVertical: 14, alignItems: 'center', backgroundColor: colors.teal },
    payText: { fontFamily: FONTS.semiBold, fontSize: 15, color: colors.white },
    paidRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4 },
    changeButton: { flexDirection: 'row', gap: 6, borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navy, marginTop: 4, marginBottom: 10 },
    changeText: { fontFamily: FONTS.semiBold, fontSize: 15, color: colors.white },
    cancelButton: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: colors.error, marginTop: 4 },
    cancelText: { fontFamily: FONTS.semiBold, fontSize: 15, color: colors.error },
    supportButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 14 },
    supportText: { fontFamily: FONTS.semiBold, fontSize: 14, color: colors.teal },
  });
}
