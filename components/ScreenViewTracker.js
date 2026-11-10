import { useEffect, useRef } from 'react';
import { usePathname } from 'expo-router';
import { logScreen } from '../services/analytics';

/**
 * Logs a GA4/Firebase screen_view for every route change, so all screens
 * are covered rather than the handful that used to call logScreen() by
 * hand. Screen names are the expo-router pathname with the leading slash
 * removed and '/' as the root ('/' -> 'home', '/checkout/dates' ->
 * 'checkout/dates', '/car/abc123' -> 'car/[id]' is NOT derived - dynamic
 * ids stay in the path, GA4 groups them under screen_class below).
 */
function toScreenName(pathname) {
  if (!pathname || pathname === '/') return 'home';
  return pathname.replace(/^\//, '');
}

/** Collapses dynamic segments (uuids / numeric ids) so screen_class groups a route, not each record. */
function toScreenClass(pathname) {
  return toScreenName(pathname)
    .split('/')
    .map((seg) => (/^[0-9a-f-]{8,}$|^\d+$/i.test(seg) ? '[id]' : seg))
    .join('/');
}

export default function ScreenViewTracker() {
  const pathname = usePathname();
  const last = useRef(null);

  useEffect(() => {
    if (!pathname || pathname === last.current) return;
    last.current = pathname;
    logScreen(toScreenName(pathname), toScreenClass(pathname));
  }, [pathname]);

  return null;
}
