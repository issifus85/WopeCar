// Excludes sources from the runtimeVersion fingerprint that have zero
// bearing on native/ABI compatibility, but were still forcing spurious
// mismatches between real builds and local `eas update`/fingerprint checks:
//
// - ExpoConfigExtraSection: covers `extra.APP_ENV` (app.config.js), which
//   only controls whether components/EnvironmentBanner.js renders - purely
//   a JS runtime flag, not a native difference. This is what caused the
//   whole APP_ENV-must-be-exported-before-eas-update footgun (see the
//   eas-update-local-fingerprint-unreliable memory) - with this skip, a
//   bare `eas update` (no APP_ENV set) now computes the SAME fingerprint as
//   a real production build, regardless of APP_ENV. Also covers
//   `extra.eas.projectId`/`extra.router`, neither of which affect native
//   compatibility either.
// - PackageJsonScriptsAll: package.json's `scripts` section (e.g. the
//   ota:development/preview/production convenience scripts added alongside
//   this file) has no effect on the actual native binary or JS bundle
//   contents, but was still hashed - confirmed live: adding those 3 lines
//   alone shifted the computed fingerprint away from the real, currently-
//   live production build (2803808fdd9152f3c5fe5dd3e09dfb1010e67915) to a
//   new value with zero native changes involved.
//
// This is the primary fix - the app.config.js warning and the `ota:*` npm
// scripts (package.json) are now secondary safety nets, not load-bearing.
module.exports = {
  sourceSkips: ['ExpoConfigExtraSection', 'PackageJsonScriptsAll'],
};
