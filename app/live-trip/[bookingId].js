import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import LiveMap from '../../components/LiveMap';
import { getRenterLiveTrips, subscribeToOfficerLocation, refreshTripEta } from '../../services/liveTripApi';
import { formatEta, formatDistance } from '../../utils/polyline';

const STALE_AFTER_MS = 60_000;

function minutesAgo(iso) {
  if (!iso) return null;
  return Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
}

/**
 * Renter: full-screen live map while a WopeCar officer is delivering or collecting the car - route, the officer's pin (moved by
 * Supabase Realtime as fixes arrive), ETA, name and photo, and Message officer. Opened from the chat card and the "on the way" push.
 */
export default function LiveTripScreen() {
  const { bookingId } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [trip, setTrip] = useState(undefined);
  const [officer, setOfficer] = useState(null);
  const [locationAt, setLocationAt] = useState(null);
  const [focused, setFocused] = useState(false);
  const [, setNow] = useState(Date.now());

  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

  // ETA, route and status: every 20 s (the server refreshes the ETA about every 30 s while the officer drives).
  useEffect(() => {
    if (!focused || !bookingId) return undefined;
    let cancelled = false;
    const tick = async () => {
      const rows = await getRenterLiveTrips({ bookingId }).catch(() => null);
      if (cancelled || rows == null) return;
      const next = rows[0] ?? null;
      setTrip(next);
      if (next?.officer) {
        setOfficer((prev) => prev ?? next.officer);
        setLocationAt((prev) => (prev && next.locationAt && prev > next.locationAt ? prev : next.locationAt));
      }
      // If the officer's phone has not refreshed the ETA for a while, ask for it (the server limits how often it really recomputes).
      if (next?.status === 'en_route' && (!next.etaUpdatedAt || Date.now() - new Date(next.etaUpdatedAt).getTime() > 90_000)) {
        refreshTripEta(next.taskId);
      }
    };
    tick();
    const timer = setInterval(tick, 20000);
    const clock = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      clearInterval(clock);
    };
  }, [focused, bookingId]);

  // The officer's pin: every new fix, live.
  const taskId = trip?.taskId;
  useEffect(() => {
    if (!focused || !taskId) return undefined;
    return subscribeToOfficerLocation(taskId, (fix) => {
      setOfficer({ latitude: fix.latitude, longitude: fix.longitude, heading: fix.heading });
      setLocationAt(fix.recordedAt || new Date().toISOString());
    });
  }, [focused, taskId]);

  if (trip === undefined) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.teal} />
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={[styles.container, styles.center, { padding: 24 }]}>
        <Ionicons name="checkmark-circle-outline" size={40} color={colors.textSubtle} />
        <Text style={styles.emptyTitle}>There's no live trip right now</Text>
        <Text style={styles.emptyText}>The map shows here while a WopeCar officer is on the way to you.</Text>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const name = trip.officerName || 'Your WopeCar officer';
  const stale = trip.status === 'en_route' && trip.sharing && (!locationAt || Date.now() - new Date(locationAt).getTime() > STALE_AFTER_MS);
  const eta = formatEta(trip.etaSeconds);

  let headline;
  let detail = null;
  if (trip.status === 'arrived') {
    headline = `${name} has arrived`;
    detail = trip.destinationLabel ? `At ${trip.destinationLabel}` : null;
  } else if (!trip.sharing) {
    headline = `${name} is on the way`;
    detail = 'Live location sharing has stopped. Message them for an update.';
  } else if (stale) {
    headline = `${name} is on the way`;
    const ago = minutesAgo(locationAt);
    detail = ago ? `Location last updated ${ago} min ago` : 'Waiting for their location...';
  } else {
    headline = eta ? `Arriving in about ${eta}` : `${name} is on the way`;
    detail = [eta ? name : null, trip.etaDistance != null ? `${formatDistance(trip.etaDistance)} away` : null].filter(Boolean).join(' · ') || null;
  }

  return (
    <View style={styles.container}>
      <LiveMap
        officer={officer ?? trip.officer}
        destination={trip.destination}
        routePolyline={trip.routePolyline}
        officerLabel={name}
        destinationLabel={trip.destinationLabel || 'You'}
        style={styles.map}
      />

      <View style={[styles.sheet, { paddingBottom: 16 + insets.bottom }]}>
        <View style={styles.headRow}>
          {trip.officerPhoto ? (
            <Image source={{ uri: trip.officerPhoto }} style={styles.avatar} contentFit="cover" />
          ) : (
            <View style={[styles.avatar, styles.avatarEmpty]}>
              <Ionicons name="person" size={22} color={COLORS.teal} />
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.headline}>{headline}</Text>
            {!!detail && <Text style={[styles.detail, (stale || !trip.sharing) && trip.status === 'en_route' && { color: colors.warning }]}>{detail}</Text>}
            {!!trip.vehicleNote && <Text style={styles.small}>{trip.vehicleNote}</Text>}
          </View>
        </View>
        {!!trip.destinationLabel && trip.status === 'en_route' && (
          <View style={styles.destRow}>
            <Ionicons name="location-outline" size={16} color={colors.textSubtle} />
            <Text style={styles.small} numberOfLines={2}>{trip.type === 'delivery' ? 'Delivering to' : 'Collecting from'} {trip.destinationLabel}</Text>
          </View>
        )}
        {!!trip.conversationId && (
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push(`/inbox/booking-${trip.conversationId}`)}>
            <Ionicons name="chatbubbles-outline" size={18} color="#ffffff" />
            <Text style={styles.primaryButtonText}>Message officer</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    center: { alignItems: 'center', justifyContent: 'center', gap: 10 },
    map: { flex: 1, width: '100%', height: undefined, borderRadius: 0 },
    sheet: {
      backgroundColor: colors.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, gap: 12,
      shadowColor: colors.shadow, shadowOpacity: 0.12, shadowRadius: 10, elevation: 8, marginTop: -18,
    },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    avatar: { width: 52, height: 52, borderRadius: 26 },
    avatarEmpty: { backgroundColor: colors.highlight, alignItems: 'center', justifyContent: 'center' },
    headline: { fontFamily: FONTS.bold, fontSize: 18, color: colors.textPrimary },
    detail: { fontFamily: FONTS.medium, fontSize: 14, color: colors.textBody },
    small: { flex: 1, fontFamily: FONTS.regular, fontSize: 12, color: colors.textSubtle },
    destRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    primaryButton: {
      flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.teal,
      borderRadius: 12, paddingVertical: 14,
    },
    primaryButtonText: { fontFamily: FONTS.semiBold, fontSize: 16, color: '#ffffff' },
    emptyTitle: { fontFamily: FONTS.semiBold, fontSize: 16, color: colors.textPrimary, textAlign: 'center' },
    emptyText: { fontFamily: FONTS.regular, fontSize: 14, color: colors.textSubtle, textAlign: 'center' },
    secondaryButton: { marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
    secondaryButtonText: { fontFamily: FONTS.semiBold, fontSize: 15, color: colors.textPrimary },
  });
}
