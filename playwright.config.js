import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4175',
    headless: true,
    launchOptions: process.env.NEWDESKTAB_BROWSER_PATH
      ? { executablePath: process.env.NEWDESKTAB_BROWSER_PATH }
      : {}
  },
  webServer: {
    command: 'node scripts/serve-tests.mjs',
    url: 'http://127.0.0.1:4175/tests/browser-harness.html',
    reuseExistingServer: !process.env.CI,
    timeout: 20_000
  }
});
