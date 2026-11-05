import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

const api = 'http://127.0.0.1:8080';
const playerId = 'world-portal-live-player';

async function login(request: APIRequestContext, subject: string, role: string): Promise<string> {
  const response = await request.post(api + '/api/auth/mock', {
    data: { subject, displayName: subject, role },
  });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

test('real SignalR world renders only personal portal and rejects forged distance', async ({ page, request }) => {
  const userToken = await login(request, playerId, 'User');
  const gmToken = await login(request, 'world-portal-live-gm', 'GameMaster');
  const userHeaders = { Authorization: 'Bearer ' + userToken };

  const character = await request.post(api + '/api/characters', {
    headers: userHeaders,
    data: {
      name: 'World Portal Hero',
      strength: 2, dexterity: 3, intelligence: 1, constitution: 2, luck: 1, faith: 1,
      appearance: {
        hairStyle: 'hair-1', hairColor: 'black', face: 'face-1', bodyType: 'body-1',
        skinTone: 'skin-1', topColor: 'blue', bottomStyle: 'shorts',
        bottomColor: 'black', shoeStyle: 'shoe-1', shoeColor: 'white',
      },
    },
  });
  expect(character.status(), 'Character required for a real world join').toBe(201);

  const grant = await request.post(api + '/api/admin/personal-content/grants', {
    headers: { Authorization: 'Bearer ' + gmToken },
    data: {
      sourceEventId: randomUUID(),
      playerId,
      contentKey: 'portal.world.live',
      portalKey: 'challenge.sequence.v1',
      dialogBranchKey: 'dialog.grove',
      rewardKey: 'reward.reference',
      seed: 85241,
      ruleVersion: 'personal-content-v1',
      correlationId: randomUUID(),
      causationId: null,
      expiresAtUtc: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
  });
  expect(grant.status()).toBe(201);
  const { id: grantId } = await grant.json() as { id: string };

  // Without a world connection, the owner has no in-world marker projection.
  const beforeJoin = await request.get(api + '/api/personal-content/world-portals', {
    headers: userHeaders,
  });
  expect(beforeJoin.status()).toBe(200);
  expect(await beforeJoin.json()).toEqual([]);

  const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await page.addInitScript(({ userToken, expiry, playerId }) => {
    localStorage.clear();
    localStorage.setItem('vuxo.language', 'en');
    localStorage.setItem('vuxo.accessToken', userToken);
    localStorage.setItem('vuxo.auth.expiresAtUtc', expiry);
    localStorage.setItem('vuxo.auth.user', JSON.stringify({
      id: playerId, displayName: 'World Portal Hero', email: null,
    }));
  }, { userToken, expiry, playerId });

  await page.goto('./#/game');
  await expect(page.getByTestId('world-connection-status')).toHaveAttribute('data-status', 'connected', {
    timeout: 20000,
  });
  await expect(page.getByTestId('world-portals')).toContainText('Personal portals', {
    timeout: 20000,
  });
  await expect(page.getByTestId('world-portal-enter')).toHaveCount(1);

  const markers = await request.get(api + '/api/personal-content/world-portals', {
    headers: userHeaders,
  });
  expect(markers.status()).toBe(200);
  const [marker] = (await markers.json()) as Array<{ id: string; x: number; y: number }>;
  expect(marker.id).toBe(grantId);
  expect(Object.keys(marker)).not.toContain('seed');
  expect(Object.keys(marker)).not.toContain('rewardKey');

  // The API refuses a different authenticated owner even with the grant id.
  const otherToken = await login(request, 'world-portal-foreign-user', 'User');
  const stolen = await request.post(
    api + '/api/personal-content/world-portals/' + grantId + '/enter',
    { headers: { Authorization: 'Bearer ' + otherToken } },
  );
  expect(stolen.status()).toBe(404);

  const player = page.locator('[data-player-id="' + playerId + '"]');
  await expect(player).toBeVisible();
  const x = Number(await player.getAttribute('data-player-x'));
  const y = Number(await player.getAttribute('data-player-y'));
  const near = Math.hypot(x - marker.x, y - marker.y) <= 1.5;

  const control = page.getByTestId('world-portal-enter');
  if (near) {
    await expect(control).toBeEnabled();
  } else {
    await expect(control).toBeDisabled();
  }

  // The body must not grant entry from afar; only server state decides.
  const forged = await request.post(
    api + '/api/personal-content/world-portals/' + grantId + '/enter',
    { headers: userHeaders, data: { x: marker.x, y: marker.y, distance: 0 } },
  );
  expect(forged.status()).toBe(near ? 200 : 409);
  if (!near) {
    expect(((await forged.json()) as { code: string }).code).toBe('world_portal_too_far');
  }

  // Real PostgreSQL encounter status is authoritative across the API/React
  // boundaries and may only be opened AFTER server-side proximity checks.
  const encounterResponse = await request.get(api + '/api/characters/me/encounter', {
    headers: userHeaders,
  });
  expect(encounterResponse.status()).toBe(200);
  const encounter = await encounterResponse.json() as {
    active: boolean; portalGrantId: string | null; expiresAtUtc: string | null;
  };
  expect(encounter.active).toBe(near);
  expect(encounter.portalGrantId).toBe(near ? grantId : null);

  const otherEncounter = await request.get(api + '/api/characters/me/encounter', {
    headers: { Authorization: 'Bearer ' + otherToken },
  });
  expect(otherEncounter.status()).toBe(200);
  expect(((await otherEncounter.json()) as { active: boolean }).active).toBe(false);

  if (near) {
    // This encounter was created only after server-verified world proximity;
    // the browser cannot directly create a Guardian or choose its damage.
    const guardianUrl = api + '/api/characters/me/portal-guardian/' + grantId;
    const guardianResponse = await request.get(guardianUrl, { headers: userHeaders });
    expect(guardianResponse.status()).toBe(200);
    const guardian = await guardianResponse.json() as {
      guardianHealth: number; guardianMaxHealth: number;
      playerHealth: number; turn: number; outcome: string;
    };
    expect(guardian.turn).toBe(0);
    expect(guardian.guardianMaxHealth).toBeGreaterThanOrEqual(6);
    expect(guardian.guardianMaxHealth).toBeLessThanOrEqual(8);
    const cardKey = randomUUID();
    const cardHeaders = { ...userHeaders, 'Idempotency-Key': cardKey };
    const card = await request.post(guardianUrl + '/turn', {
      headers: cardHeaders,
      data: {
        action: 'strike', expectedTurn: 0,
        damage: 9999, guardianHealth: 0, playerId: 'world-portal-foreign-user'
      },
    });
    expect(card.status()).toBe(200);
    const resolved = await card.json() as {
      turn: number; damageDealt: number; damageTaken: number;
      guardianHealth: number; playerHealth: number; replayed: boolean;
    };
    expect(resolved.turn).toBe(1);
    expect(resolved.damageDealt).toBeGreaterThanOrEqual(1);
    expect(resolved.damageDealt).toBeLessThanOrEqual(4);
    expect(resolved.guardianHealth).toBe(
      guardian.guardianHealth - resolved.damageDealt);
    expect(resolved.playerHealth).toBe(
      guardian.playerHealth - resolved.damageTaken);
    expect(resolved.replayed).toBe(false);
    const replay = await request.post(guardianUrl + '/turn', {
      headers: cardHeaders, data: { action: 'strike', expectedTurn: 0 },
    });
    expect(replay.status()).toBe(200);
    expect(((await replay.json()) as { replayed: boolean }).replayed).toBe(true);
    const current = await request.get(guardianUrl, { headers: userHeaders });
    expect(current.status()).toBe(200);
    expect(((await current.json()) as { turn: number }).turn).toBe(1);
    const stolenGuardian = await request.get(guardianUrl, {
      headers: { Authorization: 'Bearer ' + otherToken },
    });
    expect(stolenGuardian.status()).toBe(404);

    const rest = await request.post(api + '/api/characters/me/rest', {
      headers: { ...userHeaders, 'Idempotency-Key': randomUUID() },
    });
    expect(rest.status()).toBe(409);
    expect(((await rest.json()) as { code: string }).code).toBe('rest_encounter_active');

    const healing = await request.post(
      api + '/api/characters/me/heal/' + randomUUID(), {
        headers: { ...userHeaders, 'Idempotency-Key': randomUUID() },
      });
    expect(healing.status()).toBe(409);
    expect(((await healing.json()) as { code: string }).code).toBe('heal_encounter_active');

    // Completing the same server-verified portal grants its normal reward and
    // automatically makes the persisted encounter inactive BEFORE TTL expiry.
    const puzzle = await request.get(
      api + '/api/personal-content/' + grantId + '/challenge',
      { headers: userHeaders });
    expect(puzzle.status()).toBe(200);
    const answer = (await puzzle.json()) as { sequence: string[] };
    const completion = await request.post(
      api + '/api/personal-content/' + grantId + '/challenge/attempt',
      { headers: userHeaders, data: { sequence: answer.sequence } });
    expect(completion.status()).toBe(200);

    const released = await request.get(api + '/api/characters/me/encounter', {
      headers: userHeaders,
    });
    expect(released.status()).toBe(200);
    expect(((await released.json()) as { active: boolean }).active).toBe(false);
    const guardianAfterCompletion = await request.get(guardianUrl, { headers: userHeaders });
    expect(guardianAfterCompletion.status()).toBe(404);
  }
});
