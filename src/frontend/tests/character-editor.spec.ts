import { expect, test } from '@playwright/test'

const catalog = {
  catalogVersion: '0.0.1',
  hairStyles: ['hair-1', 'hair-2', 'hair-3', 'hair-4'],
  hairColors: ['black', 'brown', 'blonde', 'red', 'blue'],
  faces: ['face-1', 'face-2', 'face-3'],
  bodyTypes: ['body-1', 'body-2', 'body-3'],
  skinTones: ['skin-1', 'skin-2', 'skin-3', 'skin-4', 'skin-5'],
  topColors: ['blue', 'red', 'green', 'black', 'white'],
  bottomStyles: ['shorts', 'skirt'],
  bottomColors: ['black', 'blue', 'red', 'green', 'white'],
  shoeStyles: ['shoe-1', 'shoe-2', 'shoe-3'],
  shoeColors: ['white', 'black', 'brown', 'red', 'blue'],
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('vuxo.language', 'it')
    localStorage.setItem('vuxo.theme', 'system')
  })
  await page.route('**/api/meta/character-appearance', route => route.fulfill({ json: catalog }))
})

test('appearance selection updates preview and persists across reload', async ({ page }) => {
  await page.goto('./#/character')
  await expect(page.getByRole('heading', { name: /costruisci il tuo vuxian/i })).toBeVisible()
  await expect(page.getByTestId('character-preview')).toBeVisible()

  await page.getByTestId('hairStyle-select').click()
  await page.getByRole('option', { name: 'Lunghi' }).click()
  await page.getByTestId('bottomStyle-select').click()
  await page.getByRole('option', { name: 'Gonna' }).click()

  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('vuxo.character.draft') ?? '{}').appearance?.hairStyle)).toBe('hair-3')
  await page.reload()
  await expect(page.getByTestId('hairStyle-select')).toHaveValue('hair-3')
  await expect(page.getByTestId('bottomStyle-select')).toHaveValue('skirt')
})

test('authenticated submit sends canonical ids and bearer token', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('vuxo.accessToken', 'test-token'))

  let postedBody: Record<string, unknown> | null = null
  let authorization: string | null = null
  await page.route('**/api/characters', async route => {
    postedBody = route.request().postDataJSON() as Record<string, unknown>
    authorization = route.request().headers()['authorization'] ?? null
    await route.fulfill({ status: 201, json: { id: 'character-1' } })
  })

  await page.goto('./#/character')
  await page.getByTestId('hairStyle-select').click()
  await page.getByRole('option', { name: 'Ricci' }).click()
  await page.getByTestId('shoeStyle-select').click()
  await page.getByRole('option', { name: 'Stivaletti' }).click()
  await page.getByTestId('create-character').click()

  await expect(page.getByText(/personaggio creato/i)).toBeVisible()
  expect(authorization).toBe('Bearer test-token')
  expect((postedBody?.appearance as Record<string, unknown>).hairStyle).toBe('hair-4')
  expect((postedBody?.appearance as Record<string, unknown>).shoeStyle).toBe('shoe-2')
})

test('editor remains usable on a narrow mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./#/character')

  await expect(page.getByTestId('character-preview')).toBeVisible()
  await expect(page.getByLabel('Nome')).toBeVisible()
  await expect(page.getByLabel('Capelli')).toBeVisible()
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
  expect(hasHorizontalOverflow).toBe(false)
})
