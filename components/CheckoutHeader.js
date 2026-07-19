import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../constants/theme';

const TOTAL_STEPS = 6;

export default function CheckoutHeader({ title, step }) {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
        <Ionicons name="chevron-back" size={24} color={COLORS.navy} />
      </TouchableOpacity>
      <View style={styles.titleWrap}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.step}>Step {step} of {TOTAL_STEPS}</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${(step / TOTAL_STEPS) * 100}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  titleWrap: {
    marginTop: 12,
    marginBottom: 12,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 20,
    color: COLORS.navy,
  },
  step: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#eee',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.teal,
    borderRadius: 2,
  },
});
