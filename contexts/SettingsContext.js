import { Platform } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as settingsStorage from '../services/settingsStorage';

// Defaults for every setting from the WopeCar App Profile Settings spec.
// Several of these (language/currency/units/map provider, promotions/
// wishlist/price-drop toggles) don't have real app behavior wired up to
// them yet - no i18n, no multi-currency pricing. They're genuinely saved
// here for later use, not silently dropped or faked. Dark Mode drives
// ThemeContext; pushNotifications/emailNotifications/smsNotifications/
// bookingUpdates/newMessages/tripReminders gate real dispatch via
// InboxContext.notifyBookingEvent (see contexts/InboxContext.js).
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
  darkMode: 'Auto', // 'Light' | 'Dark' | 'Auto' (time-of-day based, see contexts/ThemeContext.js)
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
      .then(saved => {
        // 'System' (OS-appearance-based) was replaced by 'Auto' (time-of-day
        // based) - coerce any value saved before that change so it doesn't
        // land on an option the Dark Mode picker no longer offers.
        if (saved.darkMode === 'System') saved.darkMode = 'Auto';
        setSettingsState(prev => ({ ...prev, ...saved }));
      })
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
