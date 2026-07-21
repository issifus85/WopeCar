import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, FlatList, ActivityIndicator, Switch, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import * as devicesApi from '../../services/devicesApi';
import DeviceRow from '../../components/DeviceRow';
import ConfirmModal from '../../components/ConfirmModal';

export default function ActiveDevicesScreen() {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [devices, setDevices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingRevoke, setPendingRevoke] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    setIsLoading(true);
    devicesApi.getDevices()
      .then(setDevices)
      .catch(() => setDevices([]))
      .finally(() => setIsLoading(false));
  }, []);

  useFocusEffect(load);

  const handleToggleTrust = async (device) => {
    setBusyId(device.id);
    try {
      const updated = device.isTrusted
        ? await devicesApi.untrustDevice(device.id)
        : await devicesApi.trustDevice(device.id);
      setDevices((prev) => prev.map((d) => (d.id === device.id ? { ...d, isTrusted: updated.isTrusted } : d)));
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not update this device.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmRevoke = async () => {
    const device = pendingRevoke;
    setPendingRevoke(null);
    if (!device) return;
    try {
      await devicesApi.revokeDevice(device.id);
      setDevices((prev) => prev.filter((d) => d.id !== device.id));
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not sign out this device.');
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
      <Text style={styles.intro}>Devices currently signed in to your account. Trusting a device skips extra Security Alerts checks for it.</Text>

      {devices.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="phone-portrait-outline" size={32} color={colors.disabled} />
          <Text style={styles.emptyStateText}>No active sessions found.</Text>
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
                <View style={styles.actions}>
                  {busyId === item.id ? (
                    <ActivityIndicator color={colors.teal} />
                  ) : (
                    <Switch
                      value={item.isTrusted}
                      onValueChange={() => handleToggleTrust(item)}
                      trackColor={{ false: colors.disabled, true: colors.teal }}
                      thumbColor={colors.white}
                    />
                  )}
                  {!item.isCurrent && (
                    <TouchableOpacity onPress={() => setPendingRevoke(item)} hitSlop={8}>
                      <Ionicons name="log-out-outline" size={20} color={colors.error} />
                    </TouchableOpacity>
                  )}
                </View>
              }
            />
          )}
        />
      )}

      <ConfirmModal
        visible={!!pendingRevoke}
        title="Sign Out Device"
        message="This device will need to sign in again to access your account."
        confirmLabel="Sign Out"
        destructive
        onConfirm={confirmRevoke}
        onCancel={() => setPendingRevoke(null)}
      />
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
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
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
