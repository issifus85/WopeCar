import { StyleSheet, Text, View } from 'react-native';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { DRIVER_STATUS_LABELS } from '../../services/wopedriverApi';

export default function DriverStatusPill({ status }) {
  const { colors } = useAppTheme();
  const tone = status === 'confirmed' || status === 'in_progress' || status === 'completed'
    ? { bg: colors.successBg, fg: colors.success }
    : status === 'requested' ? { bg: colors.warningBg, fg: colors.warning } : { bg: colors.errorBg, fg: colors.error };
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.fg }]}>{DRIVER_STATUS_LABELS[status] ?? status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  text: { fontFamily: FONTS.semiBold, fontSize: 11 },
});
