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
    // react-native-firebase v26 resolves Firebase via Swift Package
    // Manager, which failed outright against this project's default
    // static-framework linkage ("SPM + static linkage is not supported").
    // Switching to dynamic linkage (via expo-build-properties) got past
    // that but then failed at the link step with an undefined symbol
    // (_OBJC_CLASS_$_FIRApp) - both confirmed via real EAS iOS build
    // failures. Disabling RNFirebase's SPM resolution entirely avoids both
    // problems by falling back to Firebase's older, far more
    // battle-tested pure-CocoaPods resolution path, so linkage stays at
    // its default (static). `disableSPM` is the package's own official
    // plugin option (see node_modules/@react-native-firebase/app/plugin/
    // build/ios/podfile.js) - it anchors the required Podfile flag exactly
    // where firebase_spm.rb expects it, right after
    // prepare_react_native_project!, unlike an earlier version of this fix
    // that just prepended the flag to the top of the file by hand.
    ['@react-native-firebase/app', { ios: { disableSPM: true } }],
    '@react-native-firebase/analytics',
    '@react-native-firebase/crashlytics',
    require('./plugins/withModularHeaders'),
  ],
  extra: {
    ...config.extra,
    APP_ENV: process.env.APP_ENV || 'development',
  },
});
