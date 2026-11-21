import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import { FLEET_OFFICER_ENABLED } from '../constants/fleetOfficer';
import { getRenterLiveTrips } from '../services/liveTripApi';
import { formatEta } from '../utils/polyline';

/**
 * Renter, in the booking chat: "Kofi is on the way · Arriving in 12 min" while a WopeCar officer is delivering or collecting the car.
 * Tapping it opens the full-screen live map. Shows nothing when there is no live trip (or for anyone who isn't the booking's renter).
 */
export default function LiveTripCard({ conversationId = null, bookingId = null }) {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [trip, setTrip] = useState(null);
  const [focused, setFocused] = useState(false);

  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

  useEffect(() => {
    if (!FLEET_OFFICER_ENABLED || !focused || (!conversationId && !bookingId)) return undefined;
    let cancelled = false;
    const tick = () => getRenterLiveTrips({ conversationId, bookingId })
      .then((rows) => { if (!cancelled) setTrip(rows[0] ?? null); })
      .catch(() => {});
    tick();
    const timer = setInterval(tick, 20000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [focused, conversationId, bookingId]);

  if (!trip) return null;

  const name = trip.officerName || 'Your WopeCar officer';
  const eta = formatEta(trip.etaSeconds);
  const title = trip.status === 'arrived' ? `${name} has arrived` : `${name} is on the way`;
  const subtitle = trip.status === 'arrived'
    ? 'Tap to see where they are'
    : eta ? `Arriving in about ${eta}` : 'Tap to follow them on the map';

  return (
    <TouchableOpacity style={styles.card} onPress={() => router.push(`/live-trip/${trip.bookingId}`)} activeOpacity={0.85}>
      {trip.officerPhoto ? (
        <Image source={{ uri: trip.officerPhoto }} style={styles.avatar} contentFit="cover" />
      ) : (
        <View style={[styles.avatar, styles.avatarEmpty]}>
          <Ionicons name="person" size={18} color={COLORS.teal} />
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
      </View>
      <View style={styles.mapChip}>
        <Ionicons name="map" size={14} color="#ffffff" />
        <Text style={styles.mapChipText}>Live map</Text>
      </View>
    </TouchableOpacity>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 12, marginTop: 8, padding: 10,
      borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: COLORS.teal,
    },
    avatar: { width: 40, height: 40, borderRadius: 20 },
    avatarEmpty: { backgroundColor: colors.highlight, alignItems: 'center', justifyContent: 'center' },
    info: { flex: 1, gap: 2 },
    title: { fontFamily: FONTS.semiBold, fontSize: 14, color: colors.textPrimary },
    subtitle: { fontFamily: FONTS.regular, fontSize: 13, color: colors.textSubtle },
    mapChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.teal, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
    mapChipText: { fontFamily: FONTS.semiBold, fontSize: 12, color: '#ffffff' },
  });
}
