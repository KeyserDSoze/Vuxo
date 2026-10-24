import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

type E2EPlayer = {
  playerId: string;
  characterId: string;
  characterName: string;
  x: number;
  y: number;
  speedMultiplier: number;
  revision: number;
};

function e2eWorldPlugin(): Plugin {
  const players = new Map<string, E2EPlayer>();
  let spawnIndex = 0;

  return {
    name: 'vuxo-e2e-world',
    configurePreviewServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = new URL(request.url ?? '/', 'http://localhost').pathname;
        if (!path.startsWith('/__vuxo_e2e/world/')) {
          next();
          return;
        }

        try {
          if (request.method === 'POST' && path.endsWith('/reset')) {
            players.clear();
            spawnIndex = 0;
            sendJson(response, 200, { ok: true });
            return;
          }

          if (request.method === 'GET' && path.endsWith('/state')) {
            sendJson(response, 200, { players: [...players.values()] });
            return;
          }

          const body = await readJsonBody(request);
          const playerId = typeof body.playerId === 'string' ? body.playerId.trim() : '';
          if (!playerId) {
            sendJson(response, 400, { code: 'player_id_required' });
            return;
          }

          if (request.method === 'POST' && path.endsWith('/join')) {
            let player = players.get(playerId);
            const isReconnect = Boolean(player);
            if (!player) {
              const index = spawnIndex++;
              player = {
                playerId,
                characterId: `e2e-${playerId}`,
                characterName: typeof body.characterName === 'string' && body.characterName.trim()
                  ? body.characterName.trim()
                  : playerId,
                x: 4.5 + (index * 1.5),
                y: 4.5,
                speedMultiplier: 1,
                revision: 0,
              };
              players.set(playerId, player);
            }

            sendJson(response, 200, {
              self: player,
              players: [...players.values()],
              isReconnect,
              replacedConnectionId: null,
            });
            return;
          }

          if (request.method === 'POST' && path.endsWith('/intent')) {
            const player = players.get(playerId);
            if (!player) {
              sendJson(response, 409, { code: 'world_player_not_joined' });
              return;
            }

            const horizontal = normalizeAxis(body.horizontal);
            const vertical = normalizeAxis(body.vertical);
            if (horizontal !== 0 || vertical !== 0) {
              const length = Math.sqrt((horizontal * horizontal) + (vertical * vertical));
              player.x += (horizontal / length) * 0.5;
              player.y += (vertical / length) * 0.5;
              player.revision += 1;
            }
            sendJson(response, 200, { accepted: true });
            return;
          }

          if (request.method === 'POST' && path.endsWith('/leave')) {
            players.delete(playerId);
            sendJson(response, 200, { ok: true });
            return;
          }

          sendJson(response, 404, { code: 'not_found' });
        } catch (error) {
          console.error('Vuxo E2E world middleware failed', error);
          sendJson(response, 500, { code: 'e2e_world_failed' });
        }
      });
    },
  };
}

async function readJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function normalizeAxis(value: unknown): number {
  const numberValue = Number(value);
  if (numberValue > 0) return 1;
  if (numberValue < 0) return -1;
  return 0;
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/Vuxo/',
  server: {
    // Docker host-port overrides must also update the Vite HMR websocket client port.
    ...(process.env.VITE_HMR_CLIENT_PORT
      ? { hmr: { clientPort: Number(process.env.VITE_HMR_CLIENT_PORT) } }
      : {}),
  },
  plugins: [
    react(),
    ...(process.env.VITE_E2E_REALTIME === 'true' ? [e2eWorldPlugin()] : []),
  ],
  build: {
    sourcemap: true
  }
});
