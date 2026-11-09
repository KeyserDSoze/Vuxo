import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import {
  CHARACTER_ALLOCATION_POINTS,
  getCharacterMaxHealth,
  getCharacterMovementSpeedMultiplier,
  type CharacterAttributesDraft,
  validateCharacterDraft,
} from '../features/character/characterRules'
import {
  DEFAULT_APPEARANCE,
  fetchAppearanceCatalog,
  getApiBaseUrl,
  normalizeAppearance,
  type CharacterAppearanceCatalog,
  type CharacterAppearanceDraft,
} from '../features/character/appearance'
import { CharacterPreview } from '../features/character/CharacterPreview'

const DRAFT_STORAGE_KEY = 'vuxo.character.draft'
const ACCESS_TOKEN_STORAGE_KEY = 'vuxo.accessToken'

const DEFAULT_ATTRIBUTES: CharacterAttributesDraft = {
  strength: 2,
  dexterity: 2,
  intelligence: 2,
  constitution: 2,
  luck: 1,
  faith: 1,
}

type CharacterDraft = {
  name: string
  attributes: CharacterAttributesDraft
  appearance: CharacterAppearanceDraft
}

const DEFAULT_DRAFT: CharacterDraft = {
  name: 'Vuxian',
  attributes: DEFAULT_ATTRIBUTES,
  appearance: DEFAULT_APPEARANCE,
}

function loadDraft(): CharacterDraft {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return DEFAULT_DRAFT
    const parsed = JSON.parse(raw) as Partial<CharacterDraft>
    return {
      name: typeof parsed.name === 'string' ? parsed.name : DEFAULT_DRAFT.name,
      attributes: { ...DEFAULT_ATTRIBUTES, ...parsed.attributes },
      appearance: { ...DEFAULT_APPEARANCE, ...parsed.appearance },
    }
  } catch {
    return DEFAULT_DRAFT
  }
}

export function CharacterEditorPage() {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<CharacterDraft>(loadDraft)
  const [catalog, setCatalog] = useState<CharacterAppearanceCatalog | null>(null)
  const [catalogError, setCatalogError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<{ kind: 'success' | 'error'; key: string } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void fetchAppearanceCatalog(controller.signal)
      .then(nextCatalog => {
        setCatalog(nextCatalog)
        setDraft(current => ({ ...current, appearance: normalizeAppearance(current.appearance, nextCatalog) }))
      })
      .catch(error => {
        if ((error as Error).name !== 'AbortError') setCatalogError(true)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
  }, [draft])

  const allocationTotal = Object.values(draft.attributes).reduce((sum, value) => sum + value, 0)
  const validationErrors = validateCharacterDraft(draft.name, draft.attributes)
  const accessToken = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
  const canSubmit = catalog !== null && validationErrors.length === 0 && Boolean(accessToken) && !submitting
  const derived = useMemo(() => ({
    maxHealth: getCharacterMaxHealth(draft.attributes.constitution),
    movementSpeed: getCharacterMovementSpeedMultiplier(draft.attributes.dexterity),
  }), [draft.attributes.constitution, draft.attributes.dexterity])

  const setAppearance = (field: keyof CharacterAppearanceDraft, value: string) => {
    setDraft(current => ({ ...current, appearance: { ...current.appearance, [field]: value } }))
    setResult(null)
  }

  const setAttribute = (field: keyof CharacterAttributesDraft, raw: string) => {
    const value = Number.isFinite(Number(raw)) ? Math.max(0, Math.min(10, Number(raw))) : 0
    setDraft(current => ({ ...current, attributes: { ...current.attributes, [field]: value } }))
    setResult(null)
  }

  const submit = async () => {
    const token = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
    if (!token) {
      setResult({ kind: 'error', key: 'character.editor.authenticationRequired' })
      return
    }

    setSubmitting(true)
    setResult(null)
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/characters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: draft.name,
          ...draft.attributes,
          appearance: draft.appearance,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { code?: string }
        setResult({ kind: 'error', key: payload.code ? `errors.${payload.code}` : 'character.editor.saveFailed' })
        return
      }

      setResult({ kind: 'success', key: 'character.editor.created' })
    } catch {
      setResult({ kind: 'error', key: 'character.editor.saveFailed' })
    } finally {
      setSubmitting(false)
    }
  }

  if (!catalog && !catalogError) {
    return (
      <Stack spacing={2} sx={{ py: 10, alignItems: 'center' }}>
        <CircularProgress />
        <Typography>{t('character.editor.loading')}</Typography>
      </Stack>
    )
  }

  if (!catalog) {
    return <Alert severity="error">{t('character.editor.catalogError')}</Alert>
  }

  const selectField = (
    field: keyof CharacterAppearanceDraft,
    values: string[],
    labelKey: string,
    optionGroup: string,
  ) => (
    <Box data-testid={`${field}-select`}>
      <TextField
        select
        fullWidth
        label={t(labelKey)}
        value={draft.appearance[field]}
        onChange={event => setAppearance(field, event.target.value)}
      >
        {values.map(value => (
          <MenuItem key={value} value={value}>{t(`character.options.${optionGroup}.${value}`)}</MenuItem>
        ))}
      </TextField>
    </Box>
  )

  return (
    <Stack spacing={2} data-testid="character-editor-page">
      <Box>
        <Typography variant="overline" color="primary.main">{t('character.editor.eyebrow')}</Typography>
        <Typography variant="h3" component="h1" sx={{ fontWeight: 900, letterSpacing: '-0.04em' }}>
          {t('character.editor.title')}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 760 }}>
          {t('character.editor.description')}
        </Typography>
      </Box>

      {!accessToken && <Alert severity="info">{t('character.editor.authenticationRequired')}</Alert>}
      {result && <Alert severity={result.kind === 'success' ? 'success' : 'error'}>{t(result.key)}</Alert>}

      <Grid container spacing={{ xs: 1.5, md: 2.5 }} sx={{ alignItems: 'flex-start' }}>
        <Grid size={{ xs: 12, md: 5, lg: 4 }}>
          <Card variant="outlined" sx={{ position: { md: 'sticky' }, top: { md: 8 } }}>
            <CardContent>
              <CharacterPreview appearance={draft.appearance} />
              <Stack direction="row" sx={{ mt: 2, justifyContent: 'space-between' }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('character.stats.maxHealth')}</Typography>
                  <Typography variant="h6">{derived.maxHealth}</Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="caption" color="text.secondary">{t('character.stats.speed')}</Typography>
                  <Typography variant="h6">×{derived.movementSpeed.toFixed(1)}</Typography>
                </Box>
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 7, lg: 8 }}>
          <Stack spacing={3}>
            <Card variant="outlined">
              <CardContent>
                <Stack spacing={2.5}>
                  <Typography variant="h5" sx={{ fontWeight: 800 }}>{t('character.editor.identity')}</Typography>
                  <TextField
                    label={t('character.editor.name')}
                    value={draft.name}
                    onChange={event => {
                      setDraft(current => ({ ...current, name: event.target.value }))
                      setResult(null)
                    }}
                    slotProps={{ htmlInput: { maxLength: 24 } }}
                    fullWidth
                  />
                  <Divider />
                  <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', gap: 1 }}>
                    <Typography variant="h6">{t('character.editor.attributes')}</Typography>
                    <Typography color={allocationTotal === CHARACTER_ALLOCATION_POINTS ? 'text.secondary' : 'error.main'}>
                      {t('character.editor.points', { used: allocationTotal, total: CHARACTER_ALLOCATION_POINTS })}
                    </Typography>
                  </Stack>
                  <Grid container spacing={2}>
                    {(Object.keys(DEFAULT_ATTRIBUTES) as (keyof CharacterAttributesDraft)[]).map(field => (
                      <Grid key={field} size={{ xs: 6, sm: 4 }}>
                        <TextField
                          type="number"
                          fullWidth
                          label={t(`character.attributes.${field}`)}
                          value={draft.attributes[field]}
                          onChange={event => setAttribute(field, event.target.value)}
                          slotProps={{ htmlInput: { min: 0, max: 10 } }}
                        />
                      </Grid>
                    ))}
                  </Grid>
                  {validationErrors.map(code => (
                    <Alert key={code} severity="warning">{t(`errors.${code}`)}</Alert>
                  ))}
                </Stack>
              </CardContent>
            </Card>

            <Card variant="outlined">
              <CardContent>
                <Stack spacing={2.5}>
                  <Box>
                    <Typography variant="h5" sx={{ fontWeight: 800 }}>{t('character.editor.appearance')}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {t('character.editor.catalogVersion', { version: catalog.catalogVersion })}
                    </Typography>
                  </Box>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>{selectField('hairStyle', catalog.hairStyles, 'character.appearance.hairStyle', 'hairStyle')}</Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>{selectField('hairColor', catalog.hairColors, 'character.appearance.hairColor', 'color')}</Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>{selectField('face', catalog.faces, 'character.appearance.face', 'face')}</Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>{selectField('bodyType', catalog.bodyTypes, 'character.appearance.bodyType', 'bodyType')}</Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>{selectField('skinTone', catalog.skinTones, 'character.appearance.skinTone', 'skinTone')}</Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>{selectField('topColor', catalog.topColors, 'character.appearance.topColor', 'color')}</Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>{selectField('bottomStyle', catalog.bottomStyles, 'character.appearance.bottomStyle', 'bottomStyle')}</Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>{selectField('bottomColor', catalog.bottomColors, 'character.appearance.bottomColor', 'color')}</Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>{selectField('shoeStyle', catalog.shoeStyles, 'character.appearance.shoeStyle', 'shoeStyle')}</Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>{selectField('shoeColor', catalog.shoeColors, 'character.appearance.shoeColor', 'color')}</Grid>
                  </Grid>
                </Stack>
              </CardContent>
            </Card>

            <Button data-testid="create-character" variant="contained" size="large" disabled={!canSubmit} onClick={() => void submit()}>
              {submitting ? t('character.editor.saving') : t('character.editor.create')}
            </Button>
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  )
}
