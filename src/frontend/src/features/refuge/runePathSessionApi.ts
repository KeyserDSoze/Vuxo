import { getApiBaseUrl } from '../character/appearance';

export type RunePathPosition = { x: number; y: number };

export type RunePathTicket = {
  runId: string;
  activityKey: 'rune-path';
  rulesVersion: string;
  puzzleIndex: number;
  startedAtUtc: string;
  expiresAtUtc: string;
  completedAtUtc: string | null;
  stepsChecked: number | null;
  state: 'active' | 'completed' | 'expired';
  replayed: boolean;
};

export type RunePathBoard = {
  puzzleIndex: number;
  rulesVersion: string;
  gridSize: number;
  start: RunePathPosition;
  goal: RunePathPosition;
  walls: RunePathPosition[];
};

export class RunePathSessionApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly nextAllowedAtUtc?: string,
  ) {
    super(code);
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const details = await response.json().catch(() => null) as {
      code?: string;
      nextAllowedAtUtc?: string;
    } | null;
    throw new RunePathSessionApiError(
      details?.code ?? 'activity_run_unavailable',
      response.status,
      details?.nextAllowedAtUtc,
    );
  }
  return response.json() as Promise<T>;
}

/** Read-only practice progress. Informational: fixed mazes can be automated. */
export type RunePathPracticeBoardProgress = {
  puzzleIndex: number;
  completedRuns: number;
  bestSteps: number;
};

export type RunePathPracticeProgress = {
  activityKey: 'rune-path';
  rulesVersion: string;
  completedRuns: number;
  boardsSolved: number;
  totalBoards: number;
  milestone: 'newcomer' | 'explorer' | 'navigator' | 'cartographer';
  boards: RunePathPracticeBoardProgress[];
  rewardsEnabled: false;
  xpGranted: 0;
  itemsGranted: 0;
  rewardBlockReason: 'automatable_practice';
};

export async function fetchRunePathPracticeProgress(
  token: string,
  signal?: AbortSignal,
): Promise<RunePathPracticeProgress> {
  const response = await fetch(getApiBaseUrl() + '/api/activities/runs/progress/rune-path', {
    method: 'GET',
    cache: 'no-store',
    headers: { Authorization: 'Bearer ' + token },
    signal,
  });
  return readResponse<RunePathPracticeProgress>(response);
}

export type RunePathHistoryEntry = Pick<RunePathTicket,
  'runId' | 'activityKey' | 'rulesVersion' | 'puzzleIndex' |
  'startedAtUtc' | 'expiresAtUtc' | 'state' |
  'completedAtUtc' | 'stepsChecked'>;

export async function fetchRunePathHistory(
  token: string,
  signal?: AbortSignal,
): Promise<RunePathHistoryEntry[]> {
  // The server enforces owner-only filtering and a bounded newest-first page.
  const response = await fetch(getApiBaseUrl() + '/api/activities/runs/history/rune-path?limit=10', {
    method: 'GET',
    cache: 'no-store',
    headers: { Authorization: 'Bearer ' + token },
    signal,
  });
  const data = await readResponse<{ items: RunePathHistoryEntry[] }>(response);
  return data.items;
}

export function startRunePathSession(
  token: string,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<RunePathTicket> {
  return fetch(getApiBaseUrl() + '/api/activities/runs/rune-path', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: 'Bearer ' + token,
      'Idempotency-Key': idempotencyKey,
    },
    signal,
  }).then(readResponse<RunePathTicket>);
}

/**
 * Look up only the current authenticated owner's active Rune Path ticket.
 * A 204 is the normal, non-error "no active run" response. There is no
 * cross-device step synchronization: only the server-owned board and ticket
 * transfer, and the second device starts its visual route from the beginning.
 */
export async function fetchActiveRunePathSession(
  token: string,
  signal?: AbortSignal,
): Promise<RunePathTicket | null> {
  const response = await fetch(getApiBaseUrl() + '/api/activities/runs/active/rune-path', {
    method: 'GET',
    cache: 'no-store',
    headers: { Authorization: 'Bearer ' + token },
    signal,
  });
  if (response.status === 204) return null;
  return readResponse<RunePathTicket>(response);
}

export function fetchRunePathSession(
  token: string,
  runId: string,
  signal?: AbortSignal,
): Promise<RunePathTicket> {
  return fetch(getApiBaseUrl() + '/api/activities/runs/' + encodeURIComponent(runId), {
    method: 'GET',
    cache: 'no-store',
    headers: { Authorization: 'Bearer ' + token },
    signal,
  }).then(readResponse<RunePathTicket>);
}

export function fetchRunePathBoard(
  puzzleIndex: number,
  signal?: AbortSignal,
): Promise<RunePathBoard> {
  return fetch(getApiBaseUrl() + '/api/activities/rune-path/puzzles/' + puzzleIndex, {
    method: 'GET',
    cache: 'no-store',
    signal,
  }).then(readResponse<RunePathBoard>);
}

export function completeRunePathSession(
  token: string,
  runId: string,
  key: string,
  moves: string,
  signal?: AbortSignal,
): Promise<RunePathTicket> {
  return fetch(getApiBaseUrl() + '/api/activities/runs/' +
    encodeURIComponent(runId) + '/complete', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: 'Bearer ' + token,
      'Idempotency-Key': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ moves }), // Never send XP, reward, puzzle, time or score.
    signal,
  }).then(readResponse<RunePathTicket>);
}
