#!/usr/bin/env node
/**
 * Proves the smoke suite can fail.
 *
 * G1 (AI_HANDOVER §13.1) requires `npm run smoke` to be green *and* to have
 * been shown to fail when the world is blanked, on the grounds that a check
 * nobody has seen fail is a check nobody should trust. That had never been run,
 * and when it finally was, the suite passed with every piece of scenery
 * stripped out of the zone: the world assertion was the renderer's own totals,
 * which characters and the HUD dominate, so an empty world cleared them by two
 * orders of magnitude.
 *
 * This script makes that proof repeatable instead of a claim in a commit
 * message. It blanks the zone geometry, rebuilds the client, runs the suite,
 * and succeeds only if the suite *fails*. A green run here means the world
 * check has stopped being able to detect a missing world, which is a defect in
 * the check, not a pass.
 *
 * The mutation is applied to a working copy and reverted in a `finally`, so an
 * interrupted run cannot leave the tree modified. It refuses to start against a
 * dirty target file, because it restores by overwriting.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const target = path.join(root, 'packages/client/src/world/scene-builder.ts');

/** The line every zone's geometry passes through before it is returned. */
const ANCHOR = '  return {\n    group,\n    occluders,\n    markers,\n    doors,\n';
const MUTATION = '  group.clear(); // smoke mutation probe\n';

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: root, stdio: 'pipe', ...options });
}

function isDirty() {
  const status = run('git', ['status', '--porcelain', '--', target]).toString().trim();
  return status.length > 0;
}

if (isDirty()) {
  console.error(
    `Refusing to run: ${path.relative(root, target)} has uncommitted changes.\n` +
      'This script restores the file by overwriting it, which would discard them.',
  );
  process.exit(2);
}

const original = readFileSync(target, 'utf8');
if (!original.includes(ANCHOR)) {
  console.error(
    'Refusing to run: the zone geometry return has changed shape, so the mutation\n' +
      `would not blank anything. Update ANCHOR in ${path.relative(root, import.meta.filename)}.`,
  );
  process.exit(2);
}

let smokePassed = false;
try {
  writeFileSync(target, original.replace(ANCHOR, MUTATION + ANCHOR));
  console.log('Blanked the zone geometry; rebuilding and running the suite...');
  try {
    run('npm', ['run', 'smoke'], { stdio: 'inherit' });
    smokePassed = true;
  } catch {
    smokePassed = false;
  }
} finally {
  writeFileSync(target, original);
  // Rebuilding is part of restoring. Putting the source back while `dist` still
  // holds the blanked bundle leaves a build that any later `playwright test`
  // would run against, and it would fail for a reason that no longer exists in
  // the tree - the worst kind of confusing.
  console.log('Restored the zone geometry; rebuilding the client...');
  try {
    run('npm', ['run', 'build', '--workspace', '@alderfell/client']);
    console.log('Rebuilt.');
  } catch {
    console.error(
      'WARNING: the client failed to rebuild after restoring. The source is back,\n' +
        'but dist still holds the blanked build. Run `npm run build` before trusting a smoke run.',
    );
  }
}

if (smokePassed) {
  console.error(
    '\nFAIL: the smoke suite passed with the world blanked.\n' +
      'The world check cannot detect a missing world, so a green suite proves nothing.\n' +
      'Fix the check, not this script (see AI_HANDOVER §13.1 criterion 2).',
  );
  process.exit(1);
}

console.log(
  '\nOK: the smoke suite fails when the world is blanked, so a green run means something.',
);
