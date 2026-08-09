import { useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { useAppTheme } from '../../contexts/ThemeContext';
import { FONTS } from '../../constants/theme';
import AdminHeader from '../../components/admin/AdminHeader';

// Protected entry point for every app/admin/* screen. Gate check happens
// here, once, rather than per-screen - anything nested under this layout is
// only ever reached after this passes. Redirect target is /(tabs)/profile
// per spec, matching how a signed-out visitor already lands on a normal
// screen rather than a dead end elsewhere in the app.
export default function AdminLayout() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const { colors } = useAppTheme();

  // Sticky "admin access already confirmed" flag - AuthContext's isLoading
  // can flip true again later (e.g. its onAuthStateChange listener re-runs
  // refresh() on a background token refresh near session expiry), which
  // isn't a real "still figuring out who you are" state once we've already
  // confirmed role==='admin' once. Without this, that harmless later blip
  // would re-trigger the full-screen spinner below and block the whole
  // admin panel on every background refresh - every other screen in the
  // app tolerates this fine since none of them gate their entire render on
  // isLoading the way this one deliberately does for security.
  const hasConfirmedAdmin = useRef(false);
  if (!isLoading && user?.role === 'admin') {
    hasConfirmedAdmin.current = true;
  }

  useEffect(() => {
    if (isLoading) return;
    if (user?.role !== 'admin') {
      router.replace('/(tabs)/profile');
    }
  }, [isLoading, user, router]);

  // Same "blank while we know for sure" gate BiometricGate/vendor screens
  // already use elsewhere in this app - never briefly flashes admin content
  // to a non-admin user while the redirect above is still in flight.
  if (!hasConfirmedAdmin.current && (isLoading || user?.role !== 'admin')) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: () => <AdminHeader />,
        headerBackTitle: 'Back',
        headerTintColor: colors.textPrimary,
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { fontFamily: FONTS.semiBold },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="users" />
      <Stack.Screen name="vendors" />
      <Stack.Screen name="cars" />
      <Stack.Screen name="reviews" />
      <Stack.Screen name="car/edit/[id]" />
      <Stack.Screen name="car/pricing/[id]" />
      <Stack.Screen name="car/availability/[id]" />
      <Stack.Screen name="booking/[id]" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
