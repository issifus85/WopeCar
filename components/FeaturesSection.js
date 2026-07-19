import { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../constants/theme';

// The API doesn't return a per-feature icon for this dataset (image_id/icon
// are null), so features are matched to a reasonable Ionicon by slug. Falls
// back to a generic checkmark for anything not in this list.
const FEATURE_ICONS = {
  'airbag': 'shield-checkmark-outline',
  'fm-radio': 'radio-outline',
  'bluetooth': 'bluetooth-outline',
  'lane-assist': 'navigate-outline',
  'cruise-control': 'speedometer-outline',
  'backup-camera': 'camera-outline',
  'apple-carplay-android-auto': 'phone-portrait-outline',
  'navigation-system': 'map-outline',
  'multi-function-display': 'tv-outline',
  'push-to-start': 'power-outline',
  'remote-start': 'key-outline',
  'heated-seats': 'flame-outline',
  'blind-spot-monitoring': 'eye-outline',
  'steering-wheel': 'car-sport-outline',
};

const DEFAULT_FEATURE_ICON = 'checkmark-circle-outline';
const COLLAPSED_COUNT = 6;

export default function FeaturesSection({ features }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!features?.length) return null;

  const visibleFeatures = isExpanded ? features : features.slice(0, COLLAPSED_COUNT);
  const hasMore = features.length > COLLAPSED_COUNT;

  return (
    <View>
      <Text style={styles.sectionHeading}>Features</Text>
      <View style={styles.grid}>
        {visibleFeatures.map((feature) => (
          <View key={feature.id} style={styles.featureItem}>
            <Ionicons
              name={FEATURE_ICONS[feature.slug] ?? DEFAULT_FEATURE_ICON}
              size={18}
              color={COLORS.teal}
            />
            <Text style={styles.featureText}>{feature.title}</Text>
          </View>
        ))}
      </View>
      {hasMore && (
        <TouchableOpacity onPress={() => setIsExpanded(v => !v)} style={styles.toggleButton}>
          <Text style={styles.toggleText}>
            {isExpanded ? 'Show Less' : `Show All ${features.length} Features`}
          </Text>
          <Ionicons
            name={isExpanded ? 'chevron-up' : 'chevron-down'}
            size={16}
            color={COLORS.teal}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeading: {
    fontFamily: FONTS.bold,
    fontSize: 16,
    color: COLORS.navy,
    marginTop: 24,
    marginBottom: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 14,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '50%',
  },
  featureText: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#444',
    flexShrink: 1,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 14,
    paddingVertical: 8,
  },
  toggleText: {
    fontFamily: FONTS.semiBold,
    fontSize: 13,
    color: COLORS.teal,
  },
});
