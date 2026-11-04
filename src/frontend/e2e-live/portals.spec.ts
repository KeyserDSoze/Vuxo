import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

const api = 'http://127.0.0.1:8080';
const playerId = 'portal-live-player';

async function login(request: APIRequestContext, subject: string, role: string): Promise<string> {
  const result = await request.post(api + '/api/auth/mock', {
    data: { subject, displayName: subject, role },
  });
  expect(result.ok(), 'Development mock login must be enabled only in this ephemeral test').toBeTruthy();
  const json = await result.json() as { accessToken: string };
  return json.accessToken;
}

test('real browser to ASP.NET/PostgreSQL: GameMaster grant, failed attempt, solved challenge, audit and replay guard', async ({ page, request }) => {
  const gmToken = await login(request, 'portal-live-gm', 'GameMaster');
  const playerToken = await login(request, playerId, 'User');
  const characterResponse = await request.post(api + '/api/characters', {
    headers: { Authorization: 'Bearer ' + playerToken },
    data: {
      name: 'Inventory Hero', strength: 2, dexterity: 2,
      intelligence: 2, constitution: 2, luck: 1, faith: 1,
      appearance: {
        hairStyle: 'hair-1', hairColor: 'black', face: 'face-1',
        bodyType: 'body-1', skinTone: 'skin-1', topColor: 'blue',
        bottomStyle: 'shorts', bottomColor: 'black',
        shoeStyle: 'shoe-1', shoeColor: 'white',
      },
    },
  });
  expect(characterResponse.status(), 'Player character required for equipment').toBe(201);
  const grantResponse = await request.post(api + '/api/admin/personal-content/grants', {
    headers: { Authorization: 'Bearer ' + gmToken },
    data: {
      sourceEventId: randomUUID(),
      playerId,
      contentKey: 'portal.live.memory',
      portalKey: 'challenge.sequence.v1',
      dialogBranchKey: 'dialog.live',
      rewardKey: 'item.rune_shard.v1',
      seed: 42024,
      ruleVersion: 'personal-content-v1',
      correlationId: randomUUID(),
      causationId: null,
      expiresAtUtc: new Date(Date.now() + 3_600_000).toISOString(),
    },
  });
  expect(grantResponse.status(), 'Real GM grant must be persisted').toBe(201);
  const { id: grantId } = await grantResponse.json() as { id: string };
  const userHeaders = { Authorization: 'Bearer ' + playerToken };

  const puzzleResponse = await request.get(
    api + '/api/personal-content/' + grantId + '/challenge', { headers: userHeaders }
  );
  expect(puzzleResponse.ok()).toBeTruthy();
  const puzzle = await puzzleResponse.json() as { sequence: string[] };
  expect(puzzle.sequence).toHaveLength(4);

  const bypass = await request.post(
    api + '/api/personal-content/' + grantId + '/consume', { headers: userHeaders }
  );
  expect(bypass.status(), 'Legacy consume must not bypass the challenge').toBe(409);

  const wrong = [...puzzle.sequence];
  wrong[0] = wrong[0] === 'sun' ? 'moon' : 'sun';
  const incorrect = await request.post(
    api + '/api/personal-content/' + grantId + '/challenge/attempt',
    { headers: userHeaders, data: { sequence: wrong } }
  );
  expect(incorrect.status()).toBe(422);

  const expiresAtUtc = new Date(Date.now() + 3_600_000).toISOString();
  await page.addInitScript(({ playerToken, expiresAtUtc, playerId }) => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'it');
    localStorage.setItem('vuxo.accessToken', playerToken);
    localStorage.setItem('vuxo.auth.expiresAtUtc', expiresAtUtc);
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: playerId, displayName: 'Portal test player', email: null
    }));
  }, { playerToken, expiresAtUtc, playerId });

  await page.goto('./#/portals');
  await expect(page.getByTestId('portal-start')).toBeVisible();
  await page.getByTestId('portal-start').click();
  await expect(page.getByTestId('portal-preview')).toBeVisible();
  await expect(page.getByTestId('portal-preview')).toHaveCount(0, { timeout: 7000 });

  for (const rune of puzzle.sequence) {
    await page.getByTestId('portal-rune-' + rune).click();
  }
  await page.getByTestId('portal-submit').click();
  await expect(page.getByTestId('portal-complete')).toBeVisible();
  await expect(page.getByTestId('portal-award')).toContainText('Frammento di runa');

  const inventory = await request.get(api + '/api/inventory', { headers: userHeaders });
  expect(inventory.status()).toBe(200);
  const awards = (await inventory.json()) as Array<{ grantId: string; itemKey: string; quantity: number }>;
  expect(awards).toMatchObject([{
    grantId, itemKey: 'item.rune_shard.v1', quantity: 1,
    awardedAtUtc: expect.any(String),
  }]);

  await page.goto('./#/inventory');
  await expect(page.getByTestId('inventory-item')).toContainText('Frammento di runa');
  await expect(page.getByTestId('inventory-stack')).toContainText('Copie possedute: 1');
  await page.getByTestId('inventory-equip').click();
  await expect(page.getByTestId('inventory-unequip')).toBeVisible();
  await expect(page.getByTestId('equipment-stats')).toContainText('Intelligenza: 3 (+1)');

  const equipmentResponse = await request.get(api + '/api/equipment', { headers: userHeaders });
  expect(equipmentResponse.status()).toBe(200);
  const loadout = (await equipmentResponse.json()) as {
    items: Array<{ grantId: string; slot: string }>;
    stats: { intelligence: number; bonuses: { intelligence: number } };
  };
  expect(loadout.items).toMatchObject([{ grantId, slot: 'relic' }]);
  expect(loadout.stats.intelligence).toBe(3);
  expect(loadout.stats.bonuses.intelligence).toBe(1);
  const repeatEquip = await request.post(
    api + '/api/equipment/' + grantId + '/equip', { headers: userHeaders }
  );
  expect(repeatEquip.status()).toBe(409);

  await page.getByTestId('inventory-unequip').click();
  await expect(page.getByTestId('inventory-equip')).toBeVisible();
  await expect(page.getByTestId('equipment-stats')).toContainText('Intelligenza: 2 (+0)');
  const afterUnequip = await request.get(api + '/api/equipment', { headers: userHeaders });
  expect(((await afterUnequip.json()) as { items: unknown[] }).items).toEqual([]);

  const remaining = await request.get(api + '/api/personal-content', { headers: userHeaders });
  expect(remaining.ok()).toBeTruthy();
  expect(await remaining.json()).toEqual([]);
  const replay = await request.post(
    api + '/api/personal-content/' + grantId + '/challenge/attempt',
    { headers: userHeaders, data: { sequence: puzzle.sequence } }
  );
  expect(replay.status()).toBe(409);
});
