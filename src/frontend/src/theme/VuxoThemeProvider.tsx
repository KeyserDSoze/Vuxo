import { CssBaseline, ThemeProvider, createTheme, useMediaQuery } from '@mui/material';
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { readThemePreference, writeThemePreference, type ThemePreference } from '../preferences/uiPreferences';
import { vuxoDesignTokens } from './tokens';

export type VuxoThemeMode = ThemePreference;

type ThemeModeContextValue = {
  mode: VuxoThemeMode;
  effectiveMode: 'light' | 'dark';
  setMode: (mode: VuxoThemeMode) => void;
  cycleMode: () => void;
};

const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

export function VuxoThemeProvider({ children }: PropsWithChildren) {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true });
  const [mode, setMode] = useState<VuxoThemeMode>(readThemePreference);
  const effectiveMode = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    writeThemePreference(mode);
    const palette = vuxoDesignTokens.palette[effectiveMode];
    document.documentElement.dataset.theme = effectiveMode;
    document.documentElement.style.colorScheme = effectiveMode;
    document.documentElement.style.setProperty('--vuxo-focus-ring', palette.focusRing);
    document.documentElement.style.setProperty('--vuxo-game-canvas-bg', palette.gameCanvas);
  }, [mode, effectiveMode]);

  const theme = useMemo(() => {
    const palette = vuxoDesignTokens.palette[effectiveMode];
    return createTheme({
      spacing: vuxoDesignTokens.spacing,
      breakpoints: { values: vuxoDesignTokens.breakpoints },
      palette: {
        mode: effectiveMode,
        primary: { main: palette.primary },
        secondary: { main: palette.secondary },
        background: { default: palette.background, paper: palette.paper },
      },
      shape: { borderRadius: vuxoDesignTokens.radius.surface },
      typography: {
        fontFamily: vuxoDesignTokens.typography.fontFamily,
        h1: {
          fontWeight: vuxoDesignTokens.typography.h1Weight,
          letterSpacing: vuxoDesignTokens.typography.h1LetterSpacing,
        },
        h2: {
          fontWeight: vuxoDesignTokens.typography.h2Weight,
          letterSpacing: vuxoDesignTokens.typography.h2LetterSpacing,
        },
        button: {
          textTransform: 'none',
          fontWeight: vuxoDesignTokens.typography.buttonWeight,
        },
      },
      components: {
        MuiButton: {
          styleOverrides: {
            root: { borderRadius: vuxoDesignTokens.radius.pill },
          },
        },
        MuiPaper: {
          styleOverrides: {
            root: { backgroundImage: 'none' },
          },
        },
      },
    });
  }, [effectiveMode]);

  const context = useMemo<ThemeModeContextValue>(() => ({
    mode,
    effectiveMode,
    setMode,
    cycleMode: () => setMode(current => current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system')
  }), [mode, effectiveMode]);

  return (
    <ThemeModeContext.Provider value={context}>
      <ThemeProvider theme={theme}>
        <CssBaseline enableColorScheme />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

export function useVuxoTheme() {
  const value = useContext(ThemeModeContext);
  if (!value) throw new Error('useVuxoTheme must be used inside VuxoThemeProvider');
  return value;
}
