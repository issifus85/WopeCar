import * as Location from 'expo-location';
import { shareLocation, refreshTripEta } from './liveTripApi';

// Fleet Officer Phase 4: one shared tracker for the officer's phone. Started by "Start trip" (or Resume), it sends a fix about every
// 5 seconds while the app is open, asks the server for a fresh ETA every ~30 seconds, and stops by itself as soon as the server says
// the trip is no longer En route (arrived, completed, cancelled, or the officer tapped Stop). Foreground only: the spec adds background
// tracking only if testing shows it is needed.
//
// Screens subscribe to it to show the "Sharing live location" indicator and the officer's own position on the map.

let state = { taskId: null, active: false, lastFix: null, error: null };
let subscription = null;
let lastSentAt = 0;
let inFlight = false;
const listeners = new Set();

function emit(patch) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}

export function getTrackerState() {
  return state;
}

export function subscribeTracker(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

async function send(taskId, coords) {
  if (inFlight) return;
  const now = Date.now();
  if (now - lastSentAt < 4500) return;
  inFlight = true;
  lastSentAt = now;
  try {
    const { sharing, etaDue } = await shareLocation(taskId, {
      latitude: coords.latitude,
      longitude: coords.longitude,
      heading: coords.heading != null && coords.heading >= 0 ? coords.heading : null,
      speed: coords.speed != null && coords.speed >= 0 ? coords.speed : null,
      accuracy: coords.accuracy ?? null,
    });
    if (!sharing) {
      stopTracking();
      return;
    }
    if (etaDue) refreshTripEta(taskId);
    if (state.error) emit({ error: null });
  } catch (e) {
    // A dropped request is fine - the next fix (5 s later) tries again.
    emit({ error: e?.message || 'Could not send your location' });
  } finally {
    inFlight = false;
  }
}

let starting = null;

/** Starts sharing for this trip. Returns false when location permission is refused. */
export async function startTracking(taskId) {
  if (state.active && state.taskId === taskId) return true;
  // Start trip and the screen's 15-second check can both ask at once; share one start instead of opening two location watchers.
  if (starting?.taskId === taskId) return starting.promise;
  const promise = doStartTracking(taskId).finally(() => {
    if (starting?.promise === promise) starting = null;
  });
  starting = { taskId, promise };
  return promise;
}

async function doStartTracking(taskId) {
  stopTracking();
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    emit({ taskId, active: false, error: 'Location permission is off' });
    return false;
  }
  emit({ taskId, active: true, error: null });
  lastSentAt = 0;
  subscription = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
    (loc) => {
      emit({ lastFix: { latitude: loc.coords.latitude, longitude: loc.coords.longitude, heading: loc.coords.heading } });
      send(taskId, loc.coords);
    }
  );
  // Send the first fix straight away instead of waiting for the phone to move.
  Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
    .then((loc) => {
      if (state.active && state.taskId === taskId) {
        emit({ lastFix: { latitude: loc.coords.latitude, longitude: loc.coords.longitude, heading: loc.coords.heading } });
        lastSentAt = 0;
        send(taskId, loc.coords);
      }
    })
    .catch(() => {});
  return true;
}

export function stopTracking() {
  if (subscription) {
    subscription.remove();
    subscription = null;
  }
  if (state.active) emit({ active: false });
}
