// Feature switches that depend on the build. APP_ENV comes from eas.json's build profile via app.config.js
// (same source services/supabase.js uses to pick the Supabase project).
import Constants from 'expo-constants';

const APP_ENV = Constants.expoConfig?.extra?.APP_ENV;

// WopeDriver is on pre-production only until its tables and functions are deployed to production
// (migrations 0171-0172 and the WopeDriver Edge Functions). Production builds and production OTAs hide every entry point.
export const WOPEDRIVER_ENABLED = APP_ENV !== 'production';
