import { DarkMode, Language, LightMode, SettingsBrightness } from '@mui/icons-material';
import { AppBar, Box, Button, Chip, Container, Stack, Toolbar, Tooltip, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, Route, Routes } from 'react-router-dom';
import { AdminPage } from './pages/AdminPage';
import { GamePage } from './pages/GamePage';
import { HomePage } from './pages/HomePage';
import { VersionPage } from './pages/VersionPage';
import { useVuxoTheme } from './theme/VuxoThemeProvider';

const navItems = [
  { to: '/', key: 'nav.home' },
  { to: '/game', key: 'nav.game' },
  { to: '/admin', key: 'nav.admin' },
  { to: '/version', key: 'nav.version' }
];

export function App() {
  const { t, i18n } = useTranslation();
  const { mode, cycleMode } = useVuxoTheme();
  const language = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'it';
  const ThemeIcon = mode === 'system' ? SettingsBrightness : mode === 'light' ? LightMode : DarkMode;

  const toggleLanguage = () => void i18n.changeLanguage(language === 'it' ? 'en' : 'it');

  return (
    <Box sx={{ minHeight: '100vh', background: theme => theme.palette.mode === 'dark'
      ? 'radial-gradient(circle at 20% 0%, rgba(49,87,213,.20), transparent 38%), #070b14'
      : 'radial-gradient(circle at 20% 0%, rgba(49,87,213,.12), transparent 38%), #f5f7fb' }}>
      <AppBar position="sticky" elevation={0} color="transparent" sx={{ backdropFilter: 'blur(18px)', borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 1.5, minHeight: 68 }}>
          <Typography variant="h6" sx={{ fontWeight: 900, letterSpacing: '-0.04em' }}>VUXO</Typography>
          <Chip size="small" label={t('shell.version', { version: '0.0.1' })} sx={{ display: { xs: 'none', md: 'inline-flex' } }} />
          <Stack component="nav" direction="row" spacing={0.5} sx={{ ml: { xs: 0, sm: 2 }, overflowX: 'auto' }}>
            {navItems.map(item => (
              <Button key={item.to} component={RouterLink} to={item.to} color="inherit" size="small">
                {t(item.key)}
              </Button>
            ))}
          </Stack>
          <Box sx={{ flexGrow: 1 }} />
          <Tooltip title={`${t('shell.theme')}: ${t(`theme.${mode}`)}`}>
            <Button data-testid="theme-toggle" color="inherit" size="small" onClick={cycleMode} startIcon={<ThemeIcon />}>
              <Box component="span" sx={{ display: { xs: 'none', lg: 'inline' } }}>{t(`theme.${mode}`)}</Box>
            </Button>
          </Tooltip>
          <Tooltip title={t('shell.language')}>
            <Button data-testid="language-toggle" color="inherit" size="small" onClick={toggleLanguage} startIcon={<Language />}>
              {language.toUpperCase()}
            </Button>
          </Tooltip>
        </Toolbar>
      </AppBar>
      <Container component="main" maxWidth="xl" sx={{ py: { xs: 3, md: 6 } }}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/game" element={<GamePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/version" element={<VersionPage />} />
        </Routes>
      </Container>
    </Box>
  );
}
