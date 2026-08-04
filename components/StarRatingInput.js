import { useMemo } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { useAppTheme } from '../contexts/ThemeContext';

const STAR_COLOR = '#F5A623'; // matches ReviewsSection.js's existing star color

/** Tap-to-select 1-5 star input, used by the review form for the overall rating and each category. */
export default function StarRatingInput({ label, value, onChange, size = 28 }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.row}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.stars}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity key={star} onPress={() => onChange(star)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
            <Ionicons
              name={star <= (value ?? 0) ? 'star' : 'star-outline'}
              size={size}
              color={star <= (value ?? 0) ? STAR_COLOR : colors.disabled}
            />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
    },
    label: {
      fontFamily: FONTS.medium,
      fontSize: 14,
      color: colors.textPrimary,
      flex: 1,
    },
    stars: {
      flexDirection: 'row',
      gap: 4,
    },
  });
}
