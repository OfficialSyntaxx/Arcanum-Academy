/**
 * Renders the running game at phone size and saves screenshots.
 *
 * Usage: start the gateway and `vite preview` (see playwright.config.ts), then
 *   node tools/scripts/screenshot-phone.mjs <output-dir>
 * Headless Chromium renders real WebGL through ANGLE + SwiftShader when given
 * the pre-installed executable; the default download does not. Frames are
 * spawn, a synthetic pinch zoom, a run, and the resting pose afterwards.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
const out = process.argv[2] ?? 'screenshots';
mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch({
    headless: true,
    executablePath: process.env['CHROMIUM_PATH'] ?? '/opt/pw-browsers/chromium',
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--enable-unsafe-swiftshader',
      '--ignore-gpu-blocklist',
    ],
  });
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await p.clock.setFixedTime(new Date('2026-09-09T12:30:00Z'));
  await p.goto('http://127.0.0.1:4173/');
  await p.locator('.hub').waitFor({ timeout: 30000 });
  await p.waitForTimeout(5000);
  const cdp = await ctx.newCDPSession(p);
  // Synthetic pinch-out: two fingers moving apart, in steps.
  const cx = 195,
    cy = 480;
  const steps = 14;
  const touches = (d) => [
    { x: cx - d, y: cy, id: 1 },
    { x: cx + d, y: cy, id: 2 },
  ];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches(30) });
  for (let i = 1; i <= steps; i += 1) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: touches(30 + i * 9),
    });
    await p.waitForTimeout(30);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/5-zoomed.png` });
  // Walk a short way so the run cycle shows.
  await p.touchscreen.tap(cx + 60, cy + 120);
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${out}/6-run.png` });
  await p.waitForTimeout(3000);
  await p.screenshot({ path: `${out}/7-idle.png` });
  console.log(JSON.stringify({ errors: errors.slice(0, 6) }));
  await b.close();
})().catch((e) => {
  console.log('ERR', e.message.slice(0, 400));
  process.exit(1);
});
