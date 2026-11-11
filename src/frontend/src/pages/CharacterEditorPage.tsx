import { useEffect, useMemo, useState } from 'react'
import { AutoAwesome, PersonOutlined } from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Grid,
  LinearProgress,
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

type SavedCharacter = CharacterDraft & { appearanceRevision: number }

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
  const [saved, setSaved] = useState<SavedCharacter | null>(null)
  const [loadingSaved, setLoadingSaved] = useState(false)
  const [savedReadError, setSavedReadError] = useState(false)
  const [result, setResult] = useState<{ kind: 'success' | 'error'; key: string } | null>(null)
  // UI-only chamber navigation: both form cards remain mounted so a draft and
  // the server-backed appearance catalog cannot be discarded by view changes.
  const [focusedSection, setFocusedSection] = useState<'identity' | 'appearance' | null>(null)
  const focusedView = focusedSection !== null

  useEffect(() => {
    if (!focusedSection) return
    const target = document.getElementById('character-' + focusedSection)
    target?.scrollIntoView({ behavior: 'auto', block: 'start' })
    target?.focus({ preventScroll: true })
  }, [focusedSection])

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

  // For authenticated owners, the server is the source of truth: a local
  // draft never overrides previously saved identity, stats or cosmetics.
  useEffect(() => {
    if (!catalog) return
    const token = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
    if (!token) return
    const controller = new AbortController()
    setLoadingSaved(true)
    setSavedReadError(false)
    void fetch(`${getApiBaseUrl()}/api/characters/me/appearance`, {
      headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
    }).then(async response => {
      if (response.status === 404) { setSaved(null); return }
      if (!response.ok) throw new Error('character_read_failed')
      const current = await response.json() as SavedCharacter
      if (!Number.isSafeInteger(current.appearanceRevision) || current.appearanceRevision < 0
        || !current.appearance || !current.name || !current.attributes) throw new Error('invalid_character')
      const next = { ...current, appearance: normalizeAppearance(current.appearance, catalog) }
      setSaved(next)
      setDraft({ name: next.name, attributes: next.attributes, appearance: next.appearance })
    }).catch(error => {
      if ((error as Error).name !== 'AbortError') setSavedReadError(true)
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingSaved(false)
    })
    return () => controller.abort()
  }, [catalog])

  useEffect(() => {
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
  }, [draft])

  const allocationTotal = Object.values(draft.attributes).reduce((sum, value) => sum + value, 0)
  const validationErrors = validateCharacterDraft(draft.name, draft.attributes)
  const accessToken = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY)
  const dirty = saved !== null && JSON.stringify(draft.appearance) !== JSON.stringify(saved.appearance)
  const canSubmit = catalog !== null && Boolean(accessToken) && !submitting
    && !loadingSaved && !savedReadError
    && (saved ? dirty : validationErrors.length === 0)
  const derived = useMemo(() => ({
    maxHealth: getCharacterMaxHealth(draft.attributes.constitution),
    movementSpeed: getCharacterMovementSpeedMultiplier(draft.attributes.dexterity),
  }), [draft.attributes.constitution, draft.attributes.dexterity])

  const jumpTo = (id: string) => {
    const section = id === 'character-identity' ? 'identity' : 'appearance'
    if (focusedView && focusedSection !== section) {
      setFocusedSection(section)
      return
    }
    const target = document.getElementById(id)
    target?.scrollIntoView({ behavior: 'auto', block: 'start' })
    target?.focus({ preventScroll: true })
  }

  // The look trial is purely local. Every replacement comes from the server-
  // supplied catalog, and it never changes attributes or submits a character.
  const tryAnotherLook = () => {
    if (!catalog) return
    const next = (current: string, options: string[]) => {
      if (!options.length) return current
      return options[(options.indexOf(current) + 1) % options.length] ?? current
    }
    setDraft(current => ({
      ...current,
      appearance: {
        ...current.appearance,
        hairStyle: next(current.appearance.hairStyle, catalog.hairStyles),
        hairColor: next(current.appearance.hairColor, catalog.hairColors),
        topColor: next(current.appearance.topColor, catalog.topColors),
        bottomColor: next(current.appearance.bottomColor, catalog.bottomColors),
      },
    }))
    setResult(null)
  }

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
      const editing = saved !== null
      const response = await fetch(`${getApiBaseUrl()}/api/characters${editing ? '/me/appearance' : ''}`, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: editing ? JSON.stringify({
          catalogVersion: catalog?.catalogVersion,
          expectedRevision: saved.appearanceRevision,
          appearance: draft.appearance,
        }) : JSON.stringify({ name: draft.name, ...draft.attributes, appearance: draft.appearance }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { code?: string }
        const key = payload.code === 'character_appearance_revision_conflict'
          ? 'character.editor.appearanceConflict'
          : payload.code === 'character_appearance_catalog_version_invalid'
            ? 'character.editor.catalogChanged'
            : payload.code ? `errors.${payload.code}`
              : editing ? 'character.editor.lookSaveFailed' : 'character.editor.saveFailed'
        setResult({ kind: 'error', key })
        return
      }
      const payload = await response.json() as {
        appearanceRevision?: number; appearance?: CharacterAppearanceDraft
      }
      setSaved({
        name: draft.name, attributes: draft.attributes,
        appearance: payload.appearance ?? draft.appearance,
        appearanceRevision: payload.appearanceRevision ?? 0,
      })
      setResult({ kind: 'success', key: editing ? 'character.editor.lookSaved' : 'character.editor.created' })
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
    <Stack spacing={2} data-testid="character-editor-page" className="vuxo-character-studio">
      <Box className="vuxo-character-studio__hero" data-testid="character-studio-hero"
        sx={{ borderColor: 'divider', display: focusedView ? 'none' : undefined }}>
        <Typography variant="overline" color="primary.main">{t('character.editor.eyebrow')}</Typography>
        <Typography variant="h3" component="h1" sx={{ fontWeight: 900, letterSpacing: '-0.04em' }}>
          {t('character.editor.title')}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 760 }}>
          {t('character.editor.description')}
        </Typography>
      </Box>
      <Box component="nav" className="vuxo-character-studio__nav" data-testid="character-studio-nav"
        aria-label={t('character.editor.studio.navigation')}
        sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
        <Button data-testid="character-focus-toggle" size="small" aria-pressed={focusedView}
          variant={focusedView ? 'contained' : 'outlined'}
          onClick={() => setFocusedSection(section => section === null ? 'identity' : null)}>
          {t(focusedView ? 'character.editor.studio.fullView' : 'character.editor.studio.focusView')}
        </Button>
        <Button data-testid="character-step-identity" startIcon={<PersonOutlined />}
          aria-pressed={focusedView ? focusedSection === 'identity' : undefined}
          onClick={() => jumpTo('character-identity')} size="small">
          {t('character.editor.studio.identity')}
        </Button>
        <Button data-testid="character-step-appearance" startIcon={<AutoAwesome />}
          aria-pressed={focusedView ? focusedSection === 'appearance' : undefined}
          onClick={() => jumpTo('character-appearance')} size="small">
          {t('character.editor.studio.appearance')}
        </Button>
      </Box>

      {!accessToken && <Alert severity="info">{t('character.editor.authenticationRequired')}</Alert>}
      {loadingSaved && <Alert severity="info">{t('character.editor.loadingSaved')}</Alert>}
      {savedReadError && <Alert severity="warning">{t('character.editor.readFailed')}</Alert>}
      {saved && <Alert data-testid="character-existing-note" severity="info">{t('character.editor.editLocked')}</Alert>}
      {result && <Alert severity={result.kind === 'success' ? 'success' : 'error'}>{t(result.key)}</Alert>}

      <Grid container spacing={{ xs: 1.5, md: 2.5 }} sx={{ alignItems: 'flex-start' }}>
        <Grid size={{ xs: 12, md: 5, lg: 4 }}>
          <Card variant="outlined" className="vuxo-character-studio__portrait"
            data-testid="character-studio-portrait"
            sx={{ position: { md: 'sticky' }, top: { md: 56 } }}>
            <CardContent className="vuxo-character-studio__portrait-content">
              <Typography component="h2" variant="overline" color="primary.main" className="vuxo-character-studio__portrait-heading">
                {t('character.editor.studio.portrait')}
              </Typography>
              <CharacterPreview appearance={draft.appearance} />
              <Stack className="vuxo-character-studio__stats" direction="row" sx={{ mt: 2, justifyContent: 'space-between', gap: 1 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">{t('character.stats.maxHealth')}</Typography>
                  <Typography variant="h6">{derived.maxHealth}</Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography variant="caption" color="text.secondary">{t('character.stats.speed')}</Typography>
                  <Typography variant="h6">×{derived.movementSpeed.toFixed(1)}</Typography>
                </Box>
              </Stack>
              <Button data-testid="character-try-look" variant="outlined" size="small"
                className="vuxo-character-studio__try-look" startIcon={<AutoAwesome />}
                onClick={tryAnotherLook}>
                {t('character.editor.studio.tryLook')}
              </Button>
              <Typography className="vuxo-character-studio__local-note" variant="caption" color="text.secondary">
                {t(saved ? 'character.editor.studio.persistedNote' : 'character.editor.studio.localNote')}
              </Typography>
              <Typography className="vuxo-character-studio__derived" variant="caption" color="text.secondary">
                {t('character.editor.studio.derived')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, md: 7, lg: 8 }}>
          <Stack spacing={2} className="vuxo-character-studio__form">
            <Card id="character-identity" tabIndex={-1} data-testid="character-studio-identity"
              className="vuxo-character-studio__section" variant="outlined"
              sx={{ display: focusedView && focusedSection !== 'identity' ? 'none' : undefined }}>
              <CardContent>
                <Stack spacing={2.5}>
                  <Typography variant="h5" sx={{ fontWeight: 800 }}>{t('character.editor.identity')}</Typography>
                  <TextField
                    label={t('character.editor.name')}
                    value={draft.name}
                    disabled={Boolean(saved)}
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
                    <Typography data-testid="character-point-budget" color={allocationTotal <= CHARACTER_ALLOCATION_POINTS ? 'text.secondary' : 'error.main'}>
                      {t('character.editor.points', { used: allocationTotal, total: CHARACTER_ALLOCATION_POINTS })}
                    </Typography>
                  </Stack>
                  <Box data-testid="character-studio-budget" sx={{ minWidth: 0 }}>
                    <LinearProgress aria-label={t('character.editor.studio.budget')} variant="determinate"
                      value={Math.max(0, Math.min(100, allocationTotal / CHARACTER_ALLOCATION_POINTS * 100))}
                      color={allocationTotal > CHARACTER_ALLOCATION_POINTS ? 'error' : 'primary'}
                      sx={{ height: 9, borderRadius: 3 }} />
                    <Typography variant="caption" color={allocationTotal > CHARACTER_ALLOCATION_POINTS ? 'error.main' : 'text.secondary'}>
                      {allocationTotal <= CHARACTER_ALLOCATION_POINTS
                        ? t('character.editor.studio.remaining', { count: CHARACTER_ALLOCATION_POINTS - allocationTotal })
                        : t('character.editor.studio.excess', { count: allocationTotal - CHARACTER_ALLOCATION_POINTS })}
                    </Typography>
                  </Box>
                  <Grid container spacing={2}>
                    {(Object.keys(DEFAULT_ATTRIBUTES) as (keyof CharacterAttributesDraft)[]).map(field => (
                      <Grid key={field} size={{ xs: 6, sm: 4 }}>
                        <TextField
                          type="number"
                          fullWidth
                          label={t(`character.attributes.${field}`)}
                          value={draft.attributes[field]}
                          disabled={Boolean(saved)}
                          onChange={event => setAttribute(field, event.target.value)}
                          slotProps={{ htmlInput: { min: 0, max: 10 } }}
                        />
                      </Grid>
                    ))}
                  </Grid>
                  {!saved && validationErrors.map(code => (
                    <Alert key={code} severity="warning">{t(`errors.${code}`)}</Alert>
                  ))}
                </Stack>
              </CardContent>
            </Card>

            <Card id="character-appearance" tabIndex={-1} data-testid="character-studio-appearance"
              className="vuxo-character-studio__section" variant="outlined"
              sx={{ display: focusedView && focusedSection !== 'appearance' ? 'none' : undefined }}>
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

            <Box className="vuxo-character-studio__submit" sx={{ bgcolor: 'background.paper', borderColor: 'divider' }}>
              <Button data-testid="create-character" variant="contained" size="large"
                disabled={!canSubmit} onClick={() => void submit()}>
                {submitting ? t(saved ? 'character.editor.savingLook' : 'character.editor.saving')
                  : t(saved ? 'character.editor.saveLook' : 'character.editor.create')}
              </Button>
            </Box>
          </Stack>
        </Grid>
      </Grid>
    </Stack>
  )
}
