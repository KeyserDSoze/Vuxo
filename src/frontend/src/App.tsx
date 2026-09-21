import { DarkMode, Language, LightMode, SettingsBrightness } from '@mui/icons-material';
import { AppBar, Box, Button, Chip, Container, Stack, Toolbar, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, Route, Routes } from 'react-router-dom';
import { AdminRoute } from './pages/AdminRoute';
import { AuthPage } from './pages/AuthPage';
import { CharacterEditorPage } from './pages/CharacterEditorPage';
import { GamePage } from './pages/GamePage';
import { HomePage } from './pages/HomePage';
import { VersionPage } from './pages/VersionPage';
import { BuildUpdateNotifier } from './features/version/BuildUpdateNotifier';
import { useBuildInfo } from './features/version/BuildInfoProvider';
import { useVuxoTheme } from './theme/VuxoThemeProvider';
import { vuxoDesignTokens } from './theme/tokens';

const navItems = [
  { to: '/', key: 'nav.home' },
  { to: '/auth', key: 'nav.auth' },
  { to: '/character', key: 'nav.character' },
  { to: '/game', key: 'nav.game' },
  { to: '/admin', key: 'nav.admin' },
  { to: '/version', key: 'nav.version' }
];

export function App() {
  const { t, i18n } = useTranslation('common');
  const { mode, cycleMode } = useVuxoTheme();
  const { build } = useBuildInfo();
  const language = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'it';
  const ThemeIcon = mode === 'system' ? SettingsBrightness : mode === 'light' ? LightMode : DarkMode;

  const toggleLanguage = () => void i18n.changeLanguage(language === 'it' ? 'en' : 'it');

  return (
    <Box sx={{
      minHeight: '100vh',
      background: theme => `radial-gradient(circle at 20% 0%, ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.20 : 0.12)}, transparent 38%), ${theme.palette.background.default}`,
    }}>
      <AppBar position="sticky" elevation={vuxoDesignTokens.elevation.appBar} color="transparent" sx={{ backdropFilter: 'blur(18px)', borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 1.5, minHeight: vuxoDesignTokens.layout.appBarMinHeight }}>
          <Typography variant="h6" sx={{ fontWeight: 900, letterSpacing: '-0.04em' }}>VUXO</Typography>
          <Chip data-testid="shell-version" size="small" label={t('shell.version', { version: build?.version ?? '…' })} sx={{ display: { xs: 'none', md: 'inline-flex' } }} />
          <Stack component="nav" aria-label={t('shell.navigation')} direction="row" spacing={0.5} sx={{ ml: { xs: 0, sm: 2 }, overflowX: 'auto' }}>
            {navItems.map(item => (
              <Button key={item.to} component={RouterLink} to={item.to} color="inherit" size="small">
                {t(item.key)}
              </Button>
            ))}
          </Stack>
          <Box sx={{ flexGrow: 1 }} />
          <Tooltip title={`${t('shell.theme')}: ${t(`theme.${mode}`)}`}>
            <Button data-testid="theme-toggle" aria-label={`${t('shell.theme')}: ${t(`theme.${mode}`)}`} color="inherit" size="small" onClick={cycleMode} startIcon={<ThemeIcon />}>
              <Box component="span" sx={{ display: { xs: 'none', lg: 'inline' } }}>{t(`theme.${mode}`)}</Box>
            </Button>
          </Tooltip>
          <Tooltip title={t('shell.language')}>
            <Button data-testid="language-toggle" aria-label={`${t('shell.language')}: ${language.toUpperCase()}`} color="inherit" size="small" onClick={toggleLanguage} startIcon={<Language />}>
              {language.toUpperCase()}
            </Button>
          </Tooltip>
        </Toolbar>
      </AppBar>
      <Container component="main" maxWidth="xl" sx={{ py: { xs: vuxoDesignTokens.layout.pagePaddingYMobile, md: vuxoDesignTokens.layout.pagePaddingYDesktop } }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/character" element={<CharacterEditorPage />} />
          <Route path="/game" element={<GamePage />} />
          <Route path="/admin" element={<AdminRoute />} />
          <Route path="/version" element={<VersionPage />} />
        </Routes>
      </Container>
      <BuildUpdateNotifier />
    </Box>
  );
}
