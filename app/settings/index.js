import { useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Switch, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { FONTS } from '../../constants/theme';
import { useAppTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { requestPushPermission } from '../../services/pushNotifications';
import { CATEGORIES } from '../../data/cars';
import OptionPickerModal from '../../components/OptionPickerModal';
import ConfirmModal from '../../components/ConfirmModal';

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

function ToggleRow({ label, settingsKey, last, styles, colors, onToggle }) {
  const { settings, updateSetting } = useSettings();
  return (
    <Row
      label={label}
      last={last}
      styles={styles}
      right={
        <Switch
          value={!!settings[settingsKey]}
          onValueChange={(value) => (onToggle ? onToggle(value) : updateSetting(settingsKey, value))}
          trackColor={{ false: colors.disabled, true: colors.teal }}
          thumbColor={colors.white}
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

function StaticRow({ label, value, last, styles }) {
  return <Row label={label} last={last} styles={styles} right={<Text style={styles.rowValue}>{value}</Text>} />;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();
  const { updateSetting } = useSettings();

  const [picker, setPicker] = useState(null);
  const [comingSoon, setComingSoon] = useState(null);

  const openPicker = (config) => setPicker(config);
  const closePicker = () => setPicker(null);
  const handlePickerSelect = (value) => {
    if (picker) updateSetting(picker.settingsKey, value);
  };

  const openComingSoon = (label) => {
    setComingSoon(label);
  };
  const closeComingSoon = () => setComingSoon(null);

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

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        <Section title="General" styles={styles}>
          <NavRow label="Account Information" subtitle="Manage account details" onPress={() => router.push('/account')} styles={styles} colors={colors} />
          <NavRow label="Change Password" subtitle="Update password" onPress={() => openComingSoon('Change Password')} styles={styles} colors={colors} />
          <NavRow label="Biometric Login" subtitle="Face ID / Fingerprint" onPress={() => openComingSoon('Biometric Login')} styles={styles} colors={colors} />
          <NavRow label="Two-Factor Authentication" subtitle="Enable additional security" onPress={() => openComingSoon('Two-Factor Authentication')} styles={styles} colors={colors} />
          <NavRow label="Active Devices" subtitle="View signed-in devices" last onPress={() => openComingSoon('Active Devices')} styles={styles} colors={colors} />
        </Section>

        <Section title="Notifications" styles={styles}>
          <ToggleRow label="Push Notifications" settingsKey="pushNotifications" styles={styles} colors={colors} onToggle={handlePushToggle} />
          <ToggleRow label="Email Notifications" settingsKey="emailNotifications" styles={styles} colors={colors} />
          <ToggleRow label="SMS Notifications" settingsKey="smsNotifications" styles={styles} colors={colors} />
          <ToggleRow label="Booking Updates" settingsKey="bookingUpdates" styles={styles} colors={colors} />
          <ToggleRow label="Promotions & Offers" settingsKey="promotions" styles={styles} colors={colors} />
          <ToggleRow label="New Messages" settingsKey="newMessages" styles={styles} colors={colors} />
          <ToggleRow label="Trip Reminders" settingsKey="tripReminders" styles={styles} colors={colors} />
          <ToggleRow label="Wishlist Alerts" settingsKey="wishlistAlerts" styles={styles} colors={colors} />
          <ToggleRow label="Price Drop Alerts" settingsKey="priceDropAlerts" last styles={styles} colors={colors} />
        </Section>

        <Section title="Privacy" styles={styles}>
          <PickerRow label="Profile Visibility" settingsKey="profileVisibility" options={['Public', 'Private']} onOpen={openPicker} styles={styles} colors={colors} />
          <ToggleRow label="Show Profile Photo" settingsKey="showProfilePhoto" styles={styles} colors={colors} />
          <ToggleRow label="Show Ratings" settingsKey="showRatings" styles={styles} colors={colors} />
          <PickerRow label="Marketing Preferences" settingsKey="marketingPreferences" options={['Opt In', 'Opt Out']} onOpen={openPicker} styles={styles} colors={colors} />
          <NavRow label="Data Sharing Preferences" subtitle="Manage consent" onPress={() => openComingSoon('Data Sharing Preferences')} styles={styles} colors={colors} />
          <NavRow label="Download My Data" subtitle="Export account data" onPress={() => openComingSoon('Download My Data')} styles={styles} colors={colors} />
          <NavRow label="Delete Account" subtitle="Permanently remove account" last onPress={() => openComingSoon('Delete Account')} styles={styles} colors={colors} />
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
          <PickerRow label="Currency" settingsKey="currency" options={['GHS', 'USD']} onOpen={openPicker} styles={styles} colors={colors} />
          <PickerRow label="Language" settingsKey="language" options={['English', 'French']} onOpen={openPicker} last styles={styles} colors={colors} />
        </Section>

        <Section title="Payment" styles={styles}>
          <NavRow label="Saved Payment Methods" subtitle="Manage cards" onPress={() => openComingSoon('Saved Payment Methods')} styles={styles} colors={colors} />
          <NavRow label="Default Payment Method" subtitle="Select default card" onPress={() => openComingSoon('Default Payment Method')} styles={styles} colors={colors} />
          <NavRow label="Billing Address" subtitle="Edit billing details" onPress={() => openComingSoon('Billing Address')} styles={styles} colors={colors} />
          <NavRow label="Payment History" subtitle="View transactions" onPress={() => openComingSoon('Payment History')} styles={styles} colors={colors} />
          <NavRow label="Invoices & Receipts" subtitle="Download receipts" onPress={() => openComingSoon('Invoices & Receipts')} styles={styles} colors={colors} />
          <NavRow label="Refund History" subtitle="View refunds" last onPress={() => openComingSoon('Refund History')} styles={styles} colors={colors} />
        </Section>

        <Section title="App Preferences" styles={styles}>
          <PickerRow label="Dark Mode" settingsKey="darkMode" options={['Light', 'Dark', 'Auto']} onOpen={openPicker} styles={styles} colors={colors} />
          <PickerRow label="Theme Colour" settingsKey="themeColour" options={['Default', 'Teal', 'Navy', 'Orange']} onOpen={openPicker} styles={styles} colors={colors} />
          <PickerRow label="Map Provider" settingsKey="mapProvider" options={['Google Maps', 'Apple Maps']} onOpen={openPicker} styles={styles} colors={colors} />
          <NavRow label="Navigation Preference" subtitle="Open preferred navigation app" onPress={() => openComingSoon('Navigation Preference')} styles={styles} colors={colors} />
          <ToggleRow label="Auto-play Videos" settingsKey="autoPlayVideos" styles={styles} colors={colors} />
          <NavRow label="Cache Management" subtitle="Clear downloaded images/data" last onPress={() => openComingSoon('Cache Management')} styles={styles} colors={colors} />
        </Section>

        <Section title="Security" styles={styles}>
          <NavRow label="Login Activity" subtitle="Recent login history" onPress={() => openComingSoon('Login Activity')} styles={styles} colors={colors} />
          <NavRow label="Trusted Devices" subtitle="Manage remembered devices" onPress={() => openComingSoon('Trusted Devices')} styles={styles} colors={colors} />
          <NavRow label="Change Email" subtitle="Requires verification" onPress={() => router.push('/account')} styles={styles} colors={colors} />
          <NavRow label="Change Mobile Number" subtitle="Requires OTP verification" onPress={() => router.push('/account')} styles={styles} colors={colors} />
          <NavRow label="Security Alerts" subtitle="Receive suspicious login notifications" last onPress={() => openComingSoon('Security Alerts')} styles={styles} colors={colors} />
        </Section>

        <Section title="About" styles={styles}>
          <NavRow label="Terms & Conditions" subtitle="View legal terms" onPress={() => router.push('/terms')} styles={styles} colors={colors} />
          <NavRow label="Privacy Policy" subtitle="View policy" onPress={() => router.push('/privacy')} styles={styles} colors={colors} />
          <NavRow label="About WopeCar" subtitle="App version & company info" last onPress={() => router.push('/settings/about')} styles={styles} colors={colors} />
        </Section>

        <Section title="Developer" styles={styles}>
          <StaticRow label="App Version" value={APP_VERSION} styles={styles} />
          <NavRow label="Check for Updates" subtitle="Verify latest release" onPress={() => openComingSoon('Check for Updates')} styles={styles} colors={colors} />
          <NavRow label="Diagnostics" subtitle="Send anonymous crash reports" onPress={() => openComingSoon('Diagnostics')} styles={styles} colors={colors} />
          <NavRow label="Clear Cache" subtitle="Free storage" onPress={() => openComingSoon('Cache Management')} styles={styles} colors={colors} />
          <NavRow label="Developer Mode" subtitle="Internal/testing builds only" last onPress={() => openComingSoon('Developer Mode')} styles={styles} colors={colors} />
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
