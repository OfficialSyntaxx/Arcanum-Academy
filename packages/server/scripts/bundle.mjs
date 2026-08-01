#!/usr/bin/env node
/**
 * Bundles the server into a single ESM file.
 *
 * Why bundle a server at all: the workspace is configured for
 * `moduleResolution: "Bundler"`, and `@arcanum/shared` and `@arcanum/sim`
 * publish TypeScript source rather than compiled JavaScript. Node cannot
 * resolve that at runtime - it does not rewrite the `.js` specifiers the
 * NodeNext convention requires into the `.ts` files that actually exist. The
 * client already goes through Vite; this gives the server the same treatment
 * instead of forcing a different module strategy on half the monorepo.
 *
 * Two useful consequences: the deployed artifact is one file, so cold starts
 * on a free instance are fast, and production runs plain JavaScript with no
 * experimental loader flags.
 *
 * Runtime dependencies stay external. They are installed from the lockfile,
 * and inlining Fastify in particular would be slower to build and no faster
 * to boot.
 */

import { build, context } from 'esbuild';
import { spawn } from 'node:child_process';

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/index.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  logLevel: 'info',
  external: ['fastify', 'ws', 'zod'],
};

if (!watch) {
  await build(options);
} else {
  /** @type {import('node:child_process').ChildProcess | null} */
  let child = null;

  const restart = () => {
    if (child !== null) child.kill();
    child = spawn(process.execPath, ['--enable-source-maps', 'dist/server.js'], {
      stdio: 'inherit',
    });
  };

  const ctx = await context({
    ...options,
    plugins: [
      {
        name: 'restart-on-rebuild',
        setup(builder) {
          // Only restart on a clean build: restarting into a broken bundle
          // replaces a useful compiler error with a confusing runtime one.
          builder.onEnd((result) => {
            if (result.errors.length === 0) restart();
          });
        },
      },
    ],
  });

  await ctx.watch();

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (child !== null) child.kill();
      void ctx.dispose().then(() => process.exit(0));
    });
  }
}
