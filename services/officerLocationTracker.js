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
let restartTimer = null;
let watchGeneration = 0;
let watchStarting = false;
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

function onFix(taskId, loc) {
  emit({ lastFix: { latitude: loc.coords.latitude, longitude: loc.coords.longitude, heading: loc.coords.heading } });
  send(taskId, loc.coords);
}

// iOS reports a transient "location unknown" error whenever GPS briefly drops (tunnel, indoors, or the simulator switching routes), and
// expo-location ends the watch for good on any error. So on an error the dead watch is removed and a fresh one started a few seconds
// later, for as long as this trip is still being shared. Without this the map froze on the last fix while the screen still said
// "Sharing".
async function startWatch(taskId) {
  clearTimeout(restartTimer);
  restartTimer = null;
  if (subscription) {
    subscription.remove();
    subscription = null;
  }
  const generation = ++watchGeneration;
  let failed = false;
  const scheduleRestart = () => {
    if (generation !== watchGeneration || !(state.active && state.taskId === taskId)) return;
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      restartTimer = null;
      if (generation === watchGeneration && state.active && state.taskId === taskId) startWatch(taskId).catch(scheduleRestart);
    }, 3000);
  };
  watchStarting = true;
  let sub;
  try {
    sub = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
      (loc) => onFix(taskId, loc),
      () => {
        failed = true;
        if (sub) sub.remove();
        if (subscription === sub) subscription = null;
        scheduleRestart();
      }
    );
  } finally {
    watchStarting = false;
  }
  // Tracking may have been stopped, another watch started, or this one already failed while it was starting up.
  if (failed || generation !== watchGeneration || !(state.active && state.taskId === taskId)) {
    sub.remove();
    return;
  }
  subscription = sub;
}

let starting = null;

/** Starts sharing for this trip. Returns false when location permission is refused. */
export async function startTracking(taskId) {
  if (state.active && state.taskId === taskId) {
    // Already sharing; restart the watch if it died and no restart is already pending or under way (the trip screen calls this
    // every 15 s, so a watch that died for any reason comes back).
    if (!subscription && !restartTimer && !watchStarting && !starting) startWatch(taskId).catch(() => {});
    return true;
  }
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
  await startWatch(taskId);
  // Send the first fix straight away instead of waiting for the phone to move.
  Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
    .then((loc) => {
      if (state.active && state.taskId === taskId) {
        lastSentAt = 0;
        onFix(taskId, loc);
      }
    })
    .catch(() => {});
  return true;
}

export function stopTracking() {
  watchGeneration += 1;
  clearTimeout(restartTimer);
  restartTimer = null;
  if (subscription) {
    subscription.remove();
    subscription = null;
  }
  if (state.active) emit({ active: false });
}
