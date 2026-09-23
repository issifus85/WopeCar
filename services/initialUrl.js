import * as Linking from 'expo-linking';

// Resolved exactly once, at JS module-init time - before RootLayout (or
// anything gated behind its splash-video intro) ever mounts. The single
// source of truth for "what URL launched this app", so every consumer
// reads the SAME resolution instead of independently calling
// Linking.getInitialURL() a second time.
//
// This exists because of a real, confirmed-live bug: app/_layout.js's
// splash video intro (components/SplashVideoScreen.js) unconditionally
// replaces the entire route tree - including app/reset-password-callback.js
// - until it finishes or is skipped. That screen's own Linking.getInitialURL()
// call, made only once it finally mounts, came back empty on a real cold
// launch via a password-reset email link, surfacing as "Link No Longer
// Valid" on every attempt even with a freshly requested, genuinely valid
// link. app/_layout.js's own top-level effects (e.g. its email-confirmed
// handling below) don't have this problem - React runs a component's hooks
// every render regardless of what JSX a later conditional return produces,
// so they're already live during the splash-gated render. Resolving the
// launch URL here, at import time, gives every consumer (this module's own
// splash-skip check, reset-password-callback.js) that same "always live"
// guarantee instead of a second, later, unreliable native round-trip.
let resolvedInitialUrl;
export const initialUrlPromise = Linking.getInitialURL().then((url) => {
  resolvedInitialUrl = url;
  return url;
});

// Synchronous read of whatever initialUrlPromise has resolved to so far -
// null both before resolution and when there was no launch URL. Only
// meaningful after awaiting initialUrlPromise at least once.
export function getResolvedInitialUrl() {
  return resolvedInitialUrl ?? null;
}
