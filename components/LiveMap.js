import { Component, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, Platform, UIManager, NativeModules } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { COLORS, FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';
import { decodePolyline } from '../utils/polyline';

// react-native-maps is native code: an app binary built before it was added (any build older than Fleet Officer Phase 4) does not have
// it, and an OTA update cannot add it. So it is loaded only when the native side is really there, and the map shows a "please update"
// box otherwise instead of crashing.
function loadMaps() {
  try {
    const hasNative = (UIManager.hasViewManagerConfig && (UIManager.hasViewManagerConfig('AIRMap') || UIManager.hasViewManagerConfig('AIRGoogleMap')))
      || !!NativeModules.AirMapModule;
    if (!hasNative) return null;
    return require('react-native-maps');
  } catch {
    return null;
  }
}
const Maps = loadMaps();

// Google Maps where the build has a key for it (always on Android; on iOS only when the build set GOOGLE_MAPS_IOS_API_KEY), Apple Maps
// otherwise.
const useGoogle = Platform.OS === 'android' || !!Constants.expoConfig?.extra?.HAS_IOS_GOOGLE_MAPS_KEY;

class MapErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * officer: { latitude, longitude, heading? } | null   destination: { latitude, longitude } | null   routePolyline: Google encoded line
 */
export default function LiveMap({ officer, destination, routePolyline, style, officerLabel = 'Officer', destinationLabel = 'Destination' }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const mapRef = useRef(null);
  const route = useMemo(() => decodePolyline(routePolyline), [routePolyline]);

  const points = useMemo(
    () => [officer, destination].filter((p) => p && p.latitude != null && p.longitude != null),
    [officer?.latitude, officer?.longitude, destination?.latitude, destination?.longitude]
  );

  useEffect(() => {
    if (!mapRef.current || points.length === 0) return;
    if (points.length === 1) {
      mapRef.current.animateToRegion?.({ ...points[0], latitudeDelta: 0.02, longitudeDelta: 0.02 }, 400);
    } else {
      mapRef.current.fitToCoordinates?.(points, { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: true });
    }
  }, [points]);

  const fallback = (
    <View style={[styles.fallback, style]}>
      <Ionicons name="map-outline" size={28} color={colors.textSubtle} />
      <Text style={styles.fallbackText}>
        {Maps ? 'The map could not be shown.' : 'Update the WopeCar app to see the live map.'}
      </Text>
    </View>
  );
  if (!Maps) return fallback;

  const { default: MapView, Marker, Polyline, PROVIDER_GOOGLE } = Maps;
  const initial = points[0] ?? { latitude: 5.6037, longitude: -0.187 }; // Accra

  return (
    <MapErrorBoundary fallback={fallback}>
      <MapView
        ref={mapRef}
        style={[styles.map, style]}
        provider={useGoogle ? PROVIDER_GOOGLE : undefined}
        initialRegion={{ ...initial, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
        showsCompass={false}
        toolbarEnabled={false}
      >
        {route.length > 1 && <Polyline coordinates={route} strokeColor={COLORS.teal} strokeWidth={4} />}
        {destination && (
          <Marker coordinate={destination} title={destinationLabel} pinColor={COLORS.navy} />
        )}
        {officer && (
          <Marker coordinate={{ latitude: officer.latitude, longitude: officer.longitude }} title={officerLabel} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.officerPin}>
              <Ionicons name="car-sport" size={16} color="#ffffff" />
            </View>
          </Marker>
        )}
      </MapView>
    </MapErrorBoundary>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    map: { width: '100%', height: 220, borderRadius: 12 },
    fallback: {
      width: '100%', height: 160, borderRadius: 12, backgroundColor: colors.highlight,
      alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16,
    },
    fallbackText: { fontFamily: FONTS.medium, fontSize: 13, color: colors.textSubtle, textAlign: 'center' },
    officerPin: {
      width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.teal, alignItems: 'center', justifyContent: 'center',
      borderWidth: 2, borderColor: '#ffffff',
    },
  });
}
