// app.json holds all the static config; this file adds the one field that
// has to vary per build - APP_ENV, set via eas.json's per-profile `env` (or
// the local shell for `npx expo start`) - so components/EnvironmentBanner.js
// knows whether to render - plus the Firebase native-module wiring below.
//
// Every top-level key here spreads its app.json counterpart
// (...config.android/...config.ios/...config.plugins/...config.extra)
// rather than replacing it outright - app.json still owns supportsTablet,
// adaptive icon, permissions, the router/eas.projectId extra fields, etc.
// Overwriting instead of spreading here would silently drop
// extra.eas.projectId, which `eas update`/`eas build` need to even
// identify this project.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: './google-services.json',
  },
  ios: {
    ...config.ios,
    googleServicesFile: './GoogleService-Info.plist',
  },
  plugins: [
    ...(config.plugins || []),
    '@react-native-firebase/app',
    '@react-native-firebase/analytics',
    '@react-native-firebase/crashlytics',
    // react-native-firebase v26 resolves Firebase via Swift Package
    // Manager, which fails to link against this RN 0.81 New Architecture
    // project's default static-framework linkage ("SPM + static linkage
    // is not supported" - confirmed via a real EAS iOS build failure).
    // expo-build-properties is the supported way to set Podfile linkage
    // in a CNG project (no committed ios/Podfile to hand-edit) - dynamic
    // linkage is the fix CocoaPods' own error message suggests first.
    ['expo-build-properties', { ios: { useFrameworks: 'dynamic' } }],
  ],
  extra: {
    ...config.extra,
    APP_ENV: process.env.APP_ENV || 'development',
  },
});
