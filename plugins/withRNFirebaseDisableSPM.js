const { withPodfile } = require('@expo/config-plugins');

// react-native-firebase v26 resolves Firebase via Swift Package Manager.
// Static use_frameworks! linkage fails outright ("SPM + static linkage is
// not supported" - a real EAS iOS build error). Switching to dynamic
// linkage (see app.config.js's expo-build-properties entry) got past that,
// but then failed at the link step with an undefined symbol
// (_OBJC_CLASS_$_FIRApp) - also confirmed via a real build - meaning the
// SPM-resolved Firebase products weren't actually linking into the app
// target correctly under dynamic linkage either.
//
// CocoaPods' own error message offered a second fix: opt out of
// RNFirebase's SPM resolution entirely, falling back to its normal,
// far more battle-tested CocoaPods-vendored Firebase pods.
// $RNFirebaseDisableSPM must be set before any target block in the
// Podfile, so this prepends it to the very top of the generated one -
// the standard Expo way to inject arbitrary Podfile content in a CNG
// project with no committed ios/Podfile to hand-edit.
//
// Doing that surfaced the next well-known consequence of falling back to
// plain CocoaPods for Firebase: its Swift pods (FirebaseCoreInternal,
// FirebaseCrashlytics, FirebaseSessions) depend on GoogleUtilities/
// GoogleDataTransport/nanopb, which don't define Clang modules - a static
// build of a Swift pod needs its dependencies' module maps to import them.
// CocoaPods' own error named the fix directly: use_modular_headers!
// globally, also confirmed via a real EAS iOS build failure.
module.exports = function withRNFirebaseDisableSPM(config) {
  return withPodfile(config, (config) => {
    const lines = ['$RNFirebaseDisableSPM = true', 'use_modular_headers!'];
    for (const line of lines) {
      if (!config.modResults.contents.includes(line)) {
        config.modResults.contents = `${line}\n${config.modResults.contents}`;
      }
    }
    return config;
  });
};
