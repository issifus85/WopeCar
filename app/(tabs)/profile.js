import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, FONTS } from '../../constants/theme';

export default function ProfileScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Text style={styles.subtitle}>Sign in to manage your account.</Text>
      <TouchableOpacity
        style={styles.signInButton}
        onPress={() => router.push('/login')}
      >
        <Text style={styles.signInButtonText}>Sign In</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontFamily: FONTS.bold,
    fontSize: 22,
    color: COLORS.navy,
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: FONTS.regular,
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  signInButton: {
    backgroundColor: COLORS.teal,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 10,
  },
  signInButtonText: {
    fontFamily: FONTS.semiBold,
    color: '#ffffff',
    fontSize: 15,
  },
});
