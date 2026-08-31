const { withPodfile } = require('@expo/config-plugins');

// Once RNFirebase's SPM resolution is disabled (see app.config.js's
// `['@react-native-firebase/app', { ios: { disableSPM: true } }]` - the
// package's own official option, replacing an earlier hand-rolled version
// of this plugin that just prepended `$RNFirebaseDisableSPM = true` to the
// Podfile itself), Firebase falls back to plain CocoaPods pods. Its Swift
// pods (FirebaseCoreInternal, FirebaseCrashlytics, FirebaseSessions) depend
// on GoogleUtilities/GoogleDataTransport/nanopb, which don't define Clang
// modules - a static build of a Swift pod needs its dependencies' module
// maps to import them. CocoaPods' own error named the fix directly:
// use_modular_headers! globally - confirmed via a real EAS iOS build
// failure. No official RNFB plugin option covers this (it's a general
// CocoaPods/Swift-pod requirement, not Firebase-specific), so it's
// injected here - the standard Expo way to add arbitrary Podfile content
// in a CNG project with no committed ios/Podfile to hand-edit.
module.exports = function withModularHeaders(config) {
  return withPodfile(config, (config) => {
    const line = 'use_modular_headers!';
    if (!config.modResults.contents.includes(line)) {
      config.modResults.contents = `${line}\n${config.modResults.contents}`;
    }
    return config;
  });
};
