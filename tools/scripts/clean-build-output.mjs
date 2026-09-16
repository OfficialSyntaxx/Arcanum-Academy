#!/usr/bin/env node
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

const packageName = process.argv[2];
if (packageName !== 'client' && packageName !== 'admin') {
  throw new Error('Expected the exact generated package name: client or admin.');
}

const root = new URL('../..', import.meta.url).pathname;
const target = join(root, 'packages', packageName, 'dist');
await rm(target, { recursive: true, force: true });
