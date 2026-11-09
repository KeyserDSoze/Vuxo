import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type BrowserContext } from '@playwright/test';

// Real browser + API + PostgreSQL + SignalR, never a Vite E2E mock world.
const api = 'http://127.0.0.1:8080';
const frontend = 'http://127.0.0.1:4173/Vuxo/';

async function login(request: APIRequestContext, subject: string): Promise<string> {
  const response = await request.post(api + '/api/auth/mock', {
    data: { subject, displayName: subject, role: 'User' },
  });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

async function create(request: APIRequestContext, token: string, name: string) {
  const response = await request.post(api + '/api/characters', {
    headers: { Authorization: 'Bearer ' + token },
    data: {
      name, strength: 2, dexterity: 2, intelligence: 2,
      constitution: 2, luck: 1, faith: 1,
      appearance: {
        hairStyle: 'hair-1', hairColor: 'black', face: 'face-1',
        bodyType: 'body-1', skinTone: 'skin-1',
        topColor: 'blue', bottomStyle: 'shorts', bottomColor: 'black',
        shoeStyle: 'shoe-1', shoeColor: 'white',
      },
    },
  });
  expect(response.status()).toBe(201);
}

async function authorize(context: BrowserContext, subject: string, token: string) {
  const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await context.addInitScript(({ subject, token, expiry }) => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'en');
    localStorage.setItem('vuxo.accessToken', token);
    localStorage.setItem('vuxo.auth.expiresAtUtc', expiry);
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: subject, displayName: subject, email: null,
    }));
  }, { subject, token, expiry });
}

test('saved Character Studio look reaches two real-world peers after commit, with CAS and reconnect', async ({ browser, request }) => {
  test.setTimeout(75_000);
  const idA = 'look-live-a-' + randomUUID();
  const idB = 'look-live-b-' + randomUUID();
  const tokenA = await login(request, idA);
  const tokenB = await login(request, idB);
  await create(request, tokenA, 'Amber Vuxian');
  await create(request, tokenB, 'Azure Vuxian');

  const contextA = await browser.newContext({ baseURL: frontend });
  const contextB = await browser.newContext({ baseURL: frontend });
  const editorContext = await browser.newContext({ baseURL: frontend });
  try {
    await authorize(contextA, idA, tokenA);
    await authorize(contextB, idB, tokenB);
    await authorize(editorContext, idA, tokenA);
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();
    const editor = await editorContext.newPage();

    await pageA.goto('./#/game');
    await expect(pageA.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected', { timeout: 20_000 });
    await pageB.goto('./#/game');
    await expect(pageB.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected', { timeout: 20_000 });

    const onB = pageB.locator('[data-player-id="' + idA + '"]');
    const onA = pageA.locator('[data-player-id="' + idA + '"]');
    await expect(onB).toHaveAttribute('data-player-hair-color', 'black');
    await expect(onB).toHaveAttribute('data-player-appearance-revision', '0');

    await editor.goto('./#/character');
    await expect(editor.getByTestId('character-existing-note')).toBeVisible();
    await expect(editor.getByRole('textbox', { name: 'Name' })).toBeDisabled();
    await expect(editor.getByTestId('create-character')).toHaveText('Save appearance');
    await editor.getByTestId('character-try-look').click();
    await editor.getByTestId('create-character').click();
    await expect(editor.getByText('Appearance saved on the server.', { exact: false })).toBeVisible();

    // Both active world peers receive the committed look, not a client intent.
    await expect(onB).toHaveAttribute('data-player-hair-color', 'brown', { timeout: 10_000 });
    await expect(onA).toHaveAttribute('data-player-hair-color', 'brown', { timeout: 10_000 });
    await expect(onB).toHaveAttribute('data-player-appearance-revision', '1');

    const headersA = { Authorization: 'Bearer ' + tokenA };
    const after = await request.get(api + '/api/characters/me/appearance', { headers: headersA });
    expect(after.status()).toBe(200);
    const saved = await after.json() as { appearanceRevision: number; appearance: Record<string, string> };
    expect(saved.appearanceRevision).toBe(1);
    expect(saved.appearance.hairColor).toBe('brown');

    const red = { ...saved.appearance, hairColor: 'red' };
    const patch = { catalogVersion: '0.0.1', expectedRevision: 1, appearance: red };
    const newSave = await request.patch(api + '/api/characters/me/appearance', { headers: headersA, data: patch });
    expect(newSave.status()).toBe(200);
    await expect(onB).toHaveAttribute('data-player-hair-color', 'red', { timeout: 10_000 });
    await expect(onB).toHaveAttribute('data-player-appearance-revision', '2');

    const duplicate = await request.patch(api + '/api/characters/me/appearance', { headers: headersA, data: patch });
    expect(duplicate.status()).toBe(200);
    expect((await duplicate.json() as { changed: boolean }).changed).toBe(false);
    const conflict = await request.patch(api + '/api/characters/me/appearance', {
      headers: headersA,
      data: { catalogVersion: '0.0.1', expectedRevision: 1,
        appearance: { ...red, hairColor: 'blue' } },
    });
    expect(conflict.status()).toBe(409);
    const badCatalog = await request.patch(api + '/api/characters/me/appearance', {
      headers: headersA,
      data: { catalogVersion: 'future', expectedRevision: 2, appearance: red },
    });
    expect(badCatalog.status()).toBe(400);

    const peerSaved = await request.get(api + '/api/characters/me/appearance', {
      headers: { Authorization: 'Bearer ' + tokenB },
    });
    expect(peerSaved.status()).toBe(200);
    expect((await peerSaved.json() as { appearance: { hairColor: string } }).appearance.hairColor).toBe('black');

    await pageA.reload();
    await expect(pageA.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected', { timeout: 20_000 });
    await expect(pageA.locator('[data-player-id="' + idA + '"]')).toHaveAttribute('data-player-hair-color', 'red');
    await expect(pageA.locator('[data-player-id="' + idA + '"]')).toHaveAttribute('data-player-appearance-revision', '2');
  } finally {
    await contextA.close();
    await contextB.close();
    await editorContext.close();
  }
});
