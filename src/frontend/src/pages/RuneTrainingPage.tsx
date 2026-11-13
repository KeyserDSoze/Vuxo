import { SportsEsportsOutlined } from '@mui/icons-material';
import { Alert, Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link as RouterLink } from 'react-router-dom';
import { DeckPageHeader } from '../components/DeckPageHeader';

const runes = ['sun', 'moon', 'star', 'wave'] as const;
type Rune = typeof runes[number];
type Difficulty = 'easy' | 'standard' | 'hard';
type Phase = 'preview' | 'answer' | 'result';
const lengths: Record<Difficulty, number> = { easy: 3, standard: 4, hard: 6 };
const previewDurationMs = 4000;

function newSequence(length: number): Rune[] {
  return Array.from({ length }, () => runes[Math.floor(Math.random() * runes.length)]);
}

type RoundResult = {
  correct: boolean;
  correctPositions: number;
  seconds: number;
};

export function RuneTrainingPage() {
  const { t } = useTranslation();
  const [difficulty, setDifficulty] = useState<Difficulty>('standard');
  const [sequence, setSequence] = useState<Rune[]>(() => newSequence(lengths.standard));
  const [phase, setPhase] = useState<Phase>('preview');
  const [answer, setAnswer] = useState<Rune[]>([]);
  const [answerStartedAt, setAnswerStartedAt] = useState<number | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);

  useEffect(() => {
    if (phase !== 'preview') return;
    const timer = window.setTimeout(() => {
      setAnswerStartedAt(Date.now());
      setPhase('answer');
    }, previewDurationMs);
    return () => window.clearTimeout(timer);
  }, [phase, sequence]);

  const ready = () => {
    setAnswerStartedAt(Date.now());
    setPhase('answer');
  };

  const newRound = (level: Difficulty) => {
    setDifficulty(level);
    setSequence(newSequence(lengths[level]));
    setAnswer([]);
    setResult(null);
    setAnswerStartedAt(null);
    setPhase('preview');
  };

  const choose = (rune: Rune) => {
    if (phase !== 'answer') return;
    setAnswer(current => current.length >= sequence.length ? current : [...current, rune]);
  };

  const check = () => {
    if (phase !== 'answer' || answer.length !== sequence.length) return;
    const correctPositions = answer.filter((rune, index) => rune === sequence[index]).length;
    setResult({
      correct: correctPositions === sequence.length,
      correctPositions,
      seconds: Math.max(1, Math.round((Date.now() - (answerStartedAt ?? Date.now())) / 1000)),
    });
    setPhase('result');
  };

  return (
    <Stack spacing={3} data-testid="rune-training-page">
      <DeckPageHeader
        icon={SportsEsportsOutlined}
        eyebrow={t('refuge.training.eyebrow')}
        title={t('refuge.training.title')}
        description={t('refuge.training.description')}
      />
      <Alert severity="info" data-testid="training-disclaimer">{t('refuge.training.disclaimer')}</Alert>

      <Paper variant="outlined" sx={{ p: { xs: 2.5, md: 4 } }}>
        <Stack spacing={3}>
          <Stack spacing={1}>
            <Typography variant="h6">{t('refuge.training.difficulty')}</Typography>
            <Box role="group" aria-label={t('refuge.training.difficulty')} sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {(['easy', 'standard', 'hard'] as const).map(level => (
                <Button
                  key={level}
                  data-testid={'training-difficulty-' + level}
                  variant={difficulty === level ? 'contained' : 'outlined'}
                  aria-pressed={difficulty === level}
                  onClick={() => newRound(level)}
                >
                  {t('refuge.training.levels.' + level)}
                </Button>
              ))}
            </Box>
          </Stack>

          {phase === 'preview' && (
            <Stack spacing={2} data-testid="training-preview">
              <Typography>{t('refuge.training.memorize')}</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {sequence.map((rune, index) => (
                  <Paper key={index} data-testid="training-preview-rune" data-rune={rune} variant="outlined" sx={{ p: 2, minWidth: 72, textAlign: 'center', bgcolor: 'action.hover' }}>
                    <Typography sx={{ fontWeight: 700 }}>{t('portals.runes.' + rune)}</Typography>
                  </Paper>
                ))}
              </Box>
              <Button data-testid="training-ready" variant="contained" onClick={ready} sx={{ alignSelf: 'flex-start' }}>
                {t('refuge.training.ready')}
              </Button>
            </Stack>
          )}

          {phase === 'answer' && (
            <Stack spacing={2} data-testid="training-answer">
              <Typography>{t('refuge.training.repeat')}</Typography>
              <Typography data-testid="training-progress">
                {t('refuge.training.progress', { count: answer.length, total: sequence.length })}
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {runes.map(rune => (
                  <Button
                    key={rune}
                    data-testid={'training-rune-' + rune}
                    variant="outlined"
                    disabled={answer.length >= sequence.length}
                    onClick={() => choose(rune)}
                  >
                    {t('portals.runes.' + rune)}
                  </Button>
                ))}
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: 'flex-start' }}>
                <Button
                  data-testid="training-check"
                  variant="contained"
                  disabled={answer.length !== sequence.length}
                  onClick={check}
                >
                  {t('refuge.training.check')}
                </Button>
                <Button data-testid="training-clear" onClick={() => setAnswer([])}>{t('refuge.training.clear')}</Button>
              </Stack>
            </Stack>
          )}

          {phase === 'result' && result && (
            <Stack spacing={2} data-testid="training-result">
              <Alert severity={result.correct ? 'success' : 'warning'} data-testid={result.correct ? 'training-success' : 'training-failure'}>
                {t(result.correct ? 'refuge.training.success' : 'refuge.training.failure')}
              </Alert>
              <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                <Chip label={t('refuge.training.accuracy', { correct: result.correctPositions, total: sequence.length })} />
                <Chip label={t('refuge.training.duration', { seconds: result.seconds })} />
              </Stack>
              <Button data-testid="training-again" variant="contained" onClick={() => newRound(difficulty)} sx={{ alignSelf: 'flex-start' }}>
                {t('refuge.training.again')}
              </Button>
            </Stack>
          )}
          <Button data-testid="training-back" component={RouterLink} to="/refuge" variant="text" sx={{ alignSelf: 'flex-start' }}>
            {t('refuge.training.back')}
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
