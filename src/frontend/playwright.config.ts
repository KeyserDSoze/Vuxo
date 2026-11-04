import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.VUXO_E2E_PORT ?? '4173');
const rawBase = process.env.VITE_BASE_PATH ?? '/Vuxo/';
const basePath = `${rawBase.startsWith('/') ? '' : '/'}${rawBase.endsWith('/') ? rawBase : rawBase + '/'}`;
const localUrl = `http://127.0.0.1:${port}${basePath}`;

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: localUrl,
    trace: 'on-first-retry'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: {
    // Native Node launcher works in Windows PowerShell/cmd and Unix shells.
    command: 'node scripts/start-e2e.mjs',
    url: localUrl,
    reuseExistingServer: !process.env.CI
  }
});
