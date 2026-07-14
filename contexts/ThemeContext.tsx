import { createContext, useContext, useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { darkColors, lightColors, FontSize as BASE_FONT_SIZE, type ColorPalette, type FontSizeScale } from '../constants/theme';

export type ThemeMode = 'system' | 'light' | 'dark';
export type FontScaleMode = 'small' | 'default' | 'large' | 'extra-large';
export type ResolvedScheme = 'light' | 'dark';

const FONT_SCALE_MULTIPLIERS: Record<FontScaleMode, number> = {
  small: 0.9,
  default: 1.0,
  large: 1.15,
  'extra-large': 1.3,
};

const THEME_MODE_STORAGE_KEY = 'plantpal:theme-mode';
const FONT_SCALE_STORAGE_KEY = 'plantpal:font-scale-mode';

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

function isFontScaleMode(value: string | null): value is FontScaleMode {
  return value === 'small' || value === 'default' || value === 'large' || value === 'extra-large';
}

type ThemeContextValue = {
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  resolvedScheme: ResolvedScheme;
  Colors: ColorPalette;
  fontScaleMode: FontScaleMode;
  setFontScaleMode: (mode: FontScaleMode) => void;
  FontSize: FontSizeScale;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Device preference — 'light' | 'dark' | null/undefined depending on platform/state.
  const systemScheme = useColorScheme();

  const [themeMode, setThemeModeState] = useState<ThemeMode>('light');
  const [fontScaleMode, setFontScaleModeState] = useState<FontScaleMode>('default');

  // Load persisted preferences once on mount. Defaults ('system' / 'default')
  // are already in state, so there's nothing to show while this resolves.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [storedTheme, storedFontScale] = await Promise.all([
          AsyncStorage.getItem(THEME_MODE_STORAGE_KEY),
          AsyncStorage.getItem(FONT_SCALE_STORAGE_KEY),
        ]);
        if (!mounted) return;
        if (isThemeMode(storedTheme)) setThemeModeState(storedTheme);
        if (isFontScaleMode(storedFontScale)) setFontScaleModeState(storedFontScale);
      } catch {
        // Storage unavailable/corrupt — keep defaults.
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    AsyncStorage.setItem(THEME_MODE_STORAGE_KEY, mode).catch(() => {});
  }, []);

  const setFontScaleMode = useCallback((mode: FontScaleMode) => {
    setFontScaleModeState(mode);
    AsyncStorage.setItem(FONT_SCALE_STORAGE_KEY, mode).catch(() => {});
  }, []);

  const resolvedScheme: ResolvedScheme =
    themeMode === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : themeMode;

  const Colors = resolvedScheme === 'light' ? lightColors : darkColors;

  const FontSize = useMemo<FontSizeScale>(() => {
    const multiplier = FONT_SCALE_MULTIPLIERS[fontScaleMode];
    const entries = Object.entries(BASE_FONT_SIZE).map(
      ([key, value]) => [key, Math.round(value * multiplier)] as const,
    );
    return Object.fromEntries(entries) as FontSizeScale;
  }, [fontScaleMode]);

  const value = useMemo<ThemeContextValue>(
    () => ({ themeMode, setThemeMode, resolvedScheme, Colors, fontScaleMode, setFontScaleMode, FontSize }),
    [themeMode, setThemeMode, resolvedScheme, Colors, fontScaleMode, setFontScaleMode, FontSize],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
