import { defineConfig } from '@playwright/test';

/**
 * A Chromium to use instead of Playwright's own download.
 *
 * CI installs browsers normally and leaves this unset. Some sandboxes ship a
 * Chromium at a fixed path whose build number does not match what this
 * Playwright expects, and would otherwise fail to launch at all; pointing
 * `CHROMIUM_PATH` at it makes the suite runnable there without changing what
 * CI does. `tools/scripts/screenshot-phone.mjs` reads the same variable.
 */
const chromiumPath = process.env['CHROMIUM_PATH'];

export default defineConfig({
  testDir: './tools/smoke',
  timeout: 45_000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    // Headless Chrome otherwise selects a display-backed GL implementation on
    // Linux runners and happily creates a canvas whose framebuffer stays black.
    // Explicit ANGLE + SwiftShader makes the smoke test exercise real WebGL in CI.
    launchOptions: {
      ...(chromiumPath !== undefined && chromiumPath !== ''
        ? { executablePath: chromiumPath }
        : {}),
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-webgl',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
      ],
    },
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
