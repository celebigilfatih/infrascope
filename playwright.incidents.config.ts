import { defineConfig, devices } from '@playwright/test';

// This suite writes fixture records. Never attach it to an existing app/database.
const database = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
if (process.env.INFRASCOPE_INCIDENT_E2E !== '1' || database?.pathname !== '/infrascope_incident_e2e') {
  throw new Error('Run npm run test:incidents:regression; browser tests require the isolated infrascope_incident_e2e database.');
}

export default defineConfig({
  testDir: './tests/incident-e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 180_000,
  expect: { timeout: 30_000 },
  outputDir: 'output/incident-regression/results',
  reporter: [['list'], ['html', { outputFolder: 'output/incident-regression/report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3180',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30_000,
    navigationTimeout: 90_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }],
  webServer: {
    command: 'npx next dev --turbo --hostname 127.0.0.1 -p 3180',
    url: 'http://127.0.0.1:3180/login',
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
