import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../constants/theme';
import { formatRelativeTime } from '../constants/dateUtils';
import { useAppTheme } from '../contexts/ThemeContext';

// Shortens a raw User-Agent string down to something readable in a list
// row - this app has no device-name concept client-side, so the UA string
// (captured server-side at login) is all there is to identify a session.
function summarizeUserAgent(userAgent) {
  if (!userAgent) return 'Unknown device';
  if (userAgent.length <= 40) return userAgent;
  return `${userAgent.slice(0, 40)}…`;
}

export default function DeviceRow({ device, right, last }) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.row, last && styles.rowLast]}>
      <View style={styles.icon}>
        <Ionicons name="phone-portrait-outline" size={18} color={colors.teal} />
      </View>
      <View style={styles.info}>
        <View style={styles.titleRow}>
          <Text style={styles.deviceText} numberOfLines={1}>{summarizeUserAgent(device.userAgent)}</Text>
          {device.isCurrent && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>This device</Text>
            </View>
          )}
        </View>
        <Text style={styles.subText}>
          {device.ipAddress ?? 'Unknown IP'} · {device.revokedAt
            ? `Signed out ${formatRelativeTime(device.revokedAt)}`
            : `Active ${formatRelativeTime(device.lastActiveAt ?? device.loginAt)}`}
        </Text>
      </View>
      {right}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    rowLast: {
      borderBottomWidth: 0,
    },
    icon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.highlight,
      alignItems: 'center',
      justifyContent: 'center',
    },
    info: {
      flex: 1,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    deviceText: {
      flexShrink: 1,
      fontFamily: FONTS.medium,
      fontSize: 14,
      color: colors.textPrimary,
    },
    badge: {
      backgroundColor: colors.teal,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    badgeText: {
      fontFamily: FONTS.semiBold,
      fontSize: 10,
      color: colors.white,
    },
    subText: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      marginTop: 2,
    },
  });
}
