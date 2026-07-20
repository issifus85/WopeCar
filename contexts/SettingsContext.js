import { Platform } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as settingsStorage from '../services/settingsStorage';

// Defaults for every setting from the WopeCar App Profile Settings spec.
// Several of these (theme/language/currency/units/map provider/notification
// toggles) don't have real app behavior wired up to them yet - no dark theme,
// no i18n, no multi-currency pricing, no push notification service. They're
// genuinely saved here for later use, not silently dropped or faked.
const DEFAULT_SETTINGS = {
  // Notification Setting
  pushNotifications: true,
  emailNotifications: true,
  smsNotifications: false,
  bookingUpdates: true,
  promotions: true,
  newMessages: true,
  tripReminders: true,
  wishlistAlerts: true,
  priceDropAlerts: true,
  // Privacy Settings
  profileVisibility: 'Public',
  showProfilePhoto: true,
  showRatings: true,
  marketingPreferences: 'Opt In',
  // Preference Setting
  preferredVehicleType: 'SUV',
  preferredTransmission: 'Automatic',
  fuelPreference: 'Petrol',
  distanceUnits: 'Kilometres',
  currency: 'GHS',
  language: 'English',
  // App Preference Setting
  darkMode: 'System',
  themeColour: 'Default',
  mapProvider: Platform.OS === 'ios' ? 'Apple Maps' : 'Google Maps',
  autoPlayVideos: true,
};

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettingsState] = useState(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    settingsStorage.getSettings()
      .then(saved => setSettingsState(prev => ({ ...prev, ...saved })))
      .finally(() => setIsLoading(false));
  }, []);

  const updateSetting = useCallback((key, value) => {
    setSettingsState(prev => {
      const next = { ...prev, [key]: value };
      settingsStorage.setSettings(next);
      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, isLoading, updateSetting }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
