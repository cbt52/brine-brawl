import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  timeout: 60_000,
  webServer: {
    command: 'OUT_DIR=dist/test-client npm run build && CLIENT_DIR=dist/test-client PORT=8721 ALLOW_DEBUG=1 npm start',
    url: 'http://127.0.0.1:8721/healthz',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: { baseURL: 'http://127.0.0.1:8721' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
