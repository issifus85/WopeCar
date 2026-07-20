import { useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

export default function AboutScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.logoWrap}>
        <Image source={require('../../assets/logo-mark-navy.png')} style={styles.logo} resizeMode="contain" />
      </View>

      <Text style={styles.appName}>WopeCar</Text>
      <Text style={styles.version}>Version {APP_VERSION}</Text>

      <Text style={styles.body}>
        WopeCar is an online car-sharing platform connecting vehicle owners with travellers and locals across Ghana looking to rent a car, self-drive or with a chauffeur.
      </Text>
      <Text style={styles.subsidiary}>A subsidiary of ACRE Logistics GH.</Text>

      <View style={styles.linkList}>
        <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/terms')}>
          <Text style={styles.linkLabel}>Terms & Conditions</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.linkRow, styles.linkRowLast]} onPress={() => router.push('/privacy')}>
          <Text style={styles.linkLabel}>Privacy Policy</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    padding: 20,
    paddingBottom: 48,
    alignItems: 'center',
  },
  logoWrap: {
    marginTop: 12,
    marginBottom: 16,
  },
  logo: {
    width: 64,
    height: 64,
  },
  appName: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: colors.textPrimary,
  },
  version: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: colors.textSubtle,
    marginTop: 2,
    marginBottom: 20,
  },
  body: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: colors.textBody,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 10,
  },
  subsidiary: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: colors.textSubtle,
    marginBottom: 28,
  },
  linkList: {
    width: '100%',
    backgroundColor: colors.background,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  linkRowLast: {
    borderBottomWidth: 0,
  },
  linkLabel: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: colors.textPrimary,
  },
  });
}
