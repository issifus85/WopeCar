import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { DefaultTheme, DarkTheme } from '@react-navigation/native';
import { useSettings } from './SettingsContext';
import { LIGHT_COLORS, DARK_COLORS } from '../constants/theme';

// Auto mode's day/night cutoff - matches the 8am-6pm working-day framing
// used elsewhere in the app (booking hours, Sunday blackout), but for
// daylight purposes specifically: light 6am-6pm, dark outside that window.
const AUTO_LIGHT_START_HOUR = 6;
const AUTO_LIGHT_END_HOUR = 18;

// Re-check the clock periodically so Auto mode flips live while the app is
// open, not just at next launch - see the "Live re-check" decision in the
// dark-theme plan. 60s is frequent enough to feel immediate at the 6am/6pm
// boundary without being wasteful.
const AUTO_RECHECK_INTERVAL_MS = 60 * 1000;

function isDaytimeNow() {
  const hour = new Date().getHours();
  return hour >= AUTO_LIGHT_START_HOUR && hour < AUTO_LIGHT_END_HOUR;
}

function resolveIsDark(mode) {
  if (mode === 'Dark') return true;
  if (mode === 'Light') return false;
  return !isDaytimeNow(); // 'Auto'
}

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const { settings } = useSettings();
  const mode = settings.darkMode ?? 'Auto';

  const [isDark, setIsDark] = useState(() => resolveIsDark(mode));

  useEffect(() => {
    setIsDark(resolveIsDark(mode));

    if (mode !== 'Auto') return;

    const interval = setInterval(() => setIsDark(resolveIsDark(mode)), AUTO_RECHECK_INTERVAL_MS);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setIsDark(resolveIsDark(mode));
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [mode]);

  const colors = isDark ? DARK_COLORS : LIGHT_COLORS;

  const value = useMemo(() => ({ colors, isDark, mode }), [colors, isDark, mode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useAppTheme must be used within a ThemeProvider');
  }
  return context;
}

// Maps our semantic tokens onto React Navigation's theme shape, so the
// native Stack header and Tab bar chrome theme themselves automatically
// for any screen that doesn't set its own explicit headerStyle override.
export function toNavigationTheme(colors, isDark) {
  const base = isDark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: isDark,
    colors: {
      ...base.colors,
      primary: colors.teal,
      background: colors.background,
      card: colors.surface,
      text: colors.textPrimary,
      border: colors.border,
    },
  };
}
