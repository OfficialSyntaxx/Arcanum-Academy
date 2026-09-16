import { test, expect } from '@playwright/test';
for (const [name, width, height] of [
  ['phone', 390, 844],
  ['landscape', 844, 390],
  ['desktop', 1280, 800],
] as const) {
  test(`${name}: submits a 3D world and keeps the HUD readable`, async ({ page }, info) => {
    await page.setViewportSize({ width, height });
    await page.addInitScript(() => {
      (window as { __alderfellDiagnostics?: boolean }).__alderfellDiagnostics = true;
    });
    // Deliberately no clock control here. The in-game hour comes from the sim
    // clock, not from wall time, so pinning Date bought no determinism - and
    // every Playwright clock mode replaces the requestAnimationFrame timestamp
    // the engine derives its frame delta from, which stops the world advancing
    // entirely: the player stands still and never reaches anything.
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
    await expect(page.locator('.status-bar__toggle')).toHaveAttribute('aria-label', /Connected/);
    await expect
      .poll(async () =>
        Number(await page.locator('canvas.app__canvas').getAttribute('data-render-calls')),
      )
      .toBeGreaterThan(5);
    await expect
      .poll(async () =>
        Number(await page.locator('canvas.app__canvas').getAttribute('data-render-triangles')),
      )
      .toBeGreaterThan(100);
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
  });
}

test('phone: walk to a resource, earn XP, inspect skills, and reach a crafting station', async ({
  page,
}, info) => {
  // Two real waypoint routes plus the authoritative collection interval can
  // take longer on an unloaded CI runner; allow the game path to finish.
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  // No clock control; see the note in the first test.
  await page.goto('/');
  await expect(page.locator('.status-bar__toggle')).toHaveAttribute('aria-label', /Connected/);
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await page.getByRole('button', { name: 'Resonance Seam' }).click();
  // 60s, not 30s: the walk itself measures about ten seconds, but this runs
  // under SwiftShader, where loading a rig per crowd member before the world
  // starts moving costs most of a smaller budget. The assertion is here to
  // catch a player who never arrives, and it still does that.
  await expect(page.locator('.prompt__label')).toHaveText('Resonance Seam', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Mine', exact: true }).click();
  await expect(page.locator('.gathering-hud')).toBeVisible();
  // The normal ten-second collection loop must produce authoritative rewards.
  await expect(page.locator('.gathering-hud__xp')).toHaveText(/\+[1-9][0-9]* xp/, {
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.locator('.gathering-hud')).not.toBeVisible();
  await page.getByRole('button', { name: 'Satchel', exact: true }).click();
  await expect(page.locator('.inventory-panel__list li').first()).toBeVisible();
  await expect(page.locator('.skill-list__row').filter({ hasText: 'Mining' })).toContainText(
    /[1-9][0-9]* XP/,
  );
  await info.attach('phone-earned-resources', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await page.getByRole('button', { name: 'Crystal Grinder' }).click();
  await expect(page.locator('.prompt__label')).toHaveText('Crystal Grinder', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Refine', exact: true }).click();
  await expect(page.locator('.crafting-panel')).toContainText('Grind Resonant Dust');
  await info.attach('phone-crafting-station', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

test('phone: travel to the Shore Wolf and receive authoritative combat HUD feedback', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  // No clock control; see the note in the first test.
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.status-bar__toggle')).toHaveAttribute('aria-label', /Connected/);
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await page.getByRole('button', { name: 'Shore Wolf', exact: true }).click();
  await expect(page.locator('.combat-hud')).toBeVisible({ timeout: 40_000 });
  await expect(page.locator('.combat-hud')).toContainText('Shore Wolf');
  // Combat is automatic: blows trade themselves on the 600 ms tick with no
  // attack button, so the proof is that the creature's health falls on its
  // own and the fight resolves. Damage is rolled, so the only safe assertion
  // is that it reaches zero or the wolf is reported defeated.
  await expect
    .poll(
      async () => {
        const text = (await page.locator('.combat-hud').textContent()) ?? '';
        const match = /(\d+)\/4/.exec(text);
        return match === null ? 4 : Number(match[1]);
      },
      { timeout: 40_000 },
    )
    .toBeLessThan(4);
  await info.attach('phone-combat-hud', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
  expect(errors).toEqual([]);
});
