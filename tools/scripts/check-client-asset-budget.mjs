/**
 * Keeps the mobile PWA honest.
 *
 * A model can look harmless in source control while pulling multiple 4K PBR
 * maps into the phone bundle. Workbox's 2 MiB precache ceiling catches some of
 * that late; this check fails immediately with a useful list and protects the
 * actual first-load budget too.
 */
import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const DIST = new URL('../../packages/client/dist/', import.meta.url);
const MAX_FILE_BYTES = 1 * 1024 * 1024;
const MAX_PRECACHE_BYTES = 3 * 1024 * 1024;

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? filesIn(path) : [path];
    }),
  );
  return nested.flat();
}

const distPath = DIST.pathname;
const files = (await filesIn(distPath)).filter((path) => !path.endsWith('.map'));
const measured = await Promise.all(
  files.map(async (path) => ({ path: relative(distPath, path), bytes: (await stat(path)).size })),
);
const oversized = measured.filter((entry) => entry.bytes > MAX_FILE_BYTES);
const total = measured.reduce((sum, entry) => sum + entry.bytes, 0);

if (oversized.length > 0 || total > MAX_PRECACHE_BYTES) {
  const details = [...oversized, ...measured]
    .filter((entry, index, source) => oversized.includes(entry) || index < 8)
    .map((entry) => `  ${entry.path}: ${(entry.bytes / 1024).toFixed(1)} KiB`)
    .join('\n');
  throw new Error(
    `Client mobile asset budget exceeded (${(total / 1024).toFixed(1)} KiB total; ` +
      `${(MAX_PRECACHE_BYTES / 1024).toFixed(0)} KiB limit).\n${details}`,
  );
}

console.log(
  `Client asset budget OK: ${(total / 1024).toFixed(1)} KiB total, ` +
    `${measured.length} precached files, max ${(Math.max(...measured.map((entry) => entry.bytes)) / 1024).toFixed(1)} KiB.`,
);
