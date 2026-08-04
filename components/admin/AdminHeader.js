import { useMemo } from 'react';
import { StyleSheet, Text, View, Image } from 'react-native';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';

// Shared native-header title for every screen under app/admin/ - set once
// via admin/_layout.js's Stack screenOptions.headerTitle, not per-screen, so
// "logo + Admin Panel" stays identical everywhere the way a lightweight
// internal tool's chrome should, and back navigation between admin screens
// is the Stack's own native back button rather than something hand-built.
export default function AdminHeader() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.wrap}>
      <Image source={require('../../assets/logo-mark-navy.png')} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>Admin Panel</Text>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    wrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    logo: {
      width: 22,
      height: 25,
    },
    title: {
      fontFamily: FONTS.bold,
      fontSize: 17,
      color: colors.textPrimary,
    },
  });
}
