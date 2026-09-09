const { withAndroidManifest } = require('@expo/config-plugins');

// @react-native-firebase/analytics transitively pulls in Google's
// play-services-ads-identifier AAR, which auto-injects the
// com.google.android.gms.permission.AD_ID permission into the merged
// manifest even though this app never reads the advertising ID (no ads,
// no ad-attribution use case) - confirmed via a real EAS Android build:
// the generated android/app/src/main/AndroidManifest.xml carries the
// permission despite this repo's own manifest never declaring it. Play
// Console's Advertising ID declaration then flags a mismatch against the
// "No" answer that's actually true for this app.
//
// This is a CNG project (android/ and ios/ are gitignored, regenerated
// fresh by every `expo prebuild`/EAS build - see plugins/withModularHeaders.js's
// own comment), so there's no committed AndroidManifest.xml to hand-edit;
// the permission has to be stripped via `tools:node="remove"` injected
// through a config plugin instead - Google's own documented way to opt a
// transitively-included permission back out during the manifest merge.
module.exports = function withRemoveAdIdPermission(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const permissionName = 'com.google.android.gms.permission.AD_ID';

    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }
    const alreadyPresent = manifest['uses-permission'].some((p) => p.$?.['android:name'] === permissionName);
    if (!alreadyPresent) {
      manifest['uses-permission'].push({
        $: {
          'android:name': permissionName,
          'tools:node': 'remove',
        },
      });
    }

    return config;
  });
};
