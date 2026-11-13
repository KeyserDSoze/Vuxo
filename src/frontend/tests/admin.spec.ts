import { expect, test, type Page } from '@playwright/test'

const EVENT_A = '11111111-1111-4111-8111-111111111111'
const EVENT_B = '22222222-2222-4222-8222-222222222222'
const CORRELATION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

test.beforeEach(async ({ page }) => {
  await configureSession(page, 'Administrator')
})

test('admin dashboard shows observability, online players, events and versioned event detail', async ({ page }) => {
  await installAdminRoutes(page)
  await page.goto('./#/admin')

  await expect(page.getByRole('heading', { name: 'Amministrazione' })).toBeVisible()
  await expect(page.getByTestId('admin-observability')).toContainText('Telemetria attiva')
  await expect(page.getByTestId('admin-observability')).toContainText('Exporter OTLP configurato')
  await expect(page.getByTestId('admin-observability-link')).toHaveAttribute('href', 'https://grafana.vuxo.test/')
  await expect(page.getByTestId('admin-online-count')).toHaveText('1 online')
  await expect(page.getByTestId('admin-online-player')).toContainText('Online Vuxian')
  await expect(page.getByTestId('admin-event-row')).toHaveCount(2)

  await page.getByTestId(`admin-event-detail-${EVENT_A}`).click()
  await expect(page.getByTestId('admin-event-detail')).toBeVisible()
  await expect(page.getByTestId('admin-event-payload')).toContainText('"schemaVersion": 1')
  await expect(page.getByTestId('admin-event-payload')).toContainText('portal.grove.001')
})

test('admin filters and pagination are sent to the server query', async ({ page }) => {
  const requestedUrls: URL[] = []
  await installAdminRoutes(page, requestedUrls)
  await page.goto('./#/admin')
  await expect(page.getByTestId('admin-event-row')).toHaveCount(2)

  await page.getByTestId('admin-filter-player').fill('player-a')
  await page.getByTestId('admin-filter-type').fill('exclusive_content.granted')
  await page.getByTestId('admin-filter-correlation').fill(CORRELATION)
  await page.getByTestId('admin-filter-apply').click()

  await expect(page.getByTestId('admin-event-row')).toHaveCount(1)
  await expect.poll(() => requestedUrls.at(-1)?.searchParams.get('playerId')).toBe('player-a')
  expect(requestedUrls.at(-1)?.searchParams.get('eventType')).toBe('exclusive_content.granted')
  expect(requestedUrls.at(-1)?.searchParams.get('correlationId')).toBe(CORRELATION)

  await page.getByTestId('admin-filter-reset').click()
  await expect(page.getByTestId('admin-event-row')).toHaveCount(2)
  await page.getByTestId('admin-page-next').click()
  await expect.poll(() => requestedUrls.at(-1)?.searchParams.get('offset')).toBe('20')
  await expect(page.getByTestId('admin-pagination-summary')).toContainText('21–40 di 42 eventi')
})

// #236 regression: a slower earlier audit page must not replace a newer result.
test('a slow earlier audit response is aborted and cannot overwrite newer filters', async ({ page }) => {
  const abortedUrls: string[] = []
  page.on('requestfailed', request => {
    if (request.url().includes('/api/admin/audit/events')) abortedUrls.push(request.url())
  })
  let releaseStale!: () => void
  const staleGate = new Promise<void>(resolve => { releaseStale = resolve })
  let staleSettled = false
  await installAdminRoutes(page)
  // Registered last, so it runs first; filtered queries fall back to the fixture.
  await page.route(url => url.pathname === '/api/admin/audit/events', async route => {
    if (new URL(route.request().url()).searchParams.get('eventType')) return route.fallback()
    await staleGate
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ total: 1, offset: 0, limit: 20, items: [event(EVENT_B, 'stale.unfiltered', 'player-b', '2026-09-16T13:58:00Z')] }),
    }).catch(() => undefined)
    staleSettled = true
  })

  await page.goto('./#/admin')
  await page.getByTestId('admin-filter-type').fill('exclusive_content.granted')
  await page.getByTestId('admin-filter-apply').click()
  await expect(page.getByTestId('admin-event-row')).toHaveCount(1)
  await expect(page.getByTestId('admin-event-row')).toContainText('exclusive_content.granted')

  releaseStale()
  await expect.poll(() => staleSettled).toBe(true)
  await expect.poll(() => abortedUrls.some(url => !url.includes('eventType='))).toBe(true)
  await expect(page.getByTestId('admin-event-row')).toHaveCount(1)
  await expect(page.getByTestId('admin-event-row')).toContainText('exclusive_content.granted')
  await expect(page.getByTestId('admin-dashboard')).not.toContainText('stale.unfiltered')
})

test('admin API forbidden state is localized and does not expose audit data', async ({ page }) => {
  await page.route('**/api/admin/**', async route => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ code: 'admin_forbidden' }),
    })
  })

  await page.goto('./#/admin')

  await expect(page.getByTestId('admin-error')).toContainText('riservata al ruolo Administrator')
  await expect(page.getByTestId('admin-event-row')).toHaveCount(0)
})

test('admin route guard blocks GameMaster before audit APIs are called', async ({ page }) => {
  await configureSession(page, 'GameMaster')
  let adminRequests = 0
  await page.route('**/api/admin/**', async route => {
    adminRequests++
    await route.abort()
  })

  await page.goto('./#/admin')

  await expect(page.getByTestId('admin-access-denied')).toContainText('riservata al ruolo Administrator')
  await expect(page.getByTestId('admin-dashboard')).toHaveCount(0)
  await expect.poll(() => adminRequests).toBe(0)
})

test('admin route guard requires an authenticated JWT', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.removeItem('vuxo.accessToken')
    localStorage.setItem('vuxo.language', 'it')
  })

  await page.goto('./#/admin')

  await expect(page.getByTestId('admin-access-denied')).toContainText('sessione Vuxo autenticata')
  await expect(page.getByTestId('admin-dashboard')).toHaveCount(0)
})

test('admin dashboard strings switch to English through shared i18n', async ({ page }) => {
  await installAdminRoutes(page)
  await page.goto('./#/admin')
  await expect(page.getByRole('heading', { name: 'Amministrazione' })).toBeVisible()

  await page.getByTestId('language-toggle').click()

  await expect(page.getByRole('heading', { name: 'Administration' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Technical observability' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Event audit' })).toBeVisible()
  await expect(page.getByTestId('admin-filter-apply')).toHaveText('Apply')
})

test('admin dashboard remains usable on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await installAdminRoutes(page)
  await page.goto('./#/admin')

  await expect(page.getByTestId('admin-dashboard')).toBeVisible()
  await expect(page.getByTestId('admin-observability-link')).toBeVisible()
  await expect(page.getByTestId('admin-filter-player')).toBeVisible()
  await expect(page.getByTestId('admin-filter-apply')).toBeVisible()
  await expect(page.getByTestId(`admin-event-detail-${EVENT_A}`)).toBeVisible()
})

async function configureSession(page: Page, role: string): Promise<void> {
  const token = makeJwt(role)
  await page.addInitScript(({ accessToken }) => {
    localStorage.setItem('vuxo.accessToken', accessToken)
    localStorage.setItem('vuxo.auth.expiresAtUtc', '2099-01-01T00:00:00Z')
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: 'test-player',
      displayName: 'Test administrator',
      email: null,
    }))
    localStorage.setItem('vuxo.language', 'it')
    localStorage.setItem('vuxo.theme', 'system')
  }, { accessToken: token })
}

async function installAdminRoutes(page: Page, requestedUrls: URL[] = []): Promise<void> {
  await page.route('**/api/admin/**', async route => {
    const url = new URL(route.request().url())

    if (url.pathname === '/api/admin/observability') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          enabled: true,
          exporterConfigured: true,
          dashboardUrl: 'https://grafana.vuxo.test/',
        }),
      })
      return
    }

    if (url.pathname === '/api/admin/online-players') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          players: [{
            playerId: 'player-online',
            characterId: '33333333-3333-4333-8333-333333333333',
            characterName: 'Online Vuxian',
            x: 4.5,
            y: 7.25,
            speedMultiplier: 1.2,
            revision: 3,
          }],
        }),
      })
      return
    }

    if (url.pathname === `/api/admin/audit/events/${EVENT_A}`) {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ...event(EVENT_A, 'exclusive_content.granted', 'player-a', '2026-09-16T13:59:00Z'),
          payload: {
            schemaVersion: 1,
            kind: 'exclusive_content.granted',
            data: { contentKey: 'portal.grove.001', rewardKey: 'reward-grove-token' },
          },
        }),
      })
      return
    }

    if (url.pathname === '/api/admin/audit/events') {
      requestedUrls.push(url)
      const offset = Number(url.searchParams.get('offset') ?? '0')
      const playerId = url.searchParams.get('playerId')
      const eventType = url.searchParams.get('eventType')
      const filtered = playerId === 'player-a' || eventType === 'exclusive_content.granted'
      const items = filtered
        ? [event(EVENT_A, 'exclusive_content.granted', 'player-a', '2026-09-16T13:59:00Z')]
        : offset >= 20
          ? [event(EVENT_B, 'world.player.connected', 'player-b', '2026-09-16T13:58:00Z')]
          : [
              event(EVENT_A, 'exclusive_content.granted', 'player-a', '2026-09-16T13:59:00Z'),
              event(EVENT_B, 'world.player.connected', 'player-b', '2026-09-16T13:58:00Z'),
            ]
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ total: filtered ? 1 : 42, offset, limit: 20, items }),
      })
      return
    }

    await route.fulfill({ status: 404 })
  })
}

function event(eventId: string, eventType: string, playerId: string | null, occurredAtUtc: string) {
  return {
    eventId,
    eventType,
    visibilityScope: playerId ? 'player' : 'global',
    playerId,
    correlationId: CORRELATION,
    causationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ruleVersion: 'personal-content-v1',
    occurredAtUtc,
  }
}

function makeJwt(role: string): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ role, exp: 4_102_444_800 })}.e2e`
}
