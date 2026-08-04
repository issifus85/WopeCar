import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View, TouchableOpacity, ScrollView, Switch, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Updates from 'expo-updates';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { requestPushPermission } from '../../services/pushNotifications';
import * as accountApi from '../../services/accountApi';
import { CATEGORIES } from '../../data/cars';
import OptionPickerModal from '../../components/OptionPickerModal';
import ConfirmModal from '../../components/ConfirmModal';

// Taps on "App Version" needed to unlock Developer Mode - same iOS-style
// hidden-unlock pattern as Settings > About in stock phone OSes.
const DEV_MODE_UNLOCK_TAPS = 7;

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const VEHICLE_CATEGORIES = CATEGORIES.filter((c) => c.value !== 'All').map((c) => c.label);

function Section({ title, children, styles }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Row({ label, subtitle, onPress, right, last, styles }) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper style={[styles.row, last && styles.rowLast]} onPress={onPress} activeOpacity={onPress ? 0.6 : 1}>
      <View style={styles.rowLabelWrap}>
        <Text style={styles.rowLabel}>{label}</Text>
        {!!subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      {right}
    </Wrapper>
  );
}

function ToggleRow({ label, subtitle, settingsKey, last, styles, colors, onToggle, disabled }) {
  const { settings, updateSetting } = useSettings();
  return (
    <Row
      label={label}
      subtitle={subtitle}
      last={last}
      styles={styles}
      right={
        <Switch
          value={!!settings[settingsKey]}
          onValueChange={(value) => (onToggle ? onToggle(value) : updateSetting(settingsKey, value))}
          trackColor={{ false: colors.disabled, true: colors.teal }}
          thumbColor={colors.white}
          disabled={disabled}
        />
      }
    />
  );
}

function PickerRow({ label, settingsKey, options, last, onOpen, styles, colors }) {
  const { settings } = useSettings();
  return (
    <Row
      label={label}
      last={last}
      styles={styles}
      onPress={() => onOpen({ label, settingsKey, options, value: settings[settingsKey] })}
      right={
        <View style={styles.valueRow}>
          <Text style={styles.rowValue}>{settings[settingsKey]}</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />
        </View>
      }
    />
  );
}

function NavRow({ label, subtitle, last, onPress, styles, colors }) {
  return (
    <Row
      label={label}
      subtitle={subtitle}
      last={last}
      onPress={onPress}
      styles={styles}
      right={<Ionicons name="chevron-forward" size={18} color={colors.textSubtle} />}
    />
  );
}

function StaticRow({ label, value, last, onPress, styles }) {
  return (
    <Row
      label={label}
      last={last}
      onPress={onPress}
      styles={styles}
      right={<Text style={styles.rowValue}>{value}</Text>}
    />
  );
}

// Unlike every other ToggleRow here, this one is backed by a real server
// preference (GET/PUT /api/account/security-alerts), not the local-only
// SettingsContext - so it manages its own fetch/save state rather than
// reusing ToggleRow.
function SecurityAlertsRow({ last, styles, colors }) {
  const [enabled, setEnabled] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    accountApi.getSecurityAlerts().then(setEnabled).catch(() => setEnabled(false));
  }, []);

  const handleToggle = async (value) => {
    const previous = enabled;
    setEnabled(value);
    setIsSaving(true);
    try {
      await accountApi.updateSecurityAlerts(value);
    } catch (e) {
      setEnabled(previous);
      Alert.alert('Error', 'Could not update this setting.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Row
      label="Security Alerts"
      subtitle="Receive suspicious login notifications"
      last={last}
      styles={styles}
      right={
        enabled === null ? (
          <ActivityIndicator color={colors.teal} />
        ) : (
          <Switch
            value={enabled}
            onValueChange={handleToggle}
            disabled={isSaving}
            trackColor={{ false: colors.disabled, true: colors.teal }}
            thumbColor={colors.white}
          />
        )
      }
    />
  );
}

// Face ID / Fingerprint - client-only (see components/BiometricGate.js for
// where it actually locks the app), so unlike most rows here this isn't
// blocked on the backend. Confirms the device can actually authenticate
// before flipping the setting on, same honesty pattern as Push
// Notifications' permission check above.
function BiometricLoginRow({ last, styles, colors }) {
  const { settings, updateSetting } = useSettings();
  const [isChecking, setIsChecking] = useState(false);

  const handleToggle = async (value) => {
    if (!value) {
      updateSetting('biometricLogin', false);
      return;
    }
    if (Platform.OS === 'web') {
      Alert.alert('Not Available', 'Biometric login is only available on the WopeCar mobile app.');
      return;
    }
    setIsChecking(true);
    try {
      const [hasHardware, isEnrolled] = await Promise.all([
        LocalAuthentication.hasHardwareAsync(),
        LocalAuthentication.isEnrolledAsync(),
      ]);
      if (!hasHardware) {
        Alert.alert('Not Available', "This device doesn't support Face ID or Fingerprint login.");
        return;
      }
      if (!isEnrolled) {
        Alert.alert('Not Set Up', 'Set up Face ID or Fingerprint in your device settings first, then try again.');
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Confirm to enable biometric login' });
      if (result.success) {
        updateSetting('biometricLogin', true);
      }
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <Row
      label="Biometric Login"
      subtitle="Face ID / Fingerprint"
      last={last}
      styles={styles}
      right={
        isChecking ? (
          <ActivityIndicator color={colors.teal} />
        ) : (
          <Switch
            value={!!settings.biometricLogin}
            onValueChange={handleToggle}
            trackColor={{ false: colors.disabled, true: colors.teal }}
            thumbColor={colors.white}
          />
        )
      }
    />
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { updateSetting } = useSettings();
  const { currencies } = useCurrency();
  const currencyOptions = useMemo(() => currencies.map((c) => c.code), [currencies]);

  const [picker, setPicker] = useState(null);
  const [comingSoon, setComingSoon] = useState(null);
  // null | 'confirm' | 'clearing' | 'done' - drives the shared Cache
  // Management / Clear Cache flow (both rows below call openClearCache).
  const [cacheStep, setCacheStep] = useState(null);
  const [devTapCount, setDevTapCount] = useState(0);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

  const openPicker = (config) => setPicker(config);
  const closePicker = () => setPicker(null);
  const handlePickerSelect = (value) => {
    if (picker) updateSetting(picker.settingsKey, value);
  };

  const openComingSoon = (label) => {
    setComingSoon(label);
  };
  const closeComingSoon = () => setComingSoon(null);

  const openClearCache = () => setCacheStep('confirm');
  const closeCacheModal = () => setCacheStep(null);
  const handleClearCache = async () => {
    await Promise.all([Image.clearMemoryCache(), Image.clearDiskCache()]);
    setCacheStep('done');
  };

  const handlePushToggle = async (value) => {
    if (!value) {
      updateSetting('pushNotifications', false);
      return;
    }
    const granted = await requestPushPermission();
    if (granted) {
      updateSetting('pushNotifications', true);
    } else {
      updateSetting('pushNotifications', false);
      Alert.alert(
        'Notifications Blocked',
        "Notifications are blocked at the system level, so WopeCar can't send them. Enable notifications for this app in your device or browser settings, then try again."
      );
    }
  };

  const handleAppVersionTap = () => {
    const next = devTapCount + 1;
    if (next >= DEV_MODE_UNLOCK_TAPS) {
      setDevTapCount(0);
      router.push('/settings/developer-mode');
      return;
    }
    setDevTapCount(next);
    if (next >= DEV_MODE_UNLOCK_TAPS - 3) {
      Alert.alert('', `You are ${DEV_MODE_UNLOCK_TAPS - next} taps away from Developer Mode.`);
    }
  };

  // expo-updates is only meaningfully "on" in a build published through EAS
  // Update (Updates.isEnabled is false in Expo Go and regular dev/preview
  // builds like this one) - rather than pretend to check, this says so
  // honestly instead of always reporting "up to date".
  const handleCheckForUpdates = async () => {
    if (!Updates.isEnabled) {
      Alert.alert('Updates Not Available', "This build isn't set up to receive over-the-air updates.");
      return;
    }
    setIsCheckingUpdate(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        Alert.alert('Up to Date', "You're running the latest version of WopeCar.");
        return;
      }
      Alert.alert(
        'Update Available',
        'A new version of WopeCar is ready to install. Restart the app now?',
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Restart Now',
            onPress: async () => {
              await Updates.fetchUpdateAsync();
              await Updates.reloadAsync();
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert('Error', "Couldn't check for updates. Please try again later.");
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        <Section title="General" styles={styles}>
          <NavRow label="Account Information" subtitle="Manage account details" onPress={() => router.push('/account')} styles={styles} colors={colors} />
          <NavRow label="Change Password" subtitle="Update password" onPress={() => router.push('/settings/change-password')} styles={styles} colors={colors} />
          <BiometricLoginRow styles={styles} colors={colors} />
          <NavRow label="Two-Factor Authentication" subtitle="Enable additional security" onPress={() => openComingSoon('Two-Factor Authentication')} styles={styles} colors={colors} />
          <NavRow label="Active Devices" subtitle="View signed-in devices" last onPress={() => openComingSoon('Active Devices')} styles={styles} colors={colors} />
        </Section>

        <Section title="Notifications" styles={styles}>
          <ToggleRow label="Push Notifications" settingsKey="pushNotifications" styles={styles} colors={colors} onToggle={handlePushToggle} />
          <ToggleRow label="Email Notifications" settingsKey="emailNotifications" styles={styles} colors={colors} />
          <ToggleRow label="SMS Notifications" subtitle="Coming in a later update" settingsKey="smsNotifications" disabled styles={styles} colors={colors} />
          <ToggleRow label="Booking Updates" settingsKey="bookingUpdates" styles={styles} colors={colors} />
          <ToggleRow label="Promotions & Offers" subtitle="Coming in a later update" settingsKey="promotions" disabled styles={styles} colors={colors} />
          <ToggleRow label="New Messages" settingsKey="newMessages" styles={styles} colors={colors} />
          <ToggleRow label="Trip Reminders" settingsKey="tripReminders" styles={styles} colors={colors} />
          <ToggleRow label="Wishlist Alerts" subtitle="Coming in a later update" settingsKey="wishlistAlerts" disabled styles={styles} colors={colors} />
          <ToggleRow label="Price Drop Alerts" settingsKey="priceDropAlerts" last styles={styles} colors={colors} />
        </Section>

        <Section title="Privacy" styles={styles}>
          <PickerRow label="Profile Visibility" settingsKey="profileVisibility" options={['Public', 'Private']} onOpen={openPicker} styles={styles} colors={colors} />
          <ToggleRow label="Show Profile Photo" settingsKey="showProfilePhoto" styles={styles} colors={colors} />
          <ToggleRow label="Show Ratings" settingsKey="showRatings" styles={styles} colors={colors} />
          <PickerRow label="Marketing Preferences" settingsKey="marketingPreferences" options={['Opt In', 'Opt Out']} onOpen={openPicker} styles={styles} colors={colors} />
          <NavRow label="Data Sharing Preferences" subtitle="Manage consent" onPress={() => router.push('/settings/data-sharing')} styles={styles} colors={colors} />
          <NavRow label="Download My Data" subtitle="Export account data" onPress={() => router.push('/settings/export-data')} styles={styles} colors={colors} />
          <NavRow label="Delete Account" subtitle="Permanently remove account" last onPress={() => router.push('/settings/delete-account')} styles={styles} colors={colors} />
        </Section>

        <Section title="Ride Preferences" styles={styles}>
          <NavRow
            label="Preferred Pickup Location"
            subtitle={user?.preferredPickupLocation || 'Set a default location'}
            onPress={() => router.push('/account')}
            styles={styles}
            colors={colors}
          />
          <PickerRow label="Preferred Vehicle Type" settingsKey="preferredVehicleType" options={VEHICLE_CATEGORIES} onOpen={openPicker} styles={styles} colors={colors} />
          <PickerRow label="Preferred Transmission" settingsKey="preferredTransmission" options={['Automatic', 'Manual']} onOpen={openPicker} styles={styles} colors={colors} />
          <PickerRow label="Fuel Preference" settingsKey="fuelPreference" options={['Petrol', 'Diesel', 'Hybrid', 'EV']} onOpen={openPicker} styles={styles} colors={colors} />
          <PickerRow label="Distance Units" settingsKey="distanceUnits" options={['Kilometres', 'Miles']} onOpen={openPicker} styles={styles} colors={colors} />
          <PickerRow label="Currency" settingsKey="currency" options={currencyOptions} onOpen={openPicker} styles={styles} colors={colors} />
          <PickerRow label="Language" settingsKey="language" options={['English', 'French']} onOpen={openPicker} last styles={styles} colors={colors} />
        </Section>

        <Section title="Payment" styles={styles}>
          <NavRow label="Saved Payment Methods" subtitle="Manage cards" onPress={() => router.push('/settings/payment-methods')} styles={styles} colors={colors} />
          <NavRow label="Default Payment Method" subtitle="Select default card" onPress={() => router.push('/settings/payment-methods')} styles={styles} colors={colors} />
          <NavRow label="Billing Address" subtitle="Edit billing details" onPress={() => router.push('/settings/billing-address')} styles={styles} colors={colors} />
          <NavRow label="Payment History" subtitle="View transactions" onPress={() => router.push('/settings/payment-history')} styles={styles} colors={colors} />
          <NavRow label="Invoices & Receipts" subtitle="Download receipts" onPress={() => router.push('/settings/payment-history')} styles={styles} colors={colors} />
          <NavRow label="Refund History" subtitle="Coming in a later update" last styles={styles} colors={colors} />
        </Section>

        <Section title="App Preferences" styles={styles}>
          <PickerRow label="Dark Mode" settingsKey="darkMode" options={['Light', 'Dark', 'Auto']} onOpen={openPicker} styles={styles} colors={colors} />
          <PickerRow label="Theme Colour" settingsKey="themeColour" options={['Default', 'Teal', 'Navy', 'Orange']} onOpen={openPicker} styles={styles} colors={colors} />
          <PickerRow label="Map Provider" settingsKey="mapProvider" options={['Google Maps', 'Apple Maps']} onOpen={openPicker} styles={styles} colors={colors} />
          <ToggleRow
            label="Auto-open Directions"
            subtitle="Prompt directions to pickup on the day of your trip"
            settingsKey="autoOpenDirections"
            styles={styles}
            colors={colors}
          />
          <ToggleRow label="Auto-play Videos" settingsKey="autoPlayVideos" styles={styles} colors={colors} />
          <NavRow label="Cache Management" subtitle="Clear downloaded images/data" last onPress={openClearCache} styles={styles} colors={colors} />
        </Section>

        <Section title="Security" styles={styles}>
          <NavRow label="Login Activity" subtitle="Recent login history" onPress={() => openComingSoon('Login Activity')} styles={styles} colors={colors} />
          <NavRow label="Trusted Devices" subtitle="Manage remembered devices" onPress={() => openComingSoon('Trusted Devices')} styles={styles} colors={colors} />
          <NavRow label="Change Email" subtitle="Requires verification" onPress={() => router.push('/account')} styles={styles} colors={colors} />
          <NavRow label="Change Mobile Number" subtitle="Requires OTP verification" onPress={() => router.push('/account')} styles={styles} colors={colors} />
          <SecurityAlertsRow last styles={styles} colors={colors} />
        </Section>

        <Section title="About" styles={styles}>
          <NavRow label="Terms & Conditions" subtitle="View legal terms" onPress={() => router.push('/terms')} styles={styles} colors={colors} />
          <NavRow label="Privacy Policy" subtitle="View policy" onPress={() => router.push('/privacy')} styles={styles} colors={colors} />
          <NavRow label="About WopeCar" subtitle="App version & company info" last onPress={() => router.push('/settings/about')} styles={styles} colors={colors} />
        </Section>

        <Section title="Developer" styles={styles}>
          <StaticRow label="App Version" value={APP_VERSION} onPress={handleAppVersionTap} styles={styles} />
          <NavRow
            label="Check for Updates"
            subtitle={isCheckingUpdate ? 'Checking...' : 'Verify latest release'}
            onPress={handleCheckForUpdates}
            styles={styles}
            colors={colors}
          />
          <NavRow label="Diagnostics" subtitle="Device & app info for Support" onPress={() => router.push('/settings/diagnostics')} styles={styles} colors={colors} />
          <NavRow label="Clear Cache" subtitle="Free storage" last onPress={openClearCache} styles={styles} colors={colors} />
        </Section>

      </ScrollView>

      {!!picker && (
        <OptionPickerModal
          visible={!!picker}
          title={picker.label}
          options={picker.options}
          value={picker.value}
          onSelect={handlePickerSelect}
          onClose={closePicker}
        />
      )}

      <ConfirmModal
        visible={!!comingSoon}
        title={comingSoon}
        message="This feature isn't available yet - we're working on it."
        confirmLabel="OK"
        cancelLabel={null}
        onConfirm={closeComingSoon}
        onCancel={closeComingSoon}
      />

      <ConfirmModal
        visible={cacheStep === 'confirm'}
        title="Clear Cache"
        message="This removes downloaded car photos and profile pictures from this device. They'll be re-downloaded next time they're needed."
        confirmLabel="Clear Cache"
        onConfirm={handleClearCache}
        onCancel={closeCacheModal}
      />
      <ConfirmModal
        visible={cacheStep === 'done'}
        title="Cache Cleared"
        message="Downloaded images have been removed from this device."
        confirmLabel="OK"
        cancelLabel={null}
        onConfirm={closeCacheModal}
        onCancel={closeCacheModal}
      />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  section: {
    marginBottom: 18,
  },
  sectionTitle: {
    fontFamily: FONTS.bold,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 16,
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabelWrap: {
    flex: 1,
  },
  rowLabel: {
    fontFamily: FONTS.medium,
    fontSize: 14,
    color: colors.textPrimary,
  },
  rowSubtitle: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: colors.textSubtle,
    marginTop: 2,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowValue: {
    fontFamily: FONTS.regular,
    fontSize: 13,
    color: colors.textSubtle,
  },
  });
}
