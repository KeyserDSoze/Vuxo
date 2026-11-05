import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

const api = 'http://127.0.0.1:8080';

async function login(request: APIRequestContext, subject: string) {
  const response = await request.post(api + '/api/auth/mock', {
    data: { subject, displayName: 'Offworld Run', role: 'User' },
  });
  expect(response.status()).toBe(200);
  return ((await response.json()) as { accessToken: string }).accessToken;
}

type Board = {
  gridSize: number;
  start: { x: number; y: number };
  goal: { x: number; y: number };
  walls: Array<{ x: number; y: number }>;
};

function solve(board: Board): string {
  const blocked = new Set(board.walls.map(cell => cell.x + ':' + cell.y));
  const visited = new Set([board.start.x + ':' + board.start.y]);
  const queue = [{ ...board.start, moves: '' }];
  const directions = [
    { dx: 0, dy: 1, code: 'D' },
    { dx: 1, dy: 0, code: 'R' },
    { dx: 0, dy: -1, code: 'U' },
    { dx: -1, dy: 0, code: 'L' },
  ];

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node.x === board.goal.x && node.y === board.goal.y) return node.moves;
    for (const direction of directions) {
      const x = node.x + direction.dx;
      const y = node.y + direction.dy;
      const key = x + ':' + y;
      if (x < 0 || y < 0 || x >= board.gridSize || y >= board.gridSize
        || blocked.has(key) || visited.has(key)) continue;
      visited.add(key);
      queue.push({ x, y, moves: node.moves + direction.code });
    }
  }
  throw new Error('Server assigned an unsolvable Rune Path board');
}

test('real offworld tickets survive API round-trips and reject replay, theft and forged rewards', async ({ request }) => {
  const playerId = 'activity-live-' + randomUUID();
  const token = await login(request, playerId);
  const otherToken = await login(request, 'activity-other-' + randomUUID());
  const ownerHeaders = { Authorization: 'Bearer ' + token };

  const character = await request.post(api + '/api/characters', {
    headers: ownerHeaders,
    data: {
      name: 'Path Vuxian',
      strength: 2, dexterity: 2, intelligence: 2,
      constitution: 2, luck: 1, faith: 1,
      appearance: {
        hairStyle: 'hair-1', hairColor: 'black', face: 'face-1',
        bodyType: 'body-1', skinTone: 'skin-1', topColor: 'blue',
        bottomStyle: 'shorts', bottomColor: 'black',
        shoeStyle: 'shoe-1', shoeColor: 'white',
      },
    },
  });
  expect(character.status()).toBe(201);

  const base = api + '/api/activities/runs';
  const startKey = randomUUID();
  const startHeaders = { ...ownerHeaders, 'Idempotency-Key': startKey };
  const start = await request.post(base + '/rune-path', { headers: startHeaders });
  expect(start.status()).toBe(201);
  const ticket = await start.json() as {
    runId: string; rulesVersion: string; activityKey: string;
    puzzleIndex: number; state: string; replayed: boolean; expiresAtUtc: string;
  };
  expect(ticket.state).toBe('active');
  expect(ticket.activityKey).toBe('rune-path');
  expect(ticket.rulesVersion).toBe('rune-path-practice-v1');
  expect(ticket.replayed).toBe(false);
  expect(new Date(ticket.expiresAtUtc).getTime()).toBeGreaterThan(Date.now());

  const retryStart = await request.post(base + '/rune-path', { headers: startHeaders });
  expect(retryStart.status()).toBe(200);
  const repeated = await retryStart.json() as { runId: string; replayed: boolean };
  expect(repeated.runId).toBe(ticket.runId);
  expect(repeated.replayed).toBe(true);

  const parallelStart = await request.post(base + '/rune-path', {
    headers: { ...ownerHeaders, 'Idempotency-Key': randomUUID() },
  });
  expect(parallelStart.status()).toBe(409);
  expect((await parallelStart.json() as { code: string }).code).toBe('activity_run_active');

  const stolen = await request.get(base + '/' + ticket.runId, {
    headers: { Authorization: 'Bearer ' + otherToken },
  });
  expect(stolen.status()).toBe(404);

  const boardResponse = await request.get(
    api + '/api/activities/rune-path/puzzles/' + ticket.puzzleIndex);
  expect(boardResponse.status()).toBe(200);
  const board = await boardResponse.json() as Board;
  const moves = solve(board);
  expect(moves.length).toBeLessThanOrEqual(32);
  const finishUrl = base + '/' + ticket.runId + '/complete';
  const finishKey = randomUUID();
  const finishHeaders = { ...ownerHeaders, 'Idempotency-Key': finishKey };

  const invalid = await request.post(finishUrl, {
    headers: finishHeaders, data: { moves: 'UUUU', reward: 'legendary', xp: 99999 },
  });
  expect(invalid.status()).toBe(422);
  expect((await invalid.json() as { code: string }).code).toBe('activity_run_invalid_path');

  const valid = await request.post(finishUrl, {
    headers: finishHeaders,
    data: { moves, puzzleIndex: (ticket.puzzleIndex + 1) % 3, xp: 999999, rewardsEnabled: true },
  });
  expect(valid.status()).toBe(200);
  const completion = await valid.json() as {
    runId: string; state: string; replayed: boolean; stepsChecked: number;
  };
  expect(completion.runId).toBe(ticket.runId);
  expect(completion.state).toBe('completed');
  expect(completion.stepsChecked).toBe(moves.length);
  expect(completion.replayed).toBe(false);
  expect(Object.keys(completion)).not.toContain('xp');
  expect(Object.keys(completion)).not.toContain('rewards');

  const replay = await request.post(finishUrl, {
    headers: finishHeaders, data: { moves },
  });
  expect(replay.status()).toBe(200);
  expect((await replay.json() as { replayed: boolean }).replayed).toBe(true);

  const wrongProofSameKey = await request.post(finishUrl, {
    headers: finishHeaders, data: { moves: moves + 'L' },
  });
  expect(wrongProofSameKey.status()).toBe(409);
  expect((await wrongProofSameKey.json() as { code: string }).code)
    .toBe('activity_idempotency_key_reused');

  const stolenFinish = await request.post(finishUrl, {
    headers: { Authorization: 'Bearer ' + otherToken,
      'Idempotency-Key': randomUUID() },
    data: { moves },
  });
  expect(stolenFinish.status()).toBe(404);

  const status = await request.get(base + '/' + ticket.runId, { headers: ownerHeaders });
  expect(status.status()).toBe(200);
  expect((await status.json() as { state: string }).state).toBe('completed');
});
