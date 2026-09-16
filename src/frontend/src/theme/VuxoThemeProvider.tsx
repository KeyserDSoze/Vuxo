import { CssBaseline, ThemeProvider, createTheme, useMediaQuery } from '@mui/material';
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';

export type VuxoThemeMode = 'system' | 'light' | 'dark';

type ThemeModeContextValue = {
  mode: VuxoThemeMode;
  effectiveMode: 'light' | 'dark';
  setMode: (mode: VuxoThemeMode) => void;
  cycleMode: () => void;
};

const STORAGE_KEY = 'vuxo.theme';
const ThemeModeContext = createContext<ThemeModeContextValue | null>(null);

function readStoredMode(): VuxoThemeMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}

export function VuxoThemeProvider({ children }: PropsWithChildren) {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)', { noSsr: true });
  const [mode, setMode] = useState<VuxoThemeMode>(readStoredMode);
  const effectiveMode = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
    document.documentElement.dataset.theme = effectiveMode;
    document.documentElement.style.colorScheme = effectiveMode;
  }, [mode, effectiveMode]);

  const theme = useMemo(() => createTheme({
    palette: {
      mode: effectiveMode,
      primary: { main: effectiveMode === 'dark' ? '#8ab4ff' : '#3157d5' },
      secondary: { main: effectiveMode === 'dark' ? '#ffcc66' : '#b96d00' },
      background: effectiveMode === 'dark'
        ? { default: '#070b14', paper: '#101827' }
        : { default: '#f5f7fb', paper: '#ffffff' }
    },
    shape: { borderRadius: 14 },
    typography: {
      fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      h1: { fontWeight: 800, letterSpacing: '-0.045em' },
      h2: { fontWeight: 750, letterSpacing: '-0.03em' },
      button: { textTransform: 'none', fontWeight: 700 }
    },
    components: {
      MuiButton: { styleOverrides: { root: { borderRadius: 999 } } },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } }
    }
  }), [effectiveMode]);

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
