import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const api = 'http://127.0.0.1:8080';
const playerA = 'speed-live-player-a';
const playerB = 'speed-live-player-b';
const feather = 'item.swift_feather.v1';

async function login(request: APIRequestContext, subject: string, role = 'User') {
  const result = await request.post(api + '/api/auth/mock', {
    data: { subject, displayName: subject, role },
  });
  expect(result.status()).toBe(200);
  return ((await result.json()) as { accessToken: string }).accessToken;
}

async function character(request: APIRequestContext, token: string, name: string) {
  const result = await request.post(api + '/api/characters', {
    headers: { Authorization: 'Bearer ' + token },
    data: {
      name, strength: 2, dexterity: 2, intelligence: 2,
      constitution: 2, luck: 1, faith: 1,
      appearance: {
        hairStyle: 'hair-1', hairColor: 'black', face: 'face-1',
        bodyType: 'body-1', skinTone: 'skin-1',
        topColor: 'blue', bottomStyle: 'shorts',
        bottomColor: 'black', shoeStyle: 'shoe-1', shoeColor: 'white',
      },
    },
  });
  expect(result.status()).toBe(201);
}

async function session(page: Page, token: string, player: string) {
  const expiresAtUtc = new Date(Date.now() + 3_600_000).toISOString();
  await page.addInitScript(({ token, player, expiresAtUtc }) => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'en');
    localStorage.setItem('vuxo.accessToken', token);
    localStorage.setItem('vuxo.auth.expiresAtUtc', expiresAtUtc);
    localStorage.setItem('vuxo.auth.user',
      JSON.stringify({ id: player, displayName: player, email: null }));
  }, { token, player, expiresAtUtc });
}

test('real world: portal Feather award changes speed for two SignalR clients, persists across reconnect and unequip', async ({ page, browser, request }) => {
  test.setTimeout(90_000);
  const tokenA = await login(request, playerA);
  const tokenB = await login(request, playerB);
  const gm = await login(request, 'speed-live-gm', 'GameMaster');
  await character(request, tokenA, 'Speed Hero A');
  await character(request, tokenB, 'Speed Hero B');

  const grantResponse = await request.post(api + '/api/admin/personal-content/grants', {
    headers: { Authorization: 'Bearer ' + gm },
    data: {
      sourceEventId: randomUUID(), playerId: playerA,
      contentKey: 'portal.speed.live', portalKey: 'challenge.sequence.v1',
      dialogBranchKey: 'dialog.speed', rewardKey: feather,
      seed: 67241, ruleVersion: 'personal-content-v1',
      correlationId: randomUUID(), causationId: null,
      expiresAtUtc: new Date(Date.now() + 3_600_000).toISOString(),
    },
  });
  expect(grantResponse.status()).toBe(201);
  const grantId = ((await grantResponse.json()) as { id: string }).id;
  const ownerHeaders = { Authorization: 'Bearer ' + tokenA };
  const puzzle = await request.get(
    api + '/api/personal-content/' + grantId + '/challenge',
    { headers: ownerHeaders },
  );
  expect(puzzle.status()).toBe(200);
  const sequence = ((await puzzle.json()) as { sequence: string[] }).sequence;
  const solved = await request.post(
    api + '/api/personal-content/' + grantId + '/challenge/attempt',
    { headers: ownerHeaders, data: { sequence } },
  );
  expect(solved.status()).toBe(200);
  expect(((await solved.json()) as { itemKey: string }).itemKey).toBe(feather);

  await session(page, tokenA, playerA);
  const peer = await browser.newPage();
  try {
    await session(peer, tokenB, playerB);
    await page.goto('./#/game');
    await peer.goto('http://127.0.0.1:4173/Vuxo/#/game');
    await expect(page.getByTestId('world-connection-status'))
      .toHaveAttribute('data-status', 'connected', { timeout: 20000 });
    await expect(peer.getByTestId('world-connection-status'))
      .toHaveAttribute('data-status', 'connected', { timeout: 20000 });

    const selfSpeed = page.getByTestId('world-speed');
    const peerSpeed = peer.locator('[data-player-id="' + playerA + '"]');
    await expect(selfSpeed).toHaveAttribute('data-speed', '1.2');
    await expect(peerSpeed).toHaveAttribute('data-player-speed', '1.2');
    const oldRevision = Number(await peerSpeed.getAttribute('data-player-revision'));

    // Forged speed/dexterity in the request body must be ignored by the server.
    const equip = await request.post(api + '/api/equipment/' + grantId + '/equip', {
      headers: ownerHeaders,
      data: { speedMultiplier: 999, dexterity: 999, playerId: playerB },
    });
    expect(equip.status()).toBe(200);
    await expect(selfSpeed).toHaveAttribute('data-speed', '1.3', { timeout: 10000 });
    await expect(peerSpeed).toHaveAttribute('data-player-speed', '1.3', { timeout: 10000 });
    const newRevision = Number(await peerSpeed.getAttribute('data-player-revision'));
    expect(newRevision).toBeGreaterThan(oldRevision);

    // Another player cannot equip an award from the original owner.
    const stolen = await request.post(api + '/api/equipment/' + grantId + '/equip', {
      headers: { Authorization: 'Bearer ' + tokenB },
    });
    expect(stolen.status()).toBe(404);

    await page.reload();
    await expect(page.getByTestId('world-connection-status'))
      .toHaveAttribute('data-status', 'connected', { timeout: 20000 });
    await expect(page.getByTestId('world-speed')).toHaveAttribute('data-speed', '1.3');
    await expect(peerSpeed).toHaveAttribute('data-player-speed', '1.3');

    const unequip = await request.delete(api + '/api/equipment/charm', {
      headers: ownerHeaders,
    });
    expect(unequip.status()).toBe(200);
    await expect(page.getByTestId('world-speed')).toHaveAttribute('data-speed', '1.2');
    await expect(peerSpeed).toHaveAttribute('data-player-speed', '1.2');
    const after = await request.get(api + '/api/equipment', { headers: ownerHeaders });
    expect(((await after.json()) as { items: unknown[] }).items).toEqual([]);
  } finally {
    await peer.close();
  }
});
