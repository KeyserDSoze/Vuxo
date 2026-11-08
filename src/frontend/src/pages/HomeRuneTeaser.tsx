import { ArrowForward, AutoAwesome, Replay } from '@mui/icons-material';
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';

type Realm = 'world' | 'character' | 'portals';
type Rune = 'sun' | 'moon' | 'star' | 'wave';
export type HomeSigilPhase = 'idle' | 'preview' | 'answer' | 'success' | 'failure';
type Phase = Exclude<HomeSigilPhase, 'idle'>;

/**
 * A deterministic, non-authoritative sample of VUXO rune play.
 * No persistence, API calls, character mutations or player rewards.
 */
const runes: readonly Rune[] = ['sun', 'moon', 'star', 'wave'];
const glyphs: Record<Rune, string> = { sun: '☼', moon: '☾', star: '✦', wave: '≋' };
const sigils: Record<Realm, readonly Rune[]> = {
  world: ['sun', 'star', 'wave'],
  character: ['moon', 'sun', 'star'],
  portals: ['wave', 'star', 'moon'],
};

type Props = {
  realm: Realm;
  destination: string;
  onPhaseChange: (phase: HomeSigilPhase) => void;
};

export function HomeRuneTeaser({ realm, destination, onPhaseChange }: Props) {
  const { t } = useTranslation();
  const sequence = sigils[realm];
  const [phase, setPhase] = useState<Phase>('preview');
  const [answer, setAnswer] = useState<Rune[]>([]);
  const firstChoiceRef = useRef<HTMLButtonElement | null>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (phase === 'answer') firstChoiceRef.current?.focus();
    if (phase === 'success' || phase === 'failure') resultRef.current?.focus();
  }, [phase]);

  function selectRune(rune: Rune) {
    if (phase !== 'answer' || answer.length >= sequence.length) return;
    const next = [...answer, rune];
    setAnswer(next);
    if (next.length === sequence.length) {
      const outcome = next.every((value, index) => value === sequence[index]) ? 'success' : 'failure';
      setPhase(outcome);
      onPhaseChange(outcome);
    }
  }

  function start() {
    setAnswer([]);
    setPhase('answer');
    onPhaseChange('answer');
  }

  function reset() {
    setAnswer([]);
    setPhase('preview');
    onPhaseChange('preview');
  }

  function undo() {
    if (phase !== 'answer') return;
    setAnswer(current => current.slice(0, -1));
  }

  return (
    <Paper
      component="section"
      id="home-rune-teaser"
      data-testid="home-rune-teaser"
      data-phase={phase}
      aria-labelledby="home-rune-title"
      variant="outlined"
      sx={{
        position: 'relative',
        overflow: 'hidden',
        p: { xs: 2.5, sm: 3.5, md: 4 },
        background: theme => `radial-gradient(circle at 100% 0%, ${alpha(theme.palette.primary.main, theme.palette.mode === 'dark' ? 0.18 : 0.1)}, transparent 55%), ${theme.palette.background.paper}`,
      }}
    >
      <Stack spacing={2.5}>
        <Stack direction={{ xs: 'column', md: 'row' }} sx={{ gap: 2, justifyContent: 'space-between', alignItems: { md: 'center' } }}>
          <Box sx={{ maxWidth: 620 }}>
            <Chip size="small" icon={<AutoAwesome />} label={t('home.teaser.eyebrow')} color="primary" variant="outlined" sx={{ mb: 1.5 }} />
            <Typography id="home-rune-title" component="h2" variant="h4" sx={{ fontWeight: 850, letterSpacing: '-0.035em', mb: 1 }}>
              {t('home.teaser.title')}
            </Typography>
            <Typography color="text.secondary">{t('home.teaser.description')}</Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 270 }}>
            {t('home.teaser.disclaimer')}
          </Typography>
        </Stack>

        {phase === 'preview' && (
          <Stack spacing={2} data-testid="home-rune-preview">
            <Typography sx={{ fontWeight: 700 }}>{t('home.teaser.memorize')}</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {sequence.map((rune, index) => (
                <Paper
                  key={index}
                  variant="outlined"
                  data-testid="home-rune-preview-item"
                  data-rune={rune}
                  sx={{ minWidth: { xs: 78, sm: 98 }, p: 1.5, textAlign: 'center', bgcolor: 'action.hover' }}
                >
                  <Typography component="span" aria-hidden="true" sx={{ display: 'block', fontSize: 27, color: 'primary.main' }}>{glyphs[rune]}</Typography>
                  <Typography component="span" variant="body2" sx={{ fontWeight: 700 }}>{t('portals.runes.' + rune)}</Typography>
                </Paper>
              ))}
            </Box>
            <Button data-testid="home-rune-start" variant="contained" onClick={start} sx={{ alignSelf: 'flex-start' }}>
              {t('home.teaser.ready')}
            </Button>
          </Stack>
        )}

        {phase === 'answer' && (
          <Stack spacing={2} data-testid="home-rune-answer">
            <Typography sx={{ fontWeight: 700 }}>{t('home.teaser.repeat')}</Typography>
            <Box component="p" aria-live="polite" data-testid="home-rune-progress" sx={{ m: 0, color: 'text.secondary' }}>
              {t('home.teaser.progress', { count: answer.length, total: sequence.length })}
            </Box>
            <Box data-testid="home-rune-slots" aria-hidden="true" sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              {sequence.map((_, index) => (
                <Box
                  key={index}
                  data-testid="home-rune-slot"
                  data-filled={index < answer.length ? 'true' : 'false'}
                  sx={{
                    display: 'grid', placeItems: 'center', width: { xs: 46, sm: 54 },
                    height: { xs: 46, sm: 54 }, borderRadius: 2,
                    border: 1, borderColor: index < answer.length ? 'primary.main' : 'divider',
                    bgcolor: index < answer.length ? 'action.selected' : 'action.hover',
                    fontSize: 25, color: 'primary.main', fontWeight: 800,
                  }}
                >
                  {answer[index] ? glyphs[answer[index]] : '·'}
                </Box>
              ))}
            </Box>
            <Box role="group" aria-label={t('home.teaser.runeChoices')} sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,minmax(0,1fr))', sm: 'repeat(4,minmax(0,1fr))' }, gap: 1.5, maxWidth: 630 }}>
              {runes.map(rune => (
                <Button
                  key={rune}
                  ref={rune === 'sun' ? firstChoiceRef : undefined}
                  data-testid={'home-rune-choice-' + rune}
                  variant="outlined"
                  size="large"
                  onClick={() => selectRune(rune)}
                  sx={{ py: 1.5, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 0.5 }}
                >
                  <Typography component="span" aria-hidden="true" sx={{ fontSize: 26, lineHeight: 1.2 }}>{glyphs[rune]}</Typography>
                  <Typography component="span" variant="body2" sx={{ fontWeight: 700 }}>{t('portals.runes.' + rune)}</Typography>
                </Button>
              ))}
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1, alignItems: { xs: 'stretch', sm: 'center' } }}>
              <Button data-testid="home-rune-undo" disabled={answer.length === 0} variant="outlined" onClick={undo}>
                {t('home.teaser.undo')}
              </Button>
              <Button data-testid="home-rune-reset" onClick={reset} startIcon={<Replay />}>
                {t('home.teaser.restart')}
              </Button>
            </Stack>
          </Stack>
        )}

        {phase === 'failure' && (
          <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }} data-testid="home-rune-failure">
            <Alert ref={resultRef} tabIndex={-1} severity="warning" role="status" sx={{ width: '100%' }}>{t('home.teaser.failure')}</Alert>
            <Button data-testid="home-rune-retry" onClick={reset} variant="outlined" startIcon={<Replay />}>
              {t('home.teaser.retry')}
            </Button>
          </Stack>
        )}

        {phase === 'success' && (
          <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }} data-testid="home-rune-success">
            <Alert ref={resultRef} tabIndex={-1} severity="success" role="status" sx={{ width: '100%' }}>{t('home.teaser.success')}</Alert>
            <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ gap: 1, alignItems: { xs: 'stretch', sm: 'center' } }}>
              <Button component={RouterLink} to={destination} data-testid="home-rune-continue" variant="contained" endIcon={<ArrowForward />}>
                {t('home.teaser.continue')}
              </Button>
              <Button data-testid="home-rune-again" onClick={reset} startIcon={<Replay />}>
                {t('home.teaser.again')}
              </Button>
            </Stack>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
