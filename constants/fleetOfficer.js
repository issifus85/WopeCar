import Constants from 'expo-constants';

// Fleet Officer (drivers who deliver and collect cars) is being built and tested on PREPROD only. Production builds and production
// OTA updates must never show it until the release gate in the Fleet Officer spec passes - the production database has none of its
// tables yet. Same pattern as the WopeDriver gate.
export const FLEET_OFFICER_ENABLED = Constants.expoConfig?.extra?.APP_ENV !== 'production';
