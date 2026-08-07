// Brand accent colors - constant across Light and Dark, used for CTAs,
// icons, and decorative fills. Never used as body text color (COLORS.navy
// used to be, but dark navy text is nearly invisible on a dark background -
// see LIGHT_COLORS.textPrimary / DARK_COLORS.textPrimary instead).
export const COLORS = {
  navy: '#154B59',
  teal: '#3EB6BA',
  orange: '#D07E5A',
  mauve: '#B8826F',
  // Secondary structural/brand-surface color - headers, nav bars, and other
  // "this is WopeCar" backdrops that aren't themselves an action. Keeps teal
  // reserved for things you can actually tap, so it isn't drowned out by
  // being reused as plain background fill everywhere.
  charcoal: '#2E2E2E',
  // Legacy aliases kept for any call site still reading these directly.
  background: '#f5f5f5',
  white: '#ffffff',
  textMuted: '#666666',
};

export const FONTS = {
  light: 'SourceSans3_300Light',
  regular: 'SourceSans3_400Regular',
  medium: 'SourceSans3_500Medium',
  semiBold: 'SourceSans3_600SemiBold',
  bold: 'SourceSans3_700Bold',
  display: 'DanburyCaps',
  signature: 'DancingScript_700Bold',
};

// Semantic tokens that flip between Light and Dark. Every screen should read
// colors from useAppTheme() (contexts/ThemeContext.js) rather than importing
// these directly, so it stays reactive to the user's Dark Mode setting.
export const LIGHT_COLORS = {
  ...COLORS,
  background: '#f5f5f5',
  surface: '#ffffff',
  textPrimary: COLORS.navy,
  textBody: '#444444',
  textMuted: '#666666',
  textSubtle: '#999999',
  border: '#e5e5e5',
  divider: '#f0f0f0',
  disabled: '#cccccc',
  highlight: '#EEF9F9',
  white: '#ffffff',
  black: '#000000',
  error: '#C62828',
  errorBg: '#FFEBEE',
  success: '#2E7D32',
  successBg: '#E8F5E9',
  warning: '#E65100',
  warningBg: '#FFF3E0',
  // "Booked/confirmed" status (Vendor Mode availability calendar) - a 4th
  // semantic status alongside success/warning/error.
  info: '#1565C0',
  infoBg: '#E3F2FD',
  shadow: '#000000',
};

export const DARK_COLORS = {
  ...COLORS,
  background: '#12181A',
  surface: '#1E2A2D',
  textPrimary: '#F2F7F7',
  textBody: '#D7E2E2',
  textMuted: '#A3B5B6',
  textSubtle: '#7E9294',
  border: '#2C3B3E',
  divider: '#243134',
  disabled: '#4B5C5E',
  highlight: '#133A3C',
  white: '#ffffff',
  black: '#000000',
  error: '#FF7A7A',
  errorBg: '#3B1519',
  success: '#7BD88A',
  successBg: '#123821',
  warning: '#FFB86B',
  warningBg: '#3D2A0C',
  info: '#64B5F6',
  infoBg: '#0F2A3D',
  shadow: '#000000',
};
