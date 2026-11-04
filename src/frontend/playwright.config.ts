import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/Vuxo/',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: {
    // env applies to both build and preview, also on Windows (no POSIX shell assignments).
    command: 'npm run build && npm run preview -- --host 127.0.0.1 --port 4173',
    env: { VITE_E2E_REALTIME: 'true', VITE_E2E_AUTH: 'true' },
    url: 'http://127.0.0.1:4173/Vuxo/',
    reuseExistingServer: !process.env.CI
  }
});
