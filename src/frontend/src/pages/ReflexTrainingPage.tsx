import { Alert, Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';

// Local free practice: no gameplay API requests, persisted scores or rewards.
const runes = ['sun', 'moon', 'star', 'wave'] as const;
type Rune = typeof runes[number];
type Phase = 'ready' | 'playing' | 'result';
const roundCount = 8;

function nextRune(previous: Rune | null): Rune {
  const choices = runes.filter(rune => rune !== previous);
  return choices[Math.floor(Math.random() * choices.length)];
}

export function ReflexTrainingPage() {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('ready');
  const [target, setTarget] = useState<Rune | null>(null);
  const [completed, setCompleted] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [totalReactionMs, setTotalReactionMs] = useState(0);
  const targetShownAt = useRef<number | null>(null);

  useEffect(() => {
    if (phase !== 'playing' || !target) return;
    // Start the clock at the browser paint, not during the React state update.
    const frame = window.requestAnimationFrame(() => {
      targetShownAt.current = performance.now();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [phase, target]);

  const start = () => {
    setCompleted(0);
    setMistakes(0);
    setTotalReactionMs(0);
    targetShownAt.current = null;
    setTarget(nextRune(null));
    setPhase('playing');
  };

  const choose = (rune: Rune) => {
    if (phase !== 'playing' || !target) return;
    if (rune !== target) {
      setMistakes(value => value + 1);
      return;
    }

    const elapsed = targetShownAt.current === null
      ? 0 : Math.max(0, Math.round(performance.now() - targetShownAt.current));
    setTotalReactionMs(value => value + elapsed);
    targetShownAt.current = null;
    const nextCompleted = completed + 1;
    setCompleted(nextCompleted);
    if (nextCompleted === roundCount) {
      setPhase('result');
      setTarget(null);
    } else {
      setTarget(nextRune(target));
    }
  };

  return (
    <Stack spacing={3} data-testid="reflex-training-page">
      <Stack spacing={1}>
        <Typography variant="overline" color="primary.main">{t('refuge.reflex.eyebrow')}</Typography>
        <Typography component="h1" variant="h2" sx={{ typography: { xs: 'h4', sm: 'h2' }, overflowWrap: 'anywhere' }}>{t('refuge.reflex.title')}</Typography>
        <Typography color="text.secondary">{t('refuge.reflex.description')}</Typography>
      </Stack>
      <Alert severity="info" data-testid="reflex-disclaimer">{t('refuge.reflex.disclaimer')}</Alert>

      <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 } }}>
        <Stack spacing={3} sx={{ alignItems: 'flex-start' }}>
          {phase === 'ready' && (
            <Stack spacing={2} data-testid="reflex-ready">
              <Typography>{t('refuge.reflex.instructions', { count: roundCount })}</Typography>
              <Button data-testid="reflex-start" variant="contained" onClick={start}>
                {t('refuge.reflex.start')}
              </Button>
            </Stack>
          )}

          {phase === 'playing' && target && (
            <Stack spacing={2} sx={{ width: '100%' }} data-testid="reflex-playing">
              <Chip
                data-testid="reflex-progress"
                label={t('refuge.reflex.progress', { current: completed + 1, total: roundCount })}
                sx={{ alignSelf: 'flex-start' }}
              />
              <Paper variant="outlined" sx={{ p: 2, bgcolor: 'action.hover', textAlign: 'center' }}>
                <Typography color="text.secondary">{t('refuge.reflex.find')}</Typography>
                <Typography
                  component="p"
                  variant="h4"
                  data-testid="reflex-target"
                  data-rune={target}
                  role="status"
                  aria-live="polite"
                  sx={{ mt: 1, fontWeight: 800 }}
                >
                  {t('portals.runes.' + target)}
                </Typography>
              </Paper>
              <Box role="group" aria-label={t('refuge.reflex.choices')}
                sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1, width: '100%', maxWidth: 520 }}>
                {runes.map(rune => (
                  <Button
                    key={rune}
                    data-testid={'reflex-rune-' + rune}
                    variant="outlined"
                    size="large"
                    onClick={() => choose(rune)}
                    sx={{ minHeight: 72, fontWeight: 700 }}
                  >
                    {t('portals.runes.' + rune)}
                  </Button>
                ))}
              </Box>
              <Typography color="text.secondary" data-testid="reflex-mistakes">
                {t('refuge.reflex.mistakes', { count: mistakes })}
              </Typography>
            </Stack>
          )}

          {phase === 'result' && (
            <Stack spacing={2} data-testid="reflex-result">
              <Alert severity="success">{t('refuge.reflex.complete')}</Alert>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                <Chip data-testid="reflex-hits" label={t('refuge.reflex.hits', { count: completed, total: roundCount })} />
                <Chip data-testid="reflex-result-mistakes" label={t('refuge.reflex.mistakes', { count: mistakes })} />
                <Chip data-testid="reflex-average" label={t('refuge.reflex.average', {
                  milliseconds: Math.round(totalReactionMs / roundCount),
                })} />
              </Stack>
              <Button data-testid="reflex-again" variant="contained" onClick={start}>
                {t('refuge.reflex.again')}
              </Button>
            </Stack>
          )}

          <Button data-testid="reflex-back" component={RouterLink} to="/refuge" variant="text">
            {t('refuge.reflex.back')}
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
