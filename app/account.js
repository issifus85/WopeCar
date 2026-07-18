import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { COLORS, FONTS } from '../constants/theme';
import { useAuth } from '../contexts/AuthContext';

export default function AccountScreen() {
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.teal} />
      </View>
    );
  }

  if (user) {
    return (
      <View style={styles.container}>
        {user.avatar ? (
          <Image source={{ uri: user.avatar }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user.name?.charAt(0)?.toUpperCase() ?? '?'}
            </Text>
          </View>
        )}
        <Text style={styles.title}>{user.name}</Text>
        <Text style={styles.subtitle}>{user.email}</Text>
        <TouchableOpacity style={styles.signOutButton} onPress={logout}>
          <Text style={styles.signOutButtonText}>Log Out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Account</Text>
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
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.teal,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    marginBottom: 16,
  },
  avatarText: {
    fontFamily: FONTS.bold,
    fontSize: 28,
    color: '#ffffff',
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
  signOutButton: {
    borderWidth: 1,
    borderColor: '#C62828',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 10,
  },
  signOutButtonText: {
    fontFamily: FONTS.semiBold,
    color: '#C62828',
    fontSize: 15,
  },
});
