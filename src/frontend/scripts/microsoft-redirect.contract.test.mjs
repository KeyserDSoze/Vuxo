import test from 'node:test';
import assert from 'node:assert/strict';
import { microsoftPopupRedirectUri } from '../src/features/auth/microsoftRedirectUri.ts';

const redirect = (base, origin = 'https://vuxo.quest') => microsoftPopupRedirectUri(base, origin);

test('production custom domain resolves to the root bridge, not the SPA route', () => {
  assert.equal(redirect('/'), 'https://vuxo.quest/redirect.html');
});
test('GitHub Pages repository base uses the subdirectory bridge', () => {
  assert.equal(redirect('/Vuxo/'), 'https://vuxo.quest/Vuxo/redirect.html');
});
test('local preview origin retains port and the configured base path', () => {
  assert.equal(redirect('/Vuxo/', 'http://127.0.0.1:4173'),
    'http://127.0.0.1:4173/Vuxo/redirect.html');
});
test('local Vite development base resolves consistently', () => {
  assert.equal(redirect('/', 'http://localhost:5173'),
    'http://localhost:5173/redirect.html');
});
test('a trailing slash is normalized if an environment forgot it', () => {
  assert.equal(redirect('/Vuxo'), 'https://vuxo.quest/Vuxo/redirect.html');
});
test('nested deployment preserves its own path', () => {
  assert.equal(redirect('/games/vuxo/'),
    'https://vuxo.quest/games/vuxo/redirect.html');
});
test('off-origin redirects are rejected instead of forwarding provider callbacks', () => {
  assert.throws(() => redirect('https://untrusted.example/'), /origin_mismatch/);
  assert.throws(() => redirect('//untrusted.example/'), /origin_mismatch/);
});
test('URL base parameters cannot introduce fragment or query credentials', () => {
  assert.throws(() => redirect('/Vuxo/?token=abc'), /origin_mismatch/);
  assert.throws(() => redirect('/Vuxo/#secret'), /origin_mismatch/);
});
test('a non-http origin cannot be used for a browser OAuth popup', () => {
  assert.throws(() => redirect('/', 'file:///tmp/'), /invalid_origin/);
});
