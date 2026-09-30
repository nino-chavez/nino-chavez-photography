import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'site-activity.spec.ts',
  reporter: 'list',
  timeout: 15000,
  use: {
    browserName: 'chromium',
    headless: true,
    launchOptions: process.env.SITE_ACTIVITY_BROWSER_EXECUTABLE
      ? { executablePath: process.env.SITE_ACTIVITY_BROWSER_EXECUTABLE }
      : {}
  }
});
