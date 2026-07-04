export const darkColors = {
  // Backgrounds
  background: '#0D2818',
  surface: '#132D1E',
  surfaceElevated: '#1A3D28',
  card: '#1F4A2F',

  // Greens
  primary: '#2ECC71',
  primaryDark: '#27AE60',
  primaryLight: '#58D68D',
  accent: '#A8E6CF',

  // Text
  textPrimary: '#F0FFF4',
  textSecondary: '#A8C5B5',
  textMuted: '#6B9E80',

  // Status / gamification
  xp: '#F4D03F',
  rare: '#9B59B6',
  danger: '#E74C3C',
  warning: '#F39C12',
  serious: '#E67E22',

  // UI
  border: '#1F4A2F',
  tabBar: '#0A1F12',
  tabBarBorder: '#1A3D28',
  inactive: '#4A7A5A',
};

export const lightColors: typeof darkColors = {
  // Backgrounds — soft warm cream, not pure white, with brighter surfaces "on top"
  // to preserve the same elevation direction as dark mode (elevated = lighter).
  background: '#FAF6EC',
  surface: '#FDFBF6',
  surfaceElevated: '#F0EBDD',
  card: '#FFFFFF',

  // Greens — same three tones as dark mode, shifted one step darker for contrast
  // against a light background (dark mode's primaryDark becomes light mode's
  // primary, etc.), plus a deepened accent since the original pale mint would
  // nearly disappear on a cream background.
  primary: '#27AE60',
  primaryDark: '#1E8449',
  primaryLight: '#2ECC71',
  accent: '#4FAE86',

  // Text — dark charcoal (with a faint green tint to match the app's tone)
  // instead of near-white, muted gray-green instead of dim gray-green.
  textPrimary: '#1C2B22',
  textSecondary: '#4A5D51',
  textMuted: '#7C8C81',

  // Status / gamification — same hues; xp/warning/serious deepened slightly
  // since their dark-mode values are pale/mid-tone and read poorly on cream.
  xp: '#D4A017',
  rare: '#9B59B6',
  danger: '#E74C3C',
  warning: '#D68910',
  serious: '#D35400',

  // UI
  border: '#E7E1D2',
  tabBar: '#FFFFFF',
  tabBarBorder: '#E7E1D2',
  inactive: '#7E9488',
};

// Backward-compatible alias — existing screens import `Colors` directly and are
// unaware of the new theme system yet. Do not remove until all 15 consumers have
// migrated to `useTheme()` from contexts/ThemeContext.
export const Colors = darkColors;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const FontSize = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 17,
  xl: 20,
  xxl: 24,
  hero: 32,
};

// Reused by useTheme() and by every screen's getStyles(Colors, FontSize)
// function so style definitions stay type-safe after moving off the static
// Colors/FontSize exports.
export type ColorPalette = typeof darkColors;
export type FontSizeScale = typeof FontSize;
