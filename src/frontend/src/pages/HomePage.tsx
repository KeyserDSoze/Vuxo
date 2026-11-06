import { ArrowForward, AutoAwesome, ExploreOutlined, PersonOutline, West } from '@mui/icons-material';
import { Box, Button, Chip, Stack, Typography, useMediaQuery } from '@mui/material';
import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { useAdminAccessState } from '../features/admin/useAdminAccessState';
import { useBuildInfo } from '../features/version/BuildInfoProvider';
import { useVuxoTheme } from '../theme/VuxoThemeProvider';
import { vuxoDesignTokens } from '../theme/tokens';
import { HomePortalScene } from './HomePortalScene';
import './home.css';

type Realm = 'world' | 'character' | 'portals';

const realms: readonly Realm[] = ['world', 'character', 'portals'];

const realmLinks: Record<Realm, string> = {
  world: '/game',
  character: '/character',
  portals: '/portals',
};

const realmIcons = {
  world: ExploreOutlined,
  character: PersonOutline,
  portals: AutoAwesome,
} as const;

/** Only presentation state is changed here; no game state or rewards are created. */
export function HomePage() {
  const { t } = useTranslation();
  const { build } = useBuildInfo();
  const signedIn = useAdminAccessState() !== 'unauthenticated';
  const { effectiveMode } = useVuxoTheme();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const heroRef = useRef<HTMLElement | null>(null);
  const [realm, setRealm] = useState<Realm>('world');
  const [awake, setAwake] = useState(false);
  const landing = vuxoDesignTokens.landing[effectiveMode];
  const sceneVariables = {
    '--landing-sky-top': landing.skyTop,
    '--landing-sky-bottom': landing.skyBottom,
    '--landing-horizon': landing.horizon,
    '--landing-land': landing.land,
    '--landing-land-back': landing.landBack,
    '--landing-text': landing.text,
    '--landing-muted': landing.muted,
    '--landing-accent': landing.realms[realm],
    '--landing-shift-x': '0px',
    '--landing-shift-y': '0px',
  } as CSSProperties;

  function moveScene(event: PointerEvent<HTMLElement>) {
    if (reducedMotion || event.pointerType !== 'mouse') return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - bounds.left) / bounds.width - 0.5;
    const y = (event.clientY - bounds.top) / bounds.height - 0.5;
    event.currentTarget.style.setProperty('--landing-shift-x', `${(x * 24).toFixed(1)}px`);
    event.currentTarget.style.setProperty('--landing-shift-y', `${(y * 17).toFixed(1)}px`);
  }

  function resetScene() {
    heroRef.current?.style.setProperty('--landing-shift-x', '0px');
    heroRef.current?.style.setProperty('--landing-shift-y', '0px');
  }

  function chooseRealm(next: Realm) {
    setRealm(next);
    setAwake(false);
  }

  const selectedDestination = realm === 'world' && !signedIn ? '/auth' : realmLinks[realm];

  return (
    <Stack className="vuxo-landing" spacing={{ xs: 2, md: 3 }}>
      <Box
        component="section"
        ref={heroRef}
        data-testid="home-hero"
        data-realm={realm}
        data-awake={awake ? 'true' : 'false'}
        className="vuxo-landing__hero"
        style={sceneVariables}
        onPointerMove={moveScene}
        onPointerLeave={resetScene}
        aria-label={t('home.sceneLabel')}
      >
        <Box className="vuxo-landing__ambient" aria-hidden="true" />
        <Box className="vuxo-landing__copy">
          <Chip
            className="vuxo-landing__eyebrow"
            size="small"
            icon={<AutoAwesome fontSize="small" />}
            label={t('home.eyebrow', { version: build?.version ?? t('version.unknown') })}
          />
          <Typography component="p" className="vuxo-landing__chapter">
            {t('home.chapter')}
          </Typography>
          <Typography component="h1" variant="h1" className="vuxo-landing__headline">
            {t('home.title')}
          </Typography>
          <Typography component="p" className="vuxo-landing__description">
            {t('home.description')}
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} className="vuxo-landing__actions">
            <Button
              component={RouterLink}
              to={signedIn ? '/game' : '/auth'}
              size="large"
              variant="contained"
              endIcon={<ArrowForward />}
              className="vuxo-landing__primary"
              data-testid="home-primary-cta"
            >
              {t(signedIn ? 'home.cta' : 'home.ctaSignIn')}
            </Button>
            <Button component={RouterLink} to="/character" size="large" variant="outlined" className="vuxo-landing__secondary">
              {t('home.ctaCharacter')}
            </Button>
          </Stack>
          <Button
            data-testid="home-refuge-link"
            component={RouterLink}
            to="/refuge"
            startIcon={<West sx={{ transform: 'rotate(180deg)' }} />}
            className="vuxo-landing__refuge"
          >
            {t('home.ctaRefuge')}
          </Button>
        </Box>

        <HomePortalScene
          awake={awake}
          onToggle={() => setAwake(value => !value)}
          toggleLabel={t('home.portal.toggle')}
          status={t(awake ? 'home.portal.awake' : 'home.portal.hint')}
        />

        <Box className="vuxo-landing__scene-footer">
          <Box className="vuxo-landing__scene-footer-line" aria-hidden="true" />
          <Typography component="p" className="vuxo-landing__scene-footer-caption">
            {t('home.sceneFooter')}
          </Typography>
          <Box className="vuxo-landing__scene-footer-line" aria-hidden="true" />
        </Box>
      </Box>

      <Box component="section" aria-labelledby="home-paths-title">
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} alignItems={{ xs: 'flex-start', sm: 'center' }} justifyContent="space-between" sx={{ mb: 2 }}>
          <Box>
            <Typography variant="overline" color="primary.main" sx={{ fontWeight: 800, letterSpacing: '0.18em' }}>{t('home.pathsEyebrow')}</Typography>
            <Typography id="home-paths-title" component="h2" variant="h4" sx={{ fontWeight: 850, letterSpacing: '-0.035em' }}>{t('home.pathsTitle')}</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">{t('home.pathsHint')}</Typography>
        </Stack>

        <Box className="vuxo-landing__paths" data-testid="home-highlights">
          {realms.map((key, index) => {
            const Icon = realmIcons[key];
            return (
              <Box
                component="button"
                type="button"
                key={key}
                className="vuxo-landing__path"
                data-testid={`home-realm-${key}`}
                aria-pressed={realm === key}
                aria-controls="home-selected-path"
                onClick={() => chooseRealm(key)}
                sx={{
                  bgcolor: 'background.paper',
                  borderColor: realm === key ? 'primary.main' : 'divider',
                  color: 'text.primary',
                  '&:hover': { borderColor: 'primary.main' },
                  '&:focus-visible': { outlineColor: 'primary.main' }
                }}
              >
                <Box className="vuxo-landing__path-head">
                  <Box className="vuxo-landing__path-icon" sx={{ bgcolor: 'action.hover', color: 'primary.main' }}><Icon fontSize="medium" /></Box>
                  <Typography component="span" variant="caption" color="text.secondary">0{index + 1} / 03</Typography>
                </Box>
                <Typography component="h3" variant="h6" sx={{ fontWeight: 850 }}>{t(`home.features.${key}.title`)}</Typography>
                <Typography component="p" variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>{t(`home.features.${key}.description`)}</Typography>
                <Box className="vuxo-landing__path-bottom" sx={{ color: realm === key ? 'primary.main' : 'text.secondary' }}>
                  <Typography component="span" variant="caption" sx={{ fontWeight: 750 }}>{t(realm === key ? 'home.pathSelected' : 'home.pathPreview')}</Typography>
                  <ArrowForward fontSize="small" />
                </Box>
              </Box>
            );
          })}
        </Box>
        <Stack id="home-selected-path" data-testid="home-selected-path" direction={{ xs: 'column', sm: 'row' }} gap={2} alignItems={{ xs: 'stretch', sm: 'center' }} justifyContent="space-between"
          sx={{ mt: 2, px: { xs: 1, sm: 2 }, py: 1 }}>
          <Box>
            <Typography variant="body2" color="text.secondary">{t('home.selectedEyebrow')}</Typography>
            <Typography component="p" variant="subtitle1" sx={{ fontWeight: 750 }}>{t(`home.features.${realm}.preview`)}</Typography>
          </Box>
          <Button component={RouterLink} to={selectedDestination} endIcon={<ArrowForward />} variant="text" sx={{ alignSelf: { xs: 'flex-start', sm: 'center' }, whiteSpace: 'nowrap' }} data-testid="home-path-link">
            {t('home.discoverPath')}
          </Button>
        </Stack>
      </Box>
    </Stack>
  );
}
