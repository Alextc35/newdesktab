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
    command: 'python3 -m http.server 4175 --bind 127.0.0.1',
    url: 'http://127.0.0.1:4175/tests/browser-harness.html',
    reuseExistingServer: true,
    stderr: 'ignore',
    timeout: 20_000
  }
});
