import { test, expect } from '@playwright/test';
import { PNG } from 'pngjs';

/** Real screenshot bytes, never drawImage(WebGLCanvas). Excludes the HUD. */
function worldColours(bytes: Buffer): number {
  const png = PNG.sync.read(bytes);
  const colours = new Set<string>();
  for (let y = Math.floor(png.height * 0.22); y < png.height * 0.78; y += 7) {
    for (let x = Math.floor(png.width * 0.08); x < png.width * 0.92; x += 7) {
      const i = (y * png.width + x) * 4;
      colours.add(`${png.data[i]! >> 5},${png.data[i + 1]! >> 5},${png.data[i + 2]! >> 5}`);
    }
  }
  return colours.size;
}

for (const [name, width, height] of [
  ['phone', 390, 844],
  ['landscape', 844, 390],
  ['desktop', 1280, 800],
] as const) {
  test(`${name}: real world, readable HUD, inventory and blank-world mutation`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height });
    // Pin only wall time; requestAnimationFrame and timers continue to advance.
    await page.clock.setFixedTime(new Date('2026-09-09T12:30:00Z'));
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('response', (response) => {
      if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    });
    await page.goto('/');
    await expect(page.locator('.hub')).toBeVisible();
    await expect(page.locator('.status-bar')).toContainText('Connected');
    await expect
      .poll(async () => worldColours(await page.screenshot()), { timeout: 15_000 })
      .toBeGreaterThan(12);
    const hud = (await page.locator('.hub-hud').boundingBox())!;
    const bag = (await page.getByRole('button', { name: 'Satchel', exact: true }).boundingBox())!;
    expect(hud.x + hud.width <= bag.x || hud.y + hud.height <= bag.y).toBeTruthy();
    expect(bag.height).toBeGreaterThanOrEqual(44);
    const overflow = await page
      .locator('.hub-hud')
      .evaluate((node) => node.scrollWidth > node.clientWidth);
    expect(overflow).toBe(false);
    await info.attach(`${name}-world`, { body: await page.screenshot(), contentType: 'image/png' });
    await page.getByRole('button', { name: 'Satchel', exact: true }).click();
    await expect(page.locator('.inventory-panel')).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    expect(errors).toEqual([]);

    // Break production rendering at the context boundary, leaving the HUD alive.
    // The exact same detector must reject a real cleared framebuffer.
    await page.addInitScript(() => {
      const original = WebGL2RenderingContext.prototype.drawElements;
      WebGL2RenderingContext.prototype.drawElements = function (...args) {
        void original;
        void args;
      };
      WebGL2RenderingContext.prototype.drawArrays = () => {};
      WebGL2RenderingContext.prototype.drawElementsInstanced = () => {};
      WebGL2RenderingContext.prototype.drawArraysInstanced = () => {};
    });
    await page.reload();
    await expect(page.locator('.hub')).toBeVisible();
    expect(worldColours(await page.screenshot())).toBeLessThanOrEqual(12);
  });
}
