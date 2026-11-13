import {
  AccountCircleOutlined, AdminPanelSettingsOutlined, AutoAwesome, BackpackOutlined, CottageOutlined,
  HistoryEduOutlined, InfoOutlined, PersonOutlined, RouteOutlined, SportsEsportsOutlined, TouchAppOutlined,
} from '@mui/icons-material';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import { Suspense, useEffect, useRef, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';
import { DeckSky } from './DeckSky';
import './game-deck.css';
import { moveRovingRailFocus } from './rovingRailFocus';

const routes = [
  { to: '/refuge', label: 'nav.refuge', icon: CottageOutlined, name: 'refuge' },
  { to: '/character', label: 'nav.character', icon: PersonOutlined, name: 'character' },
  { to: '/inventory', label: 'nav.inventory', icon: BackpackOutlined, name: 'inventory' },
  { to: '/portals', label: 'nav.portals', icon: AutoAwesome, name: 'portals' },
  { to: '/game', label: 'nav.game', icon: SportsEsportsOutlined, name: 'game' },
] as const;

type DeckRoute = typeof routes[number];
type DeckPage = { name: string; label: string; icon: typeof CottageOutlined; parent?: DeckRoute };

const refuge = routes[0];
// Refuge chambers keep the Refuge rail entry lit; system screens light none.
const pages: Record<string, DeckPage> = {
  '/refuge/journal': { name: 'journal', label: 'deck.pages.journal', icon: HistoryEduOutlined, parent: refuge },
  '/refuge/training': { name: 'training', label: 'deck.pages.training', icon: SportsEsportsOutlined, parent: refuge },
  '/refuge/reflex': { name: 'reflex', label: 'deck.pages.reflex', icon: TouchAppOutlined, parent: refuge },
  '/refuge/path': { name: 'path', label: 'deck.pages.path', icon: RouteOutlined, parent: refuge },
  '/auth': { name: 'auth', label: 'nav.auth', icon: AccountCircleOutlined },
  '/admin': { name: 'admin', label: 'nav.admin', icon: AdminPanelSettingsOutlined },
  '/version': { name: 'version', label: 'nav.version', icon: InfoOutlined },
};

function resolveDeckPage(pathname: string): { section: DeckRoute | null; page: DeckPage } {
  const route = routes.find(item => item.to === pathname);
  if (route) return { section: route, page: route };
  const page = pages[pathname];
  if (page) return { section: page.parent ?? null, page };
  return { section: refuge, page: refuge };
}

/**
 * Presentation-only off-world command deck shared by every non-world screen.
 * It owns the one-page layout (rail, breadcrumb and the only scrollable panel)
 * but never account state, authorization or gameplay data.
 */
export function GameDeck() {
  const { t } = useTranslation();
  const location = useLocation();
  const { section, page } = resolveDeckPage(location.pathname);
  const PageIcon = page.icon;
  const activeLinkRef = useRef<HTMLAnchorElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeLinkRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [location.pathname]);

  // Controller-like directional focus without turning links into tabs.
  // Enter still activates the route, Tab still navigates normally. Read the
  // actual rail orientation: a resized page changes from row to column
  // without an extra JS breakpoint that might disagree with the CSS.
  const onRailKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const rail = event.currentTarget.querySelector<HTMLElement>('.vuxo-deck__routes');
    if (!rail) return;
    moveRovingRailFocus(event, '.vuxo-deck__route',
      getComputedStyle(rail).flexDirection.startsWith('row'));
  };

  return (
    <Box className="vuxo-deck" data-testid="game-deck" data-route={section?.name ?? page.name} data-page={page.name}>
      <DeckSky />
      <Box component="nav" className="vuxo-deck__rail" aria-label={t('shell.navigation')}
        onKeyDown={onRailKeyDown} data-testid="game-deck-navigation">
        <Box className="vuxo-deck__sigil" aria-hidden="true">
          <span>✦</span>
          <Typography component="span" sx={{ fontSize: '.77rem', fontWeight: 900, letterSpacing: '.14em' }}>VUXO</Typography>
        </Box>
        <Stack className="vuxo-deck__routes" spacing={0}>
          {routes.map(route => {
            const Icon = route.icon;
            const active = route === section;
            return (
              <Box
                key={route.to}
                component={RouterLink}
                ref={active ? activeLinkRef : undefined}
                to={route.to}
                className="vuxo-deck__route"
                data-testid={`game-deck-link-${route.name}`}
                data-active={active ? 'true' : 'false'}
                aria-label={t(route.label)}
                title={t(route.label)}
                aria-current={active ? (route === page ? 'page' : 'true') : undefined}
              >
                <Icon aria-hidden="true" fontSize="small" />
                <Typography component="span" variant="body2" sx={{ fontWeight: active ? 800 : 650 }}>
                  {t(route.label)}
                </Typography>
              </Box>
            );
          })}
        </Stack>
      </Box>

      <Box component="section" className="vuxo-deck__main">
        <Stack component="nav" aria-label={t('deck.breadcrumb')} className="vuxo-deck__topline" direction="row" sx={{ alignItems: 'center' }}>
          <Box className="vuxo-deck__topline-rune" aria-hidden="true">
            <PageIcon fontSize="small" />
          </Box>
          <Typography component="span" variant="overline" className="vuxo-deck__topline-brand">VUXO</Typography>
          <Box component="span" className="vuxo-deck__crumb-separator" aria-hidden="true">✦</Box>
          {page.parent ? (
            <>
              <Box component={RouterLink} to={page.parent.to} className="vuxo-deck__crumb-link" data-testid="game-deck-parent">
                {t(page.parent.label)}
              </Box>
              <Box component="span" className="vuxo-deck__crumb-separator" aria-hidden="true">✦</Box>
            </>
          ) : null}
          <Typography component="span" variant="subtitle2" className="vuxo-deck__crumb-current" data-testid="game-deck-current">
            {t(page.label)}
          </Typography>
        </Stack>
        <Box ref={scrollRef} className="vuxo-deck__scroll" tabIndex={0} role="region"
          aria-label={t(page.label)} data-testid="game-deck-scroll" sx={{ bgcolor: 'background.paper' }}>
          <Suspense fallback={
            <Stack role="status" data-testid="game-deck-loading" direction="row" spacing={2} sx={{ alignItems: 'center', justifyContent: 'center', py: 5 }}>
              <CircularProgress size={28} aria-label={t('shell.loadingPage')} />
              <Typography color="text.secondary">{t('shell.loadingPage')}</Typography>
            </Stack>
          }>
            {/* Keyed by route so each screen enters with the runic reveal. */}
            <Box key={location.pathname} className="vuxo-deck__page">
              <Outlet />
            </Box>
          </Suspense>
        </Box>
      </Box>
    </Box>
  );
}
