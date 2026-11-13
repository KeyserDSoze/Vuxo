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
            root: {
              borderRadius: vuxoDesignTokens.radius.pill,
              '&.Mui-focusVisible': {
                outline: `3px solid ${palette.focusRing}`,
                outlineOffset: 2,
              },
            },
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

  useEffect(() => {
    writeThemePreference(mode);
    const palette = vuxoDesignTokens.palette[effectiveMode];
    const sky = vuxoDesignTokens.landing[effectiveMode];
    const root = document.documentElement;
    root.dataset.theme = effectiveMode;
    root.style.colorScheme = effectiveMode;
    // #234: the runic night vista is shared by Home and every off-world deck screen.
    const variables: Record<string, string> = {
      '--vuxo-focus-ring': palette.focusRing,
      '--vuxo-game-canvas-bg': palette.gameCanvas,
      '--vuxo-game-hud-bg': palette.gameHud,
      '--vuxo-game-hud-text': palette.gameHudText,
      '--vuxo-game-hud-border': palette.gameHudBorder,
      '--vuxo-game-hud-accent': palette.gameHudAccent,
      '--vuxo-text-primary': theme.palette.text.primary,
      '--vuxo-primary': theme.palette.primary.main,
      '--vuxo-secondary': theme.palette.secondary.main,
      '--vuxo-sky-top': sky.skyTop,
      '--vuxo-sky-bottom': sky.skyBottom,
      '--vuxo-sky-horizon': sky.horizon,
      '--vuxo-sky-land': sky.land,
      '--vuxo-sky-text': sky.text,
      '--vuxo-sky-muted': sky.muted,
      '--vuxo-rune-world': sky.realms.world,
      '--vuxo-rune-character': sky.realms.character,
      '--vuxo-rune-portals': sky.realms.portals,
    };
    for (const [name, value] of Object.entries(variables)) root.style.setProperty(name, value);
  }, [mode, effectiveMode, theme]);

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
