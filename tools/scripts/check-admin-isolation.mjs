#!/usr/bin/env node
import { access, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;
const PLAYER_SOURCE = join(ROOT, 'packages/client/src');
const PLAYER_DIST = join(ROOT, 'packages/client/dist');
const SOURCE_FORBIDDEN = [
  '@alderfell/admin',
  'Alderfell Operations',
  '/admin/',
  'ADMIN_READ_TOKEN',
];
// @netlify/identity contains an unused administrator client in its published
// browser module, including a literal `/admin/users` path. That is Netlify's
// Identity API, not Alderfell's operations surface. Source remains forbidden
// from referencing any /admin/ route; the built artifact is checked for the
// operations package, branding and credential instead of a third-party string.
const DIST_FORBIDDEN = ['@alderfell/admin', 'Alderfell Operations', 'ADMIN_READ_TOKEN'];

async function* files(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield path;
  }
}

const violations = [];
for (const directory of [PLAYER_SOURCE, PLAYER_DIST]) {
  try {
    await access(directory);
  } catch {
    continue;
  }
  for await (const file of files(directory)) {
    if (!/\.(?:html|js|css|ts|tsx)$/.test(file)) continue;
    const content = await readFile(file, 'utf8');
    const forbidden = directory === PLAYER_SOURCE ? SOURCE_FORBIDDEN : DIST_FORBIDDEN;
    for (const marker of forbidden) {
      if (content.includes(marker)) violations.push(`${file}: contains ${JSON.stringify(marker)}`);
    }
  }
}

if (violations.length) {
  console.error('Admin isolation violations:\n');
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}
console.log('Admin isolation: OK');
