import { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Switch, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../constants/theme';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import OptionPickerModal from '../../components/OptionPickerModal';
import ConfirmModal from '../../components/ConfirmModal';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';
const SUPPORT_EMAIL = 'support@wopecar.com';

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function Row({ label, subtitle, onPress, right, last }) {
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

function ToggleRow({ label, settingsKey, last }) {
  const { settings, updateSetting } = useSettings();
  return (
    <Row
      label={label}
      last={last}
      right={
        <Switch
          value={!!settings[settingsKey]}
          onValueChange={(value) => updateSetting(settingsKey, value)}
          trackColor={{ false: '#e0e0e0', true: COLORS.teal }}
          thumbColor="#ffffff"
        />
      }
    />
  );
}

function PickerRow({ label, settingsKey, options, last, onOpen }) {
  const { settings } = useSettings();
  return (
    <Row
      label={label}
      last={last}
      onPress={() => onOpen({ label, settingsKey, options, value: settings[settingsKey] })}
      right={
        <View style={styles.valueRow}>
          <Text style={styles.rowValue}>{settings[settingsKey]}</Text>
          <Ionicons name="chevron-forward" size={18} color="#999" />
        </View>
      }
    />
  );
}

function NavRow({ label, subtitle, last, onPress }) {
  return (
    <Row
      label={label}
      subtitle={subtitle}
      last={last}
      onPress={onPress}
      right={<Ionicons name="chevron-forward" size={18} color="#999" />}
    />
  );
}

function StaticRow({ label, value, last }) {
  return <Row label={label} last={last} right={<Text style={styles.rowValue}>{value}</Text>} />;
}

export default function SettingsScreen() {
  const router = useRouter();
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

  const openMail = (subject) => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}${subject ? `?subject=${encodeURIComponent(subject)}` : ''}`);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        <Section title="General">
          <NavRow label="Account Information" subtitle="Manage account details" onPress={() => router.push('/account')} />
          <NavRow label="Change Password" subtitle="Update password" onPress={() => openComingSoon('Change Password')} />
          <NavRow label="Biometric Login" subtitle="Face ID / Fingerprint" onPress={() => openComingSoon('Biometric Login')} />
          <NavRow label="Two-Factor Authentication" subtitle="Enable additional security" onPress={() => openComingSoon('Two-Factor Authentication')} />
          <NavRow label="Active Devices" subtitle="View signed-in devices" last onPress={() => openComingSoon('Active Devices')} />
        </Section>

        <Section title="Notifications">
          <ToggleRow label="Push Notifications" settingsKey="pushNotifications" />
          <ToggleRow label="Email Notifications" settingsKey="emailNotifications" />
          <ToggleRow label="SMS Notifications" settingsKey="smsNotifications" />
          <ToggleRow label="Booking Updates" settingsKey="bookingUpdates" />
          <ToggleRow label="Promotions & Offers" settingsKey="promotions" />
          <ToggleRow label="New Messages" settingsKey="newMessages" />
          <ToggleRow label="Trip Reminders" settingsKey="tripReminders" />
          <ToggleRow label="Wishlist Alerts" settingsKey="wishlistAlerts" />
          <ToggleRow label="Price Drop Alerts" settingsKey="priceDropAlerts" last />
        </Section>

        <Section title="Privacy">
          <PickerRow label="Profile Visibility" settingsKey="profileVisibility" options={['Public', 'Private']} onOpen={openPicker} />
          <ToggleRow label="Show Profile Photo" settingsKey="showProfilePhoto" />
          <ToggleRow label="Show Ratings" settingsKey="showRatings" />
          <PickerRow label="Marketing Preferences" settingsKey="marketingPreferences" options={['Opt In', 'Opt Out']} onOpen={openPicker} />
          <NavRow label="Data Sharing Preferences" subtitle="Manage consent" onPress={() => openComingSoon('Data Sharing Preferences')} />
          <NavRow label="Download My Data" subtitle="Export account data" onPress={() => openComingSoon('Download My Data')} />
          <NavRow label="Delete Account" subtitle="Permanently remove account" last onPress={() => openComingSoon('Delete Account')} />
        </Section>

        <Section title="Ride Preferences">
          <NavRow
            label="Preferred Pickup Location"
            subtitle={user?.preferredPickupLocation || 'Set a default location'}
            onPress={() => router.push('/account')}
          />
          <PickerRow label="Preferred Vehicle Type" settingsKey="preferredVehicleType" options={['SUV', 'Sedan', 'Economy', 'Luxury']} onOpen={openPicker} />
          <PickerRow label="Preferred Transmission" settingsKey="preferredTransmission" options={['Automatic', 'Manual']} onOpen={openPicker} />
          <PickerRow label="Fuel Preference" settingsKey="fuelPreference" options={['Petrol', 'Diesel', 'Hybrid', 'EV']} onOpen={openPicker} />
          <PickerRow label="Distance Units" settingsKey="distanceUnits" options={['Kilometres', 'Miles']} onOpen={openPicker} />
          <PickerRow label="Currency" settingsKey="currency" options={['GHS', 'USD']} onOpen={openPicker} />
          <PickerRow label="Language" settingsKey="language" options={['English', 'French']} onOpen={openPicker} last />
        </Section>

        <Section title="Payment">
          <NavRow label="Saved Payment Methods" subtitle="Manage cards" onPress={() => openComingSoon('Saved Payment Methods')} />
          <NavRow label="Default Payment Method" subtitle="Select default card" onPress={() => openComingSoon('Default Payment Method')} />
          <NavRow label="Billing Address" subtitle="Edit billing details" onPress={() => openComingSoon('Billing Address')} />
          <NavRow label="Payment History" subtitle="View transactions" onPress={() => openComingSoon('Payment History')} />
          <NavRow label="Invoices & Receipts" subtitle="Download receipts" onPress={() => openComingSoon('Invoices & Receipts')} />
          <NavRow label="Refund History" subtitle="View refunds" last onPress={() => openComingSoon('Refund History')} />
        </Section>

        <Section title="App Preferences">
          <PickerRow label="Dark Mode" settingsKey="darkMode" options={['Light', 'Dark', 'System']} onOpen={openPicker} />
          <PickerRow label="Theme Colour" settingsKey="themeColour" options={['Default', 'Teal', 'Navy', 'Orange']} onOpen={openPicker} />
          <PickerRow label="Map Provider" settingsKey="mapProvider" options={['Google Maps', 'Apple Maps']} onOpen={openPicker} />
          <NavRow label="Navigation Preference" subtitle="Open preferred navigation app" onPress={() => openComingSoon('Navigation Preference')} />
          <ToggleRow label="Auto-play Videos" settingsKey="autoPlayVideos" />
          <NavRow label="Cache Management" subtitle="Clear downloaded images/data" last onPress={() => openComingSoon('Cache Management')} />
        </Section>

        <Section title="Security">
          <NavRow label="Login Activity" subtitle="Recent login history" onPress={() => openComingSoon('Login Activity')} />
          <NavRow label="Trusted Devices" subtitle="Manage remembered devices" onPress={() => openComingSoon('Trusted Devices')} />
          <NavRow label="Change Email" subtitle="Requires verification" onPress={() => router.push('/account')} />
          <NavRow label="Change Mobile Number" subtitle="Requires OTP verification" onPress={() => router.push('/account')} />
          <NavRow label="Security Alerts" subtitle="Receive suspicious login notifications" last onPress={() => openComingSoon('Security Alerts')} />
        </Section>

        <Section title="Support">
          <NavRow label="Help Centre" subtitle="FAQs" onPress={() => router.push('/settings/help-centre')} />
          <NavRow label="Contact Support" subtitle="Email us" onPress={() => openMail('Support request')} />
          <NavRow label="Report a Problem" subtitle="Submit issue" onPress={() => openMail('Report a Problem')} />
          <NavRow label="Safety Centre" subtitle="Emergency & safety resources" onPress={() => router.push('/settings/safety-centre')} />
          <NavRow label="Terms & Conditions" subtitle="View legal terms" onPress={() => router.push('/terms')} />
          <NavRow label="Privacy Policy" subtitle="View policy" onPress={() => router.push('/privacy')} />
          <NavRow label="About WopeCar" subtitle="App version & company info" last onPress={() => router.push('/settings/about')} />
        </Section>

        <Section title="Developer">
          <StaticRow label="App Version" value={APP_VERSION} />
          <NavRow label="Check for Updates" subtitle="Verify latest release" onPress={() => openComingSoon('Check for Updates')} />
          <NavRow label="Diagnostics" subtitle="Send anonymous crash reports" onPress={() => openComingSoon('Diagnostics')} />
          <NavRow label="Clear Cache" subtitle="Free storage" onPress={() => openComingSoon('Cache Management')} />
          <NavRow label="Developer Mode" subtitle="Internal/testing builds only" last onPress={() => openComingSoon('Developer Mode')} />
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    color: COLORS.navy,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 16,
    shadowColor: '#000',
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
    borderBottomColor: '#f0f0f0',
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
    color: COLORS.navy,
  },
  rowSubtitle: {
    fontFamily: FONTS.regular,
    fontSize: 12,
    color: '#999',
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
    color: '#888',
  },
});
