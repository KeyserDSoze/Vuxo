import { DarkMode, Language, LightMode, Menu as MenuIcon, SettingsBrightness } from '@mui/icons-material';
import { AppBar, Box, Button, Chip, CircularProgress, Container, Drawer, IconButton, List, ListItemButton, ListItemText, Stack, Toolbar, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, Route, Routes, useLocation } from 'react-router-dom';
import { useAdminAccessState } from './features/admin/useAdminAccessState';
import { BuildUpdateNotifier } from './features/version/BuildUpdateNotifier';
import { useBuildInfo } from './features/version/BuildInfoProvider';
import { AuthPage } from './pages/AuthPage';
import { CharacterEditorPage } from './pages/CharacterEditorPage';
import { HomePage } from './pages/HomePage';
import { InventoryPage } from './pages/InventoryPage';
import { PortalChallengesPage } from './pages/PortalChallengesPage';
import { VersionPage } from './pages/VersionPage';
import { useVuxoTheme } from './theme/VuxoThemeProvider';
import { vuxoDesignTokens } from './theme/tokens';

// Heavy routes must not download their bundles while a visitor reads the home.
const GamePage = lazy(() => import('./pages/GamePage').then(module => ({ default: module.GamePage })));
const AdminRoute = lazy(() => import('./pages/AdminRoute').then(module => ({ default: module.AdminRoute })));
const RefugePage = lazy(() => import('./pages/RefugePage').then(module => ({ default: module.RefugePage })));
const RefugeJournalPage = lazy(() => import('./pages/RefugeJournalPage').then(module => ({ default: module.RefugeJournalPage })));
const RuneTrainingPage = lazy(() => import('./pages/RuneTrainingPage').then(module => ({ default: module.RuneTrainingPage })));
const ReflexTrainingPage = lazy(() => import('./pages/ReflexTrainingPage').then(module => ({ default: module.ReflexTrainingPage })));
const RunePathPage = lazy(() => import('./pages/RunePathPage').then(module => ({ default: module.RunePathPage })));

const navItems = [
  { to: '/', key: 'nav.home' },
  { to: '/refuge', key: 'nav.refuge' },
  { to: '/auth', key: 'nav.auth' },
  { to: '/character', key: 'nav.character' },
  { to: '/game', key: 'nav.game' },
  { to: '/portals', key: 'nav.portals' },
  { to: '/inventory', key: 'nav.inventory' },
  { to: '/admin', key: 'nav.admin' },
  { to: '/version', key: 'nav.version' }
];

export function App() {
  const { t, i18n } = useTranslation('common');
  const { mode, cycleMode } = useVuxoTheme();
  const { build } = useBuildInfo();
  const location = useLocation();
  const accessState = useAdminAccessState();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const visibleNavItems = navItems.filter(item => item.to !== '/admin' || accessState === 'administrator');
  const language = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'it';
  const ThemeIcon = mode === 'system' ? SettingsBrightness : mode === 'light' ? LightMode : DarkMode;
  const themeLabel = t('shell.theme') + ': ' + t('theme.' + mode);

  const toggleLanguage = () => void i18n.changeLanguage(language === 'it' ? 'en' : 'it');

  return (
    <Box sx={{
      minHeight: '100vh',
      background: theme => 'radial-gradient(circle at 20% 0%, ' +
        alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.20 : 0.12) +
        ', transparent 38%), ' + theme.palette.background.default
    }}>
      <AppBar position="sticky" elevation={vuxoDesignTokens.elevation.appBar} color="transparent" sx={{ backdropFilter: 'blur(18px)', borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ gap: { xs: 0.5, sm: 1.5 }, minHeight: vuxoDesignTokens.layout.appBarMinHeight }}>
          <Typography variant="h6" sx={{ fontWeight: 900, letterSpacing: '-0.04em', flexShrink: 0 }}>VUXO</Typography>
          <Chip data-testid="shell-version" size="small" label={t('shell.version', { version: build?.version ?? '…' })} sx={{ display: { xs: 'none', md: 'inline-flex', lg: 'none', xl: 'inline-flex' } }} />
          <Stack component="nav" data-testid="desktop-nav" aria-label={t('shell.navigation')} direction="row" spacing={0.5} sx={{ ml: 1, minWidth: 0, display: { xs: 'none', lg: 'flex' } }}>
            {visibleNavItems.map(item => (
              <Button key={item.to} component={RouterLink} to={item.to} color="inherit" size="small" aria-current={location.pathname === item.to ? 'page' : undefined} sx={{ flexShrink: 0 }}>
                {t(item.key)}
              </Button>
            ))}
          </Stack>
          <Box sx={{ flexGrow: 1 }} />
          <Tooltip title={themeLabel}>
            <Button data-testid="theme-toggle" aria-label={themeLabel} color="inherit" size="small" onClick={cycleMode} startIcon={<ThemeIcon />}>
              <Box component="span" sx={{ display: { xs: 'none', xl: 'inline' } }}>{t('theme.' + mode)}</Box>
            </Button>
          </Tooltip>
          <Tooltip title={t('shell.language')}>
            <Button data-testid="language-toggle" aria-label={t('shell.language') + ': ' + language.toUpperCase()} color="inherit" size="small" onClick={toggleLanguage} startIcon={<Language />}>
              {language.toUpperCase()}
            </Button>
          </Tooltip>
          <IconButton data-testid="mobile-menu-toggle" aria-label={t('shell.openMenu')} aria-expanded={mobileMenuOpen} aria-controls="vuxo-mobile-navigation" color="inherit" onClick={() => setMobileMenuOpen(true)} sx={{ display: { xs: 'inline-flex', lg: 'none' } }}>
            <MenuIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Drawer anchor="right" open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)}>
        <Box id="vuxo-mobile-navigation" component="nav" data-testid="mobile-nav" aria-label={t('shell.navigation')} sx={{ width: { xs: 'min(85vw, 320px)', sm: 320 }, p: 2 }}>
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>VUXO</Typography>
            <Button onClick={() => setMobileMenuOpen(false)}>{t('shell.closeMenu')}</Button>
          </Stack>
          <List disablePadding>
            {visibleNavItems.map(item => (
              <ListItemButton key={item.to} component={RouterLink} to={item.to} selected={location.pathname === item.to} aria-current={location.pathname === item.to ? 'page' : undefined} onClick={() => setMobileMenuOpen(false)}>
                <ListItemText primary={t(item.key)} />
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>
      <Container component="main" maxWidth="xl" sx={{ py: { xs: vuxoDesignTokens.layout.pagePaddingYMobile, md: vuxoDesignTokens.layout.pagePaddingYDesktop } }}>
        <Suspense fallback={
          <Stack role="status" data-testid="route-loading" direction="row" spacing={2} sx={{ alignItems: 'center', py: 5 }}>
            <CircularProgress size={28} aria-label={t('shell.loadingPage')} />
            <Typography color="text.secondary">{t('shell.loadingPage')}</Typography>
          </Stack>
        }>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/refuge" element={<RefugePage />} />
          <Route path="/refuge/journal" element={<RefugeJournalPage />} />
          <Route path="/refuge/training" element={<RuneTrainingPage />} />
          <Route path="/refuge/reflex" element={<ReflexTrainingPage />} />
          <Route path="/refuge/path" element={<RunePathPage />} />
          <Route path="/character" element={<CharacterEditorPage />} />
          <Route path="/game" element={<GamePage />} />
          <Route path="/portals" element={<PortalChallengesPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/admin" element={<AdminRoute />} />
          <Route path="/version" element={<VersionPage />} />
        </Routes>
        </Suspense>
      </Container>
      <BuildUpdateNotifier />
    </Box>
  );
}
