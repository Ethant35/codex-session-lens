import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 5_000 },
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: process.env.LENS_TEST_REPORT || '.local/e2e-report.json' }],
  ],
  outputDir: '.local/e2e-artifacts',
  preserveOutput: 'failures-only',
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
