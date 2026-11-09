import { AccountCircleOutlined, AdminPanelSettingsOutlined, AutoAwesome, BackpackOutlined, CottageOutlined, DarkMode, HomeOutlined, InfoOutlined, Language, LightMode, Menu as MenuIcon, PersonOutlined, SettingsBrightness, SportsEsportsOutlined } from '@mui/icons-material';
import { AppBar, Box, Button, Chip, CircularProgress, Container, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Stack, Toolbar, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, Route, Routes, useLocation } from 'react-router-dom';
import { useAdminAccessState } from './features/admin/useAdminAccessState';
import { BuildUpdateNotifier } from './features/version/BuildUpdateNotifier';
import { GameDeck } from './components/GameDeck';
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
  { to: '/', key: 'nav.home', icon: HomeOutlined },
  { to: '/refuge', key: 'nav.refuge', icon: CottageOutlined },
  { to: '/auth', key: 'nav.auth', icon: AccountCircleOutlined },
  { to: '/character', key: 'nav.character', icon: PersonOutlined },
  { to: '/game', key: 'nav.game', icon: SportsEsportsOutlined },
  { to: '/portals', key: 'nav.portals', icon: AutoAwesome },
  { to: '/inventory', key: 'nav.inventory', icon: BackpackOutlined },
  { to: '/admin', key: 'nav.admin', icon: AdminPanelSettingsOutlined },
  { to: '/version', key: 'nav.version', icon: InfoOutlined }
];

export function App() {
  const { t, i18n } = useTranslation('common');
  const { mode, cycleMode } = useVuxoTheme();
  const { build } = useBuildInfo();
  const location = useLocation();
  const isWorldRoute = location.pathname === '/game';
  const isHomeRoute = location.pathname === '/';
  const isDeckRoute = ['/refuge', '/inventory', '/character', '/portals'].includes(location.pathname);
  const isViewportRoute = isWorldRoute || isHomeRoute || isDeckRoute;
  const accessState = useAdminAccessState();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const visibleNavItems = navItems.filter(item => item.to !== '/admin' || accessState === 'administrator');
  const language = i18n.resolvedLanguage?.startsWith('en') ? 'en' : 'it';
  const ThemeIcon = mode === 'system' ? SettingsBrightness : mode === 'light' ? LightMode : DarkMode;
  const themeLabel = t('shell.theme') + ': ' + t('theme.' + mode);

  const toggleLanguage = () => void i18n.changeLanguage(language === 'it' ? 'en' : 'it');

  return (
    <Box data-testid="app-shell" className={isWorldRoute ? 'vuxo-app vuxo-app--world' : isHomeRoute ? 'vuxo-app vuxo-app--home' : 'vuxo-app'} sx={{
      minHeight: isViewportRoute ? '100dvh' : '100vh',
      height: isViewportRoute ? '100dvh' : undefined,
      display: 'flex',
      flexDirection: 'column',
      overflow: isViewportRoute ? 'hidden' : undefined,
      background: theme => 'radial-gradient(circle at 20% 0%, ' +
        alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.20 : 0.12) +
        ', transparent 38%), ' + theme.palette.background.default
    }}>
      <AppBar position="sticky" elevation={vuxoDesignTokens.elevation.appBar} color="transparent" className="vuxo-shell-bar" sx={{
        flexShrink: 0,
        zIndex: theme => theme.zIndex.appBar,
        backdropFilter: 'blur(20px)',
        borderBottom: 1,
        borderColor: 'divider',
        background: theme => 'linear-gradient(120deg, ' + alpha(theme.palette.background.paper, .98) + ', ' + alpha(theme.palette.background.paper, .9) + ' 65%, ' + alpha(theme.palette.primary.main, .14) + ')',
        boxShadow: theme => '0 10px 38px ' + alpha(theme.palette.common.black, theme.palette.mode === 'dark' ? .27 : .09),
      }}>
        <Toolbar className="vuxo-shell-toolbar" sx={{ gap: { xs: 0.5, sm: 1, lg: .5, xl: 1 }, minHeight: vuxoDesignTokens.layout.appBarMinHeight }}>
          <Box component={RouterLink} to="/" aria-label="VUXO" data-testid="shell-brand" className="vuxo-shell-brand" sx={{ color: 'text.primary', flexShrink: 0 }}>
            <Box component="span" aria-hidden="true" className="vuxo-shell-brand-rune">✦</Box>
            <Typography component="span" sx={{ fontWeight: 900, letterSpacing: '.12em', fontSize: { xs: '1.05rem', xl: '1.2rem' }, textShadow: theme => '0 0 22px ' + alpha(theme.palette.primary.main, 0.34) }}>VUXO</Typography>
          </Box>
          <Chip data-testid="shell-version" size="small" label={t('shell.version', { version: build?.version ?? '…' })} sx={{ display: { xs: 'none', md: 'inline-flex', lg: 'none', xl: 'inline-flex' } }} />
          <Stack component="nav" data-testid="desktop-nav" aria-label={t('shell.navigation')} className="vuxo-shell-tabs" direction="row" spacing={0.25} sx={{ ml: { lg: .5, xl: 1 }, minWidth: 0, display: { xs: 'none', lg: 'flex' } }}>
            {visibleNavItems.map(item => {
              const NavIcon = item.icon;
              const selected = location.pathname === item.to;
              return (
                <Button
                  key={item.to}
                  component={RouterLink}
                  to={item.to}
                  startIcon={<NavIcon sx={{ fontSize: '17px !important' }} />}
                  color="inherit"
                  size="small"
                  aria-current={selected ? 'page' : undefined}
                  data-active={selected ? 'true' : 'false'}
                  className="vuxo-shell-tab"
                  sx={{
                    flexShrink: 0,
                    border: 1,
                    borderColor: selected ? 'primary.main' : 'transparent',
                    bgcolor: selected ? 'action.selected' : 'transparent',
                    color: selected ? 'primary.main' : 'text.primary',
                  }}
                >
                  {t(item.key)}
                </Button>
              );
            })}
          </Stack>
          <Typography data-testid="shell-current-route" component="span" variant="caption" sx={{ display: { xs: 'none', sm: 'inline', lg: 'none' }, ml: 1, fontWeight: 800, color: 'primary.main' }}>
            {t(navItems.find(item => item.to === location.pathname)?.key ?? 'nav.home')}
          </Typography>
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
      <Drawer anchor="right" open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} sx={{
        '& .MuiDrawer-paper': {
          background: theme => 'linear-gradient(150deg, ' + theme.palette.background.paper + ', ' + alpha(theme.palette.primary.main, .11) + ')',
          borderLeft: 1,
          borderColor: 'divider',
        }
      }}>
        <Box id="vuxo-mobile-navigation" component="nav" data-testid="mobile-nav" aria-label={t('shell.navigation')} className="vuxo-mobile-navigation" sx={{ width: { xs: 'min(86vw, 340px)', sm: 340 }, p: 2, height: '100%', overflowY: 'auto' }}>
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>VUXO</Typography>
            <Button onClick={() => setMobileMenuOpen(false)}>{t('shell.closeMenu')}</Button>
          </Stack>
          <List disablePadding className="vuxo-shell-drawer-list">
            {visibleNavItems.map(item => {
              const NavIcon = item.icon;
              const selected = location.pathname === item.to;
              return (
                <ListItemButton key={item.to} component={RouterLink} to={item.to} selected={selected} aria-current={selected ? 'page' : undefined} onClick={() => setMobileMenuOpen(false)} sx={{
                  mb: .6, gap: 1, borderRadius: 2, minHeight: 48,
                  border: 1, borderColor: selected ? 'primary.main' : 'divider',
                  bgcolor: selected ? 'action.selected' : 'transparent',
                  '&:focus-visible': { outline: 2, outlineColor: 'primary.main' },
                }}>
                  <ListItemIcon sx={{ minWidth: 28, color: selected ? 'primary.main' : 'text.secondary' }}><NavIcon fontSize="small" /></ListItemIcon>
                  <ListItemText primary={t(item.key)} sx={{ '& .MuiTypography-root': { fontWeight: selected ? 800 : 600 } }} />
                </ListItemButton>
              );
            })}
          </List>
        </Box>
      </Drawer>
      <Container component="main" maxWidth={isViewportRoute ? false : 'xl'} disableGutters={isViewportRoute} sx={{
        flex: isViewportRoute ? '1 1 auto' : undefined,
        minHeight: 0,
        minWidth: 0,
        width: '100%',
        overflow: isViewportRoute ? 'hidden' : undefined,
        display: isViewportRoute ? 'flex' : undefined,
        py: isViewportRoute ? 0 : { xs: vuxoDesignTokens.layout.pagePaddingYMobile, md: vuxoDesignTokens.layout.pagePaddingYDesktop },
      }}>
        <Suspense fallback={
          <Stack role="status" data-testid="route-loading" direction="row" spacing={2} sx={{ alignItems: 'center', py: 5 }}>
            <CircularProgress size={28} aria-label={t('shell.loadingPage')} />
            <Typography color="text.secondary">{t('shell.loadingPage')}</Typography>
          </Stack>
        }>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/refuge" element={<GameDeck><RefugePage /></GameDeck>} />
          <Route path="/refuge/journal" element={<RefugeJournalPage />} />
          <Route path="/refuge/training" element={<RuneTrainingPage />} />
          <Route path="/refuge/reflex" element={<ReflexTrainingPage />} />
          <Route path="/refuge/path" element={<RunePathPage />} />
          <Route path="/character" element={<GameDeck><CharacterEditorPage /></GameDeck>} />
          <Route path="/game" element={<GamePage />} />
          <Route path="/portals" element={<GameDeck><PortalChallengesPage /></GameDeck>} />
          <Route path="/inventory" element={<GameDeck><InventoryPage /></GameDeck>} />
          <Route path="/admin" element={<AdminRoute />} />
          <Route path="/version" element={<VersionPage />} />
        </Routes>
        </Suspense>
      </Container>
      <BuildUpdateNotifier />
    </Box>
  );
}
