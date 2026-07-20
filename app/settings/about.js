import { StyleSheet, Text, View, ScrollView, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../constants/theme';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

export default function AboutScreen() {
  const router = useRouter();

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
          <Ionicons name="chevron-forward" size={18} color="#999" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/privacy')}>
          <Text style={styles.linkLabel}>Privacy Policy</Text>
          <Ionicons name="chevron-forward" size={18} color="#999" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
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
    color: COLORS.navy,
  },
  version: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: '#888',
    marginTop: 2,
    marginBottom: 20,
  },
  body: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: '#444',
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 10,
  },
  subsidiary: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#999',
    marginBottom: 28,
  },
  linkList: {
    width: '100%',
    backgroundColor: COLORS.background,
    borderRadius: 14,
    paddingHorizontal: 16,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5e5',
  },
  linkLabel: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: COLORS.navy,
  },
});
