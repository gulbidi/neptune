import { defineConfig, devices } from '@playwright/test';

// Live tests: drive the Vite dev server in the installed Chrome, headless.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:1420',
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  projects: [
    // The bridge is a desktop window and the chat client a phone app, so each spec runs at its own size.
    { name: 'desktop', testMatch: 'bridge.spec.ts', use: { ...devices['Desktop Chrome'], channel: 'chrome' } },
    { name: 'phone', testMatch: 'phone.spec.ts', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
