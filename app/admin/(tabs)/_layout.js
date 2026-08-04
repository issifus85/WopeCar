import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../../constants/theme';
import { useAppTheme } from '../../../contexts/ThemeContext';
import AdminHeader from '../../../components/admin/AdminHeader';
import FloatingTabBar from '../../../components/FloatingTabBar';

// Admin's own 4-tab bottom bar - mirrors the vendor/(tabs) pattern (a Menu
// catch-all tab for everything not directly tabbed: Users, Vendors, Cars,
// Settings stay reachable from there and from the Dashboard's Manage grid).
// Unlike client/vendor, admin keeps its native header (AdminHeader) shown
// per-tab rather than a custom in-screen header, matching how the rest of
// admin/_layout.js's Stack already renders it.
export default function AdminTabLayout() {
  const { colors } = useAppTheme();

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: true,
        headerTitle: () => <AdminHeader />,
        headerTintColor: colors.textPrimary,
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { fontFamily: FONTS.semiBold },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'Bookings',
          tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Menu',
          tabBarIcon: ({ color, size }) => <Ionicons name="menu-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
