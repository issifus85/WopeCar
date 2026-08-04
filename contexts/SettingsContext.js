import { Platform } from 'react-native';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as settingsStorage from '../services/settingsStorage';

// Defaults for every setting from the WopeCar App Profile Settings spec.
// Several of these (language, preferredVehicleType/Transmission/fuelPreference,
// distanceUnits, themeColour, autoPlayVideos, profileVisibility/
// showProfilePhoto/showRatings, marketingPreferences/promotions/
// wishlistAlerts/priceDropAlerts) don't have real app behavior wired up to
// them yet - no i18n, no distance-from-user feature (needs per-listing
// coordinates the backend doesn't populate yet), no public profile/ratings
// view, no promo-notification system. They're genuinely saved here for
// later use, not silently dropped or faked. Dark Mode drives ThemeContext;
// pushNotifications/emailNotifications/smsNotifications/bookingUpdates/
// newMessages/tripReminders gate real dispatch via
// InboxContext.notifyBookingEvent (see contexts/InboxContext.js); currency
// drives CurrencyContext.activeCurrency; mapProvider drives the "Get
// Directions" buttons on booking/[id].js (see services/mapsLauncher.js);
// biometricLogin gates app launch (see components/BiometricGate.js);
// dataSharingAnalytics/dataSharingPersonalizedAds/dataSharingThirdParty are
// saved-but-inert consent flags (app/settings/data-sharing.js) - nothing in
// this app currently reads device analytics or serves ads, so there's
// nothing yet to actually gate; autoOpenDirections drives the pickup-day
// directions prompt on booking/[id].js.
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
  dataSharingAnalytics: true,
  dataSharingPersonalizedAds: false,
  dataSharingThirdParty: false,
  // Preference Setting
  preferredVehicleType: 'SUVs/ 4x4s',
  preferredTransmission: 'Automatic',
  fuelPreference: 'Petrol',
  distanceUnits: 'Kilometres',
  currency: 'GHS',
  language: 'English',
  // App Preference Setting
  darkMode: 'Auto', // 'Light' | 'Dark' | 'Auto' (time-of-day based, see contexts/ThemeContext.js)
  themeColour: 'Default',
  mapProvider: Platform.OS === 'ios' ? 'Apple Maps' : 'Google Maps',
  // Prompts "Get Directions" on Booking Detail the day of pickup - see
  // booking/[id].js's directions-prompt banner.
  autoOpenDirections: false,
  autoPlayVideos: true,
  // Security Setting - gates app launch, see components/BiometricGate.js
  biometricLogin: false,
  // Which experience the app opens into, Airbnb guest/host style - see
  // app/_layout.js's launch-time redirect and the switch-mode entry points
  // in app/(tabs)/profile.js and app/vendor/(tabs)/index.js + menu.js.
  appMode: 'client', // 'client' | 'vendor'
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
        // Preferred Vehicle Type used to mix in class tiers (Economy/Luxury)
        // alongside categories - coerce anything from that old option set
        // to a real car category so it isn't stuck on a removed option.
        if (saved.preferredVehicleType === 'SUV') saved.preferredVehicleType = 'SUVs/ 4x4s';
        else if (['Economy', 'Luxury'].includes(saved.preferredVehicleType)) {
          saved.preferredVehicleType = DEFAULT_SETTINGS.preferredVehicleType;
        }
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
