#!/usr/bin/env node
/**
 * Architecture boundary linter.
 *
 * Layering that is only written down in a document decays within a month. This
 * script makes the layering executable: it walks every source file, extracts its
 * imports, and fails the build when a module reaches somewhere it should not.
 *
 * Two rule sets:
 *
 * 1. Package rules - which workspace packages and which third-party runtimes a
 *    package may depend on. This is what keeps `@alderfell/sim` headless, so the
 *    same simulation runs on the server and in the browser.
 * 2. Layer rules - inside a package, which directories may import which. This is
 *    what keeps rendering out of game logic and the network out of the UI.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('../..', import.meta.url).pathname;

/** Third-party imports each package is forbidden from touching. */
const FORBIDDEN_RUNTIME = {
  shared: ['three', 'react', 'react-dom', 'zustand', 'fastify', 'ws'],
  sim: ['three', 'react', 'react-dom', 'zustand', 'fastify', 'ws'],
  server: ['three', 'react', 'react-dom', 'zustand'],
  client: ['fastify', 'ws'],
};

/** Workspace packages each package may import. */
const ALLOWED_WORKSPACE = {
  shared: [],
  sim: ['@alderfell/shared'],
  server: ['@alderfell/shared', '@alderfell/sim'],
  client: ['@alderfell/shared', '@alderfell/sim'],
};

/**
 * Layer rules, per package. A layer may import itself and anything listed.
 * `__tests__` is exempt: tests legitimately reach across layers to assert.
 */
/**
 * Imports a specific layer may never make, whatever the package rules allow.
 *
 * Currently empty, and deliberately kept rather than deleted.
 *
 * This previously enforced ADR-0004 - the card duel resolver could not import
 * `CardInstance` or `SlabSerial`, so a card's grade could never become
 * mechanically relevant. The card game is cut, so the rule now guards a module
 * and two symbols that no longer exist. Replacing it with an invented rule
 * would be worse than leaving it empty: a linter that enforces something
 * nobody decided teaches the next reader to ignore it.
 *
 * The mechanism below is intact and matters, including its handling of
 * type-only imports. The next real subject for it is the tick-based combat
 * resolver at G3: when `sim/combat` returns it must not import anything
 * presentational or provenance-shaped, for the same reason ADR-0004 existed -
 * "the resolver cannot see it" is a rule; "the resolver does not currently look
 * at it" is a habit.
 */
const FORBIDDEN_SYMBOLS = {};

const LAYERS = {
  client: {
    core: [],
    a11y: [],
    render: ['core'],
    input: ['core'],
    net: ['core'],
    persistence: ['core'],
    world: ['core'],
    camera: [],
    player: ['world'],
    npc: ['world'],
    state: ['core', 'net', 'a11y'],
    ui: ['state', 'core', 'input', 'a11y'],
    screens: ['state', 'ui', 'core', 'input'],
    app: [
      'core',
      'a11y',
      'render',
      'input',
      'net',
      'persistence',
      'state',
      'ui',
      'screens',
      'world',
      'camera',
      'player',
      'npc',
    ],
    styles: [],
  },
  server: {
    config: [],
    session: [],
    persistence: [],
    // Game rules and player state. Depends on persistence because it owns the
    // shape of the opaque blob the repository stores, but knows nothing about
    // sockets, sessions or the wire - so the same rules could be driven by a
    // job or a test without a gateway in sight.
    domain: ['persistence', 'config'],
    net: ['session', 'persistence', 'config', 'domain'],
  },
};

const IMPORT_PATTERN =
  /(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

async function* walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      yield* walk(path);
    } else if (/\.(ts|tsx|mts)$/.test(entry.name)) {
      yield path;
    }
  }
}

function importsOf(source) {
  const found = [];
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = match[1] ?? match[2];
    if (specifier) found.push(specifier);
  }
  return found;
}

/**
 * Named imports in a source file, including type-only ones.
 *
 * Type-only matters: `import type { CardInstance }` compiles away, so a
 * resolver could read a grade through a type and leave no trace at runtime.
 * The rule is about what the code is allowed to know, not what survives to the
 * bundle.
 */
function namedImportsOf(source) {
  const found = [];
  const pattern = /import\s+(?:type\s+)?\{([^}]*)\}\s*from/g;
  for (const match of source.matchAll(pattern)) {
    for (const part of match[1].split(',')) {
      const name = part
        .replace(/^\s*type\s+/, '')
        .split(/\s+as\s+/)[0]
        .trim();
      if (name) found.push(name);
    }
  }
  return found;
}

function layerOf(relativePath) {
  const parts = relativePath.split(sep);
  return parts.length > 1 ? parts[0] : null;
}

/** Resolves a relative import to the layer it lands in, or null if same-layer. */
function targetLayer(fromRelative, specifier) {
  if (!specifier.startsWith('.')) return null;
  const fromParts = fromRelative.split(sep).slice(0, -1);
  for (const segment of specifier.split('/')) {
    if (segment === '.' || segment === '') continue;
    if (segment === '..') fromParts.pop();
    else fromParts.push(segment);
  }
  return fromParts.length > 1 ? fromParts[0] : null;
}

const violations = [];

for (const packageName of Object.keys(ALLOWED_WORKSPACE)) {
  const packageRoot = join(ROOT, 'packages', packageName, 'src');
  for await (const file of walk(packageRoot)) {
    const relativePath = relative(packageRoot, file);
    const isTest = relativePath.includes('__tests__');
    const source = await readFile(file, 'utf8');
    const location = `packages/${packageName}/src/${relativePath}`;

    if (!isTest) {
      const layer = layerOf(relativePath);
      const forbidden = FORBIDDEN_SYMBOLS[`${packageName}/${layer}`];
      if (forbidden) {
        for (const name of namedImportsOf(source)) {
          if (forbidden.includes(name)) {
            violations.push(
              `${location}: "${layer}" may not import ${name} (ADR-0004: grade never affects duel resolution)`,
            );
          }
        }
      }
    }

    for (const specifier of importsOf(source)) {
      const bare = specifier
        .split('/')
        .slice(0, specifier.startsWith('@') ? 2 : 1)
        .join('/');

      if (specifier.startsWith('@alderfell/')) {
        if (!ALLOWED_WORKSPACE[packageName].includes(bare)) {
          violations.push(`${location}: may not import ${bare}`);
        }
        continue;
      }

      if (FORBIDDEN_RUNTIME[packageName].includes(bare)) {
        violations.push(`${location}: forbidden runtime dependency "${bare}"`);
        continue;
      }

      const rules = LAYERS[packageName];
      if (!rules || isTest) continue;
      const from = layerOf(relativePath);
      const to = targetLayer(relativePath, specifier);
      if (!from || !to || from === to) continue;
      if (!rules[from]) {
        violations.push(`${location}: layer "${from}" has no declared rule`);
        continue;
      }
      if (!rules[from].includes(to)) {
        violations.push(`${location}: layer "${from}" may not import layer "${to}"`);
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Architecture boundary violations:\n');
  for (const violation of violations) console.error(`  ${violation}`);
  console.error(`\n${violations.length} violation(s). See docs/ARCHITECTURE.md.`);
  process.exit(1);
}

console.log('Architecture boundaries: OK');
