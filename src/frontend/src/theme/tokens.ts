export const vuxoDesignTokens = {
  spacing: 8,
  breakpoints: {
    xs: 0,
    sm: 600,
    md: 900,
    lg: 1200,
    xl: 1536,
  },
  radius: {
    surface: 14,
    canvas: 12,
    pill: 999,
  },
  elevation: {
    appBar: 0,
    surface: 0,
    floating: 8,
  },
  layout: {
    appBarMinHeight: 68,
    pagePaddingYMobile: 3,
    pagePaddingYDesktop: 6,
  },
  typography: {
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1Weight: 800,
    h1LetterSpacing: '-0.045em',
    h2Weight: 750,
    h2LetterSpacing: '-0.03em',
    buttonWeight: 700,
  },
  landing: {
    light: {
      // The illustrated scene is intentionally a night-sky vista in both app themes.
      skyTop: '#122045',
      skyBottom: '#243b5e',
      horizon: '#487b89',
      landBack: '#203a52',
      land: '#111c3e',
      text: '#f9fbff',
      muted: '#d4e6ef',
      realms: { world: '#9bf2e5', character: '#ffd68e', portals: '#e2b2ff' },
    },
    dark: {
      skyTop: '#060f28',
      skyBottom: '#181638',
      horizon: '#3b4773',
      landBack: '#111d37',
      land: '#070e22',
      text: '#f5f8ff',
      muted: '#c3cbdf',
      realms: { world: '#82e7d7', character: '#ffc77b', portals: '#cba8ff' },
    },
  },
  palette: {
    light: {
      primary: '#3157d5',
      secondary: '#b96d00',
      background: '#f5f7fb',
      paper: '#ffffff',
      focusRing: '#2049c7',
      gameCanvas: '#e8eefc',
    },
    dark: {
      primary: '#8ab4ff',
      secondary: '#ffcc66',
      background: '#070b14',
      paper: '#101827',
      focusRing: '#b7d0ff',
      gameCanvas: '#172554',
    },
  },
} as const;
