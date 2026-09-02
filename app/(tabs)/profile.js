import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert, PixelRatio } from 'react-native';
import { Image } from 'expo-image';
import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useInbox } from '../../contexts/InboxContext';
import { useSettings } from '../../contexts/SettingsContext';
import { getVendorProfile } from '../../services/vendorCarsApi';
import { resizeImageUrl, CAR_PHOTO_BLURHASH } from '../../utils/imageUrl';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const AVATAR_SIZE = 52;

const BASE_MENU_ITEMS = [
  { label: 'Inbox', icon: 'mail-outline', route: '/inbox' },
  { label: 'Documents', icon: 'folder-outline', route: '/documents' },
  { label: 'Protection Plan', icon: 'shield-checkmark-outline', route: '/protection-plan' },
  { label: 'Terms of Service', icon: 'document-text-outline', route: '/terms' },
  { label: 'Privacy Policy', icon: 'shield-checkmark-outline', route: '/privacy' },
  { label: 'Support', icon: 'help-buoy-outline', route: '/support' },
  { label: 'Settings', icon: 'settings-outline', route: '/settings' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { totalUnreadCount } = useInbox();
  const { updateSetting } = useSettings();

  // Gated - a user needs a real vendor row before Vendor Mode opens (see
  // app/vendor/apply.js). appMode is deliberately not flipped here for a
  // first-time applicant; apply.js's handleDone flips it once the row is
  // confirmed created. Signed-out visitors go to /login first, matching the
  // renter-side account row's own `user ? '/account' : '/login'` pattern.
  const switchToHostMode = async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    try {
      const vendor = await getVendorProfile();
      if (vendor) {
        updateSetting('appMode', 'vendor');
        router.push('/vendor');
      } else {
        router.push('/vendor/apply');
      }
    } catch (e) {
      Alert.alert('Something went wrong', e?.message || 'Please try again.');
    }
  };

  const MENU_ITEMS = useMemo(() => {
    let items = BASE_MENU_ITEMS;
    if (user?.isSupport) {
      const inboxIndex = items.findIndex((item) => item.route === '/inbox');
      const staffInboxItem = { label: 'Ride Support', icon: 'chatbubble-ellipses-outline', route: '/staff-inbox' };
      items = [...items.slice(0, inboxIndex + 1), staffInboxItem, ...items.slice(inboxIndex + 1)];
    }
    // Admin Panel sits above every other row, including Ride Support - it's
    // a separate, higher-privilege area (role='admin'), not a support-staff
    // convenience like Ride Support (is_support).
    if (user?.role === 'admin') {
      items = [{ label: 'Admin Panel', icon: 'shield-checkmark-outline', route: '/admin' }, ...items];
    }
    return items;
  }, [user?.isSupport, user?.role]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Account</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <TouchableOpacity
        style={styles.accountRow}
        onPress={() => router.push(user ? '/account' : '/login')}
      >
        {user?.avatar ? (
          <Image
            source={{ uri: resizeImageUrl(user.avatar, { width: AVATAR_SIZE * PixelRatio.get(), height: AVATAR_SIZE * PixelRatio.get() }) }}
            style={styles.avatarImage}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={200}
            placeholder={CAR_PHOTO_BLURHASH}
            placeholderContentFit="cover"
          />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {user?.name?.charAt(0)?.toUpperCase() ?? '?'}
            </Text>
          </View>
        )}
        <View style={styles.accountInfo}>
          <Text style={styles.accountName}>{user?.name ?? 'Sign In'}</Text>
          <Text style={styles.accountSubtitle}>
            {user?.email ?? 'Manage your account'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.hostRow} onPress={switchToHostMode}>
        <View style={styles.hostIcon}>
          <Ionicons name="car-sport-outline" size={20} color={colors.teal} />
        </View>
        <View style={styles.accountInfo}>
          <Text style={styles.hostTitle}>Switch to Host Mode</Text>
          <Text style={styles.accountSubtitle}>Manage your fleet and bookings as a vendor</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
      </TouchableOpacity>

      <View style={styles.menu}>
        {MENU_ITEMS.map((item, index) => (
          <TouchableOpacity
            key={item.route}
            style={[
              styles.menuRow,
              index === MENU_ITEMS.length - 1 && styles.menuRowLast,
            ]}
            onPress={() => router.push(item.route)}
          >
            <View style={styles.menuIcon}>
              <Ionicons name={item.icon} size={20} color={colors.teal} />
            </View>
            <Text style={styles.menuLabel}>{item.label}</Text>
            {item.route === '/inbox' && totalUnreadCount > 0 && (
              <View style={styles.menuBadge}>
                <Text style={styles.menuBadgeText}>{totalUnreadCount}</Text>
              </View>
            )}
            <Ionicons name="chevron-forward" size={20} color={colors.textSubtle} />
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.footer}>
        <Image
          source={require('../../assets/logo-mark-navy.png')}
          style={styles.footerLogo}
          contentFit="contain"
        />
        <Text style={styles.footerVersion}>WopeCar App v{APP_VERSION}</Text>
        <Text style={styles.footerSubsidiary}>A subsidiary of ACRE Logistics GH.</Text>
      </View>
      </ScrollView>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingTop: 60,
      paddingBottom: 16,
      paddingHorizontal: 20,
    },
    scrollContent: {
      paddingBottom: 140,
    },
    headerTitle: {
      fontFamily: FONTS.bold,
      fontSize: 24,
      color: colors.textPrimary,
    },
    accountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      marginHorizontal: 16,
      borderRadius: 14,
      padding: 16,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.teal,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarImage: {
      width: 52,
      height: 52,
      borderRadius: 26,
    },
    avatarText: {
      fontFamily: FONTS.bold,
      fontSize: 20,
      color: colors.white,
    },
    accountInfo: {
      flex: 1,
      marginLeft: 14,
    },
    accountName: {
      fontFamily: FONTS.semiBold,
      fontSize: 16,
      color: colors.textPrimary,
    },
    accountSubtitle: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      marginTop: 2,
    },
    hostRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.highlight,
      marginHorizontal: 16,
      marginTop: 12,
      borderRadius: 14,
      padding: 16,
    },
    hostIcon: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hostTitle: {
      fontFamily: FONTS.semiBold,
      fontSize: 15,
      color: colors.textPrimary,
    },
    menu: {
      backgroundColor: colors.surface,
      marginHorizontal: 16,
      marginTop: 20,
      borderRadius: 14,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 3,
      overflow: 'hidden',
    },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    menuRowLast: {
      borderBottomWidth: 0,
    },
    menuIcon: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    menuLabel: {
      flex: 1,
      fontFamily: FONTS.medium,
      fontSize: 15,
      color: colors.textPrimary,
      marginLeft: 14,
    },
    menuBadge: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      paddingHorizontal: 5,
      backgroundColor: colors.teal,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
    },
    menuBadgeText: {
      fontFamily: FONTS.bold,
      fontSize: 11,
      color: colors.white,
    },
    footer: {
      alignItems: 'center',
      marginTop: 28,
      paddingHorizontal: 20,
    },
    footerLogo: {
      width: 40,
      height: 46,
      marginBottom: 10,
    },
    footerVersion: {
      fontFamily: FONTS.medium,
      fontSize: 12,
      color: colors.textSubtle,
    },
    footerSubsidiary: {
      fontFamily: FONTS.regular,
      fontSize: 11,
      color: colors.textSubtle,
      marginTop: 2,
    },
  });
}
