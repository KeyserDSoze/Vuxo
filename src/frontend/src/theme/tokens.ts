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
