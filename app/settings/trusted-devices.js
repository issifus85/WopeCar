import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import * as devicesApi from '../../services/devicesApi';
import DeviceRow from '../../components/DeviceRow';

export default function TrustedDevicesScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [devices, setDevices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setIsLoading(true);
    devicesApi.getDevices()
      .then((all) => setDevices(all.filter((d) => d.isTrusted)))
      .catch(() => setDevices([]))
      .finally(() => setIsLoading(false));
  }, []);

  useFocusEffect(load);

  const handleUntrust = async (device) => {
    setBusyId(device.id);
    try {
      await devicesApi.untrustDevice(device.id);
      setDevices((prev) => prev.filter((d) => d.id !== device.id));
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not update this device.');
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={colors.teal} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.intro}>Devices you've marked as trusted. Manage which ones from Active Devices.</Text>

      {devices.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="shield-checkmark-outline" size={32} color={colors.disabled} />
          <Text style={styles.emptyStateText}>No trusted devices yet.</Text>
          <Text style={styles.emptyStateSubtext}>Trust a device from Active Devices to see it here.</Text>
        </View>
      ) : (
        <FlatList
          data={devices}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.card}
          renderItem={({ item, index }) => (
            <DeviceRow
              device={item}
              last={index === devices.length - 1}
              right={
                busyId === item.id ? (
                  <ActivityIndicator color={colors.teal} />
                ) : (
                  <TouchableOpacity onPress={() => handleUntrust(item)}>
                    <Text style={styles.untrustText}>Untrust</Text>
                  </TouchableOpacity>
                )
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
    untrustText: {
      fontFamily: FONTS.semiBold,
      fontSize: 13,
      color: colors.error,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingBottom: 80,
      paddingHorizontal: 32,
    },
    emptyStateText: {
      fontFamily: FONTS.medium,
      fontSize: 14,
      color: colors.textSubtle,
    },
    emptyStateSubtext: {
      fontFamily: FONTS.regular,
      fontSize: 12,
      color: colors.textSubtle,
      textAlign: 'center',
    },
  });
}
