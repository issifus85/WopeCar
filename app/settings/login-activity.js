import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View, FlatList, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import * as devicesApi from '../../services/devicesApi';
import DeviceRow from '../../components/DeviceRow';

export default function LoginActivityScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [activity, setActivity] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(() => {
    setIsLoading(true);
    devicesApi.getLoginActivity()
      .then(setActivity)
      .catch(() => setActivity([]))
      .finally(() => setIsLoading(false));
  }, []);

  useFocusEffect(load);

  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.intro}>A history of every sign-in to your account, most recent first.</Text>

      {activity.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="time-outline" size={32} color={colors.disabled} />
          <Text style={styles.emptyStateText}>No login activity yet.</Text>
        </View>
      ) : (
        <FlatList
          data={activity}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.card}
          renderItem={({ item, index }) => (
            <DeviceRow
              device={item}
              last={index === activity.length - 1}
              right={
                <View style={[styles.statusPill, item.revokedAt ? styles.statusPillInactive : styles.statusPillActive]}>
                  <Text style={[styles.statusPillText, item.revokedAt ? styles.statusPillTextInactive : styles.statusPillTextActive]}>
                    {item.revokedAt ? 'Signed out' : 'Active'}
                  </Text>
                </View>
              }
            />
          )}
        />
      )}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: 16,
    },
    centerState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    intro: {
      fontFamily: FONTS.regular,
      fontSize: 13,
      color: colors.textSubtle,
      lineHeight: 19,
      marginBottom: 16,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      paddingHorizontal: 16,
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
    },
    statusPill: {
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    statusPillActive: {
      backgroundColor: colors.highlight,
    },
    statusPillInactive: {
      backgroundColor: colors.divider,
    },
    statusPillText: {
      fontFamily: FONTS.semiBold,
      fontSize: 11,
    },
    statusPillTextActive: {
      color: colors.teal,
    },
    statusPillTextInactive: {
      color: colors.textSubtle,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingBottom: 80,
    },
    emptyStateText: {
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: colors.textSubtle,
    },
  });
}
