import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tools/smoke',
  timeout: 45_000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  webServer: [
    {
      command: 'npm run start --workspace @alderfell/server',
      url: 'http://127.0.0.1:8787/healthz',
      env: { ALLOWED_ORIGINS: 'http://127.0.0.1:4173', DATABASE_URL: '' },
      reuseExistingServer: false,
    },
    {
      command:
        'npm run preview --workspace @alderfell/client -- --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
    },
  ],
});
