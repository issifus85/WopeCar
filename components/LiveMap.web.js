import { Component, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';

// Web version of components/LiveMap.js. react-native-maps is native-only, and Metro fails the whole web bundle (which `eas update`
// exports alongside iOS and Android) if it is even referenced. The live map is app-only by design, so the web shows a short note.

class MapErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function LiveMap({ style }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.fallback, style]}>
      <Ionicons name="map-outline" size={22} color={colors.textSubtle} />
      <Text style={styles.fallbackText}>The live map is available in the WopeCar app.</Text>
    </View>
  );
}

const Maps = null;
const useGoogle = false;
export { Maps as mapsModule, useGoogle as useGoogleMaps, MapErrorBoundary };

function createStyles(colors) {
  return StyleSheet.create({
    fallback: { alignItems: 'center', justifyContent: 'center', padding: 16, minHeight: 160, backgroundColor: colors.highlight, borderRadius: 12 },
    fallbackText: { fontFamily: FONTS.medium, fontSize: 13, color: colors.textSubtle, textAlign: 'center', marginTop: 6 },
  });
}
