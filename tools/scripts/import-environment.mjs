import { copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Port of Oakenfall's extract-to-local-assets pattern. This donor already has
// external GLBs, so no base64 scanner or runtime URL rewrite is necessary.
const donor = process.argv[2];
if (!donor)
  throw new Error(
    'Usage: node tools/scripts/import-environment.mjs /path/to/arcane-legends-academy',
  );
const output = resolve('packages/client/public/assets/environment');
mkdirSync(output, { recursive: true });
for (const [source, target] of [
  ['kaykit_tree', 'tree'],
  ['kaykit_rock', 'rock'],
  ['hex_home_A', 'home'],
]) {
  const input = resolve(donor, 'public/assets/models', `${source}.glb`);
  const bytes = readFileSync(input);
  if (bytes.length > 500_000 || bytes.readUInt32LE(0) !== 0x46546c67)
    throw new Error(`Invalid model: ${source}`);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString());
  if (json.buffers.some((buffer) => buffer.uri) || json.images?.some((image) => image.uri)) {
    throw new Error(`External runtime dependency in ${source}`);
  }
  copyFileSync(input, resolve(output, `${target}.glb`));
  console.info(`${source} → ${target}: ${bytes.length} bytes`);
}
const decoderOutput = resolve('packages/client/public/assets/draco');
mkdirSync(decoderOutput, { recursive: true });
for (const name of ['draco_wasm_wrapper.js', 'draco_decoder.wasm']) {
  copyFileSync(
    resolve('node_modules/three/examples/jsm/libs/draco/gltf', name),
    resolve(decoderOutput, name),
  );
}
