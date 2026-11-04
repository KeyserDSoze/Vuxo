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
  const grantResponse = await request.post(api + '/api/admin/personal-content/grants', {
    headers: { Authorization: 'Bearer ' + gmToken },
    data: {
      sourceEventId: randomUUID(),
      playerId,
      contentKey: 'portal.live.memory',
      portalKey: 'challenge.sequence.v1',
      dialogBranchKey: 'dialog.live',
      rewardKey: 'reward.reference',
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

  const remaining = await request.get(api + '/api/personal-content', { headers: userHeaders });
  expect(remaining.ok()).toBeTruthy();
  expect(await remaining.json()).toEqual([]);
  const replay = await request.post(
    api + '/api/personal-content/' + grantId + '/challenge/attempt',
    { headers: userHeaders, data: { sequence: puzzle.sequence } }
  );
  expect(replay.status()).toBe(409);
});
