import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { useTranslation } from 'react-i18next'
import '../features/admin/adminI18n'
import {
  AdminApiError,
  type AdminEventDetail,
  type AdminEventFilters,
  type AdminEventPage,
  type AdminOnlinePlayer,
  fetchAdminEvent,
  fetchAdminEvents,
  fetchAdminOnlinePlayers,
} from '../features/admin/adminApi'

const PAGE_SIZE = 20

type FilterDraft = {
  playerId: string
  eventType: string
  correlationId: string
  fromUtc: string
  toUtc: string
}

const EMPTY_FILTERS: FilterDraft = {
  playerId: '',
  eventType: '',
  correlationId: '',
  fromUtc: '',
  toUtc: '',
}

export function AdminPage() {
  const { t, i18n } = useTranslation()
  const [draft, setDraft] = useState<FilterDraft>(EMPTY_FILTERS)
  const [activeFilters, setActiveFilters] = useState<FilterDraft>(EMPTY_FILTERS)
  const [events, setEvents] = useState<AdminEventPage>({ total: 0, offset: 0, limit: PAGE_SIZE, items: [] })
  const [onlinePlayers, setOnlinePlayers] = useState<AdminOnlinePlayer[]>([])
  const [selectedEvent, setSelectedEvent] = useState<AdminEventDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [errorCode, setErrorCode] = useState<string | null>(null)

  const locale = i18n.resolvedLanguage?.startsWith('en') ? 'en-GB' : 'it-IT'
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'medium',
  }), [locale])

  const loadDashboard = useCallback(async (offset: number, filters: FilterDraft) => {
    setLoading(true)
    setErrorCode(null)
    try {
      const query = toApiFilters(filters, offset)
      const [eventPage, players] = await Promise.all([
        fetchAdminEvents(query),
        fetchAdminOnlinePlayers(),
      ])
      setEvents(eventPage)
      setOnlinePlayers(players)
    } catch (error) {
      setErrorCode(readErrorCode(error))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDashboard(0, EMPTY_FILTERS)
  }, [loadDashboard])

  const applyFilters = () => {
    setActiveFilters(draft)
    void loadDashboard(0, draft)
  }

  const resetFilters = () => {
    setDraft(EMPTY_FILTERS)
    setActiveFilters(EMPTY_FILTERS)
    void loadDashboard(0, EMPTY_FILTERS)
  }

  const openEvent = async (eventId: string) => {
    setDetailLoading(true)
    setErrorCode(null)
    try {
      setSelectedEvent(await fetchAdminEvent(eventId))
    } catch (error) {
      setErrorCode(readErrorCode(error))
    } finally {
      setDetailLoading(false)
    }
  }

  const previousOffset = Math.max(0, events.offset - events.limit)
  const nextOffset = events.offset + events.limit
  const hasPrevious = events.offset > 0
  const hasNext = nextOffset < events.total

  return (
    <Stack spacing={3} data-testid="admin-dashboard">
      <Box>
        <Typography variant="overline" color="primary.main">{t('admin.eyebrow')}</Typography>
        <Typography variant="h2" component="h1">{t('admin.title')}</Typography>
        <Typography color="text.secondary" sx={{ mt: 1, maxWidth: 820 }}>{t('admin.description')}</Typography>
      </Box>

      {errorCode && (
        <Alert severity={errorCode === 'admin_forbidden' ? 'warning' : 'error'} data-testid="admin-error">
          {t(`admin.errors.${errorCode}`, { defaultValue: t('admin.errors.generic') })}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Stack spacing={2}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            sx={{ alignItems: { md: 'center' }, justifyContent: 'space-between' }}
          >
            <Box>
              <Typography variant="h5">{t('admin.online.title')}</Typography>
              <Typography variant="body2" color="text.secondary">{t('admin.online.description')}</Typography>
            </Box>
            <Chip data-testid="admin-online-count" label={t('admin.online.count', { count: onlinePlayers.length })} color="primary" variant="outlined" />
          </Stack>

          {onlinePlayers.length === 0 ? (
            <Typography color="text.secondary">{t('admin.online.empty')}</Typography>
          ) : (
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.5 }}>
              {onlinePlayers.map(player => (
                <Paper key={player.playerId} variant="outlined" sx={{ p: 1.5, minWidth: 220 }} data-testid="admin-online-player">
                  <Typography sx={{ fontWeight: 800 }}>{player.characterName}</Typography>
                  <Typography variant="caption" color="text.secondary">{player.playerId}</Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {t('admin.online.position', { x: player.x.toFixed(2), y: player.y.toFixed(2) })}
                  </Typography>
                </Paper>
              ))}
            </Stack>
          )}
        </Stack>
      </Paper>

      <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 } }}>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="h5">{t('admin.audit.title')}</Typography>
            <Typography variant="body2" color="text.secondary">{t('admin.audit.description')}</Typography>
          </Box>

          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} sx={{ alignItems: { lg: 'flex-end' } }}>
            <TextField
              fullWidth
              size="small"
              label={t('admin.filters.playerId')}
              value={draft.playerId}
              onChange={event => setDraft(current => ({ ...current, playerId: event.target.value }))}
              slotProps={{ htmlInput: { 'data-testid': 'admin-filter-player' } }}
            />
            <TextField
              fullWidth
              size="small"
              label={t('admin.filters.eventType')}
              value={draft.eventType}
              onChange={event => setDraft(current => ({ ...current, eventType: event.target.value }))}
              slotProps={{ htmlInput: { 'data-testid': 'admin-filter-type' } }}
            />
            <TextField
              fullWidth
              size="small"
              label={t('admin.filters.correlationId')}
              value={draft.correlationId}
              onChange={event => setDraft(current => ({ ...current, correlationId: event.target.value }))}
              slotProps={{ htmlInput: { 'data-testid': 'admin-filter-correlation' } }}
            />
          </Stack>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { md: 'flex-end' } }}>
            <TextField
              fullWidth
              size="small"
              type="datetime-local"
              label={t('admin.filters.fromUtc')}
              value={draft.fromUtc}
              onChange={event => setDraft(current => ({ ...current, fromUtc: event.target.value }))}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'admin-filter-from' } }}
            />
            <TextField
              fullWidth
              size="small"
              type="datetime-local"
              label={t('admin.filters.toUtc')}
              value={draft.toUtc}
              onChange={event => setDraft(current => ({ ...current, toUtc: event.target.value }))}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { 'data-testid': 'admin-filter-to' } }}
            />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" data-testid="admin-filter-apply" onClick={applyFilters}>{t('admin.actions.apply')}</Button>
              <Button variant="outlined" data-testid="admin-filter-reset" onClick={resetFilters}>{t('admin.actions.reset')}</Button>
              <Button variant="text" data-testid="admin-refresh" onClick={() => void loadDashboard(events.offset, activeFilters)}>{t('admin.actions.refresh')}</Button>
            </Stack>
          </Stack>

          <Divider />

          {loading ? (
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 4 }}>
              <CircularProgress size={24} />
              <Typography>{t('admin.audit.loading')}</Typography>
            </Stack>
          ) : events.items.length === 0 ? (
            <Typography color="text.secondary" sx={{ py: 3 }}>{t('admin.audit.empty')}</Typography>
          ) : (
            <TableContainer>
              <Table size="small" aria-label={t('admin.audit.tableLabel')}>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('admin.columns.time')}</TableCell>
                    <TableCell>{t('admin.columns.type')}</TableCell>
                    <TableCell>{t('admin.columns.player')}</TableCell>
                    <TableCell>{t('admin.columns.rule')}</TableCell>
                    <TableCell align="right">{t('admin.columns.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {events.items.map(item => (
                    <TableRow key={item.eventId} data-testid="admin-event-row" hover>
                      <TableCell>{formatDate(item.occurredAtUtc, dateFormatter)}</TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>{item.eventType}</Typography>
                          <Chip size="small" label={item.visibilityScope} />
                        </Stack>
                      </TableCell>
                      <TableCell>{item.playerId ?? '—'}</TableCell>
                      <TableCell>{item.ruleVersion}</TableCell>
                      <TableCell align="right">
                        <Button size="small" data-testid={`admin-event-detail-${item.eventId}`} onClick={() => void openEvent(item.eventId)}>
                          {t('admin.actions.details')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1}
            sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
          >
            <Typography variant="body2" color="text.secondary" data-testid="admin-pagination-summary">
              {t('admin.audit.pagination', {
                from: events.total === 0 ? 0 : events.offset + 1,
                to: Math.min(events.offset + events.limit, events.total),
                total: events.total,
              })}
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button disabled={!hasPrevious || loading} data-testid="admin-page-previous" onClick={() => void loadDashboard(previousOffset, activeFilters)}>
                {t('admin.actions.previous')}
              </Button>
              <Button disabled={!hasNext || loading} data-testid="admin-page-next" onClick={() => void loadDashboard(nextOffset, activeFilters)}>
                {t('admin.actions.next')}
              </Button>
            </Stack>
          </Stack>
        </Stack>
      </Paper>

      <Dialog open={detailLoading || selectedEvent !== null} onClose={() => !detailLoading && setSelectedEvent(null)} fullWidth maxWidth="md">
        <DialogTitle>{t('admin.detail.title')}</DialogTitle>
        <DialogContent dividers>
          {detailLoading || !selectedEvent ? (
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 3 }}>
              <CircularProgress size={24} />
              <Typography>{t('admin.detail.loading')}</Typography>
            </Stack>
          ) : (
            <Stack spacing={2} data-testid="admin-event-detail">
              <DetailRow label={t('admin.detail.eventId')} value={selectedEvent.eventId} />
              <DetailRow label={t('admin.columns.type')} value={selectedEvent.eventType} />
              <DetailRow label={t('admin.columns.player')} value={selectedEvent.playerId ?? '—'} />
              <DetailRow label={t('admin.detail.correlationId')} value={selectedEvent.correlationId} />
              <DetailRow label={t('admin.detail.causationId')} value={selectedEvent.causationId ?? '—'} />
              <DetailRow label={t('admin.columns.rule')} value={selectedEvent.ruleVersion} />
              <Box>
                <Typography variant="caption" color="text.secondary">{t('admin.detail.payload')}</Typography>
                <Box component="pre" data-testid="admin-event-payload" sx={{ m: 0, mt: 0.5, p: 2, overflowX: 'auto', bgcolor: 'action.hover', borderRadius: 1, fontSize: 12 }}>
                  {JSON.stringify(selectedEvent.payload, null, 2)}
                </Box>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedEvent(null)} disabled={detailLoading}>{t('admin.actions.close')}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{value}</Typography>
    </Box>
  )
}

function toApiFilters(filters: FilterDraft, offset: number): AdminEventFilters {
  return {
    playerId: filters.playerId,
    eventType: filters.eventType,
    correlationId: filters.correlationId,
    fromUtc: toUtc(filters.fromUtc),
    toUtc: toUtc(filters.toUtc),
    offset,
    limit: PAGE_SIZE,
  }
}

function toUtc(value: string): string | undefined {
  if (!value) return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function formatDate(value: string, formatter: Intl.DateTimeFormat): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : formatter.format(date)
}

function readErrorCode(error: unknown): string {
  return error instanceof AdminApiError ? error.code : 'admin_request_failed'
}
