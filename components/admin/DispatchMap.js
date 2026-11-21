import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { mapsModule as Maps, useGoogleMaps, MapErrorBoundary } from '../LiveMap';
import { decodePolyline } from '../../utils/polyline';

/**
 * Admin dispatch: officers who are on a trip, at their last shared position, plus the selected trip's route and destination.
 * officers: rows from admin_officer_availability; selected: a row from admin_dispatch_board (or null).
 */
export default function DispatchMap({ officers, selected, onSelectTask, style }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const mapRef = useRef(null);
  const onTrip = useMemo(
    () => officers.filter((o) => o.availability === 'on_trip' && o.last_lat != null && o.last_lng != null),
    [officers]
  );
  const route = useMemo(() => decodePolyline(selected?.route_polyline), [selected?.route_polyline]);
  const destination = selected?.dest_lat != null ? { latitude: selected.dest_lat, longitude: selected.dest_lng } : null;

  // Re-frame when the selection or the number of pins changes, not on every position update.
  const frameKey = selected ? `t:${selected.id}:${route.length}` : `all:${onTrip.length}`;
  useEffect(() => {
    if (!mapRef.current) return;
    const pts = [
      ...onTrip.map((o) => ({ latitude: o.last_lat, longitude: o.last_lng })),
      ...(selected ? route : []),
      ...(destination ? [destination] : []),
    ];
    if (pts.length === 1) mapRef.current.animateToRegion?.({ ...pts[0], latitudeDelta: 0.03, longitudeDelta: 0.03 }, 400);
    else if (pts.length > 1) mapRef.current.fitToCoordinates?.(pts, { edgePadding: { top: 40, right: 40, bottom: 40, left: 40 }, animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey]);

  const fallback = (
    <View style={[styles.fallback, style]}>
      <Ionicons name="map-outline" size={24} color={colors.textSubtle} />
      <Text style={styles.fallbackText}>{Maps ? 'The map could not be shown.' : 'Update the WopeCar app to see the map.'}</Text>
    </View>
  );
  if (!Maps) return fallback;
  const { default: MapView, Marker, Polyline, PROVIDER_GOOGLE } = Maps;

  return (
    <MapErrorBoundary fallback={fallback}>
      <MapView
        ref={mapRef}
        style={[styles.map, style]}
        provider={useGoogleMaps ? PROVIDER_GOOGLE : undefined}
        initialRegion={{ latitude: 5.6037, longitude: -0.187, latitudeDelta: 0.15, longitudeDelta: 0.15 }}
        showsCompass={false}
        toolbarEnabled={false}
      >
        {selected && route.length > 1 && <Polyline coordinates={route} strokeColor="#f5a623" strokeWidth={4} />}
        {selected && destination && <Marker coordinate={destination} pinColor={COLORS.navy} title="Destination" />}
        {onTrip.map((o) => {
          const isSelected = selected && selected.id === o.current_task_id;
          const stale = !o.last_location_at || Date.now() - new Date(o.last_location_at).getTime() > 120000;
          return (
            <Marker
              key={o.user_id}
              coordinate={{ latitude: o.last_lat, longitude: o.last_lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              title={o.display_name}
              description={o.current_booking_ref || undefined}
              onPress={() => o.current_task_id && onSelectTask?.(o.current_task_id)}
            >
              <View style={[styles.pin, stale && styles.pinStale, isSelected && styles.pinSelected]}>
                <Text style={styles.pinText}>{(o.display_name || '?').charAt(0).toUpperCase()}</Text>
              </View>
            </Marker>
          );
        })}
      </MapView>
    </MapErrorBoundary>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    map: { width: '100%', height: 220, borderRadius: 12 },
    fallback: { width: '100%', height: 120, borderRadius: 12, backgroundColor: colors.highlight, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12 },
    fallbackText: { fontFamily: FONTS.medium, fontSize: 13, color: colors.textSubtle, textAlign: 'center' },
    pin: { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.teal, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#ffffff' },
    pinStale: { backgroundColor: '#8a94a6' },
    pinSelected: { borderColor: '#f5a623', borderWidth: 3 },
    pinText: { fontFamily: FONTS.bold, fontSize: 13, color: '#ffffff' },
  });
}
