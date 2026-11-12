import { AutoAwesome, BackpackOutlined, CottageOutlined, PersonOutlined, SportsEsportsOutlined } from '@mui/icons-material';
import { Box, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useEffect, useRef, type KeyboardEvent, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import './game-deck.css';

const routes = [
  { to: '/refuge', label: 'nav.refuge', icon: CottageOutlined, name: 'refuge' },
  { to: '/character', label: 'nav.character', icon: PersonOutlined, name: 'character' },
  { to: '/inventory', label: 'nav.inventory', icon: BackpackOutlined, name: 'inventory' },
  { to: '/portals', label: 'nav.portals', icon: AutoAwesome, name: 'portals' },
  { to: '/game', label: 'nav.game', icon: SportsEsportsOutlined, name: 'game' },
] as const;

/**
 * Presentation-only off-world command deck. It does not own account state,
 * authorize gameplay or remount the individual page on viewport changes.
 */
export function GameDeck({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const location = useLocation();
  const selected = routes.find(route => route.to === location.pathname) ?? routes[0];
  const SelectedIcon = selected.icon;
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
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    if (!(target instanceof HTMLAnchorElement) || !target.classList.contains('vuxo-deck__route')) return;
    const links = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>('.vuxo-deck__route'));
    const current = links.indexOf(target);
    const routesContainer = event.currentTarget.querySelector<HTMLElement>('.vuxo-deck__routes');
    if (current < 0 || !routesContainer || links.length === 0) return;
    const horizontal = getComputedStyle(routesContainer).flexDirection.startsWith('row');
    let next: number | null = null;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = links.length - 1;
    else if (event.key === (horizontal ? 'ArrowRight' : 'ArrowDown')) next = (current + 1) % links.length;
    else if (event.key === (horizontal ? 'ArrowLeft' : 'ArrowUp')) next = (current - 1 + links.length) % links.length;
    if (next === null) return;

    event.preventDefault();
    links[next]?.focus();
  };

  return (
    <Box className="vuxo-deck" data-testid="game-deck" data-route={selected.name}
      sx={{
        background: theme => `radial-gradient(circle at 14% 14%, ${alpha(theme.palette.primary.main, .17)}, transparent 36%), ${theme.palette.background.default}`,
      }}>
      <Box component="nav" className="vuxo-deck__rail" aria-label={t('shell.navigation')}
        onKeyDown={onRailKeyDown} data-testid="game-deck-navigation"
        sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
        <Box className="vuxo-deck__sigil" aria-hidden="true" sx={{ color: 'primary.main' }}>
          <span>✦</span>
          <Typography component="span" sx={{ fontSize: '.77rem', fontWeight: 900, letterSpacing: '.14em' }}>VUXO</Typography>
        </Box>
        <Stack className="vuxo-deck__routes" spacing={0}>
          {routes.map(route => {
            const Icon = route.icon;
            const active = route.to === location.pathname;
            return (
              <Box
                key={route.to}
                component={RouterLink}
                ref={active ? activeLinkRef : undefined}
                to={route.to}
                className="vuxo-deck__route"
                data-testid={`game-deck-link-${route.name}`}
                aria-label={t(route.label)}
                title={t(route.label)}
                aria-current={active ? 'page' : undefined}
                sx={{
                  color: active ? 'primary.main' : 'text.secondary',
                  bgcolor: active ? 'action.selected' : 'transparent',
                  borderColor: active ? 'primary.main' : 'transparent',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
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

      <Box component="section" className="vuxo-deck__main" sx={{ borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Stack className="vuxo-deck__topline" direction="row" sx={{ alignItems: 'center', gap: 1.25, borderColor: 'divider' }}>
          <Box className="vuxo-deck__topline-rune" aria-hidden="true" sx={{ color: 'primary.main', bgcolor: 'action.hover' }}>
            <SelectedIcon fontSize="small" />
          </Box>
          <Typography component="span" variant="overline" sx={{ color: 'text.secondary', fontWeight: 850, letterSpacing: '.15em' }}>
            VUXO
          </Typography>
          <Box component="span" sx={{ color: 'text.disabled' }} aria-hidden="true">/</Box>
          <Typography component="span" variant="subtitle2" sx={{ fontWeight: 900, color: 'primary.main' }} data-testid="game-deck-current">
            {t(selected.label)}
          </Typography>
        </Stack>
        <Box ref={scrollRef} className="vuxo-deck__scroll" tabIndex={0} role="region"
          aria-label={t(selected.label)} data-testid="game-deck-scroll">
          {children}
        </Box>
      </Box>
    </Box>
  );
}
