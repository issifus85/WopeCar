import { StyleSheet, Text, View, TouchableOpacity, Image, ScrollView } from 'react-native';
import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useInbox } from '../../contexts/InboxContext';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

const MENU_ITEMS = [
  { label: 'Inbox', icon: 'mail-outline', route: '/inbox' },
  { label: 'Documents', icon: 'folder-outline', route: '/documents' },
  { label: 'Terms of Service', icon: 'document-text-outline', route: '/terms' },
  { label: 'Privacy Policy', icon: 'shield-checkmark-outline', route: '/privacy' },
  { label: 'Settings', icon: 'settings-outline', route: '/settings' },
];

export default function ProfileScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { totalUnreadCount } = useInbox();

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
          <Image source={{ uri: user.avatar }} style={styles.avatarImage} />
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
      paddingBottom: 32,
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
