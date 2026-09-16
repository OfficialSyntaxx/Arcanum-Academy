#!/usr/bin/env node
/**
 * Character pipeline: Quaternius source glTF -> small runtime GLBs.
 *
 * The CC0 Quaternius outfits and base bodies ship as engine-grade assets: 2K
 * base colour, normal and ORM maps per outfit, 25k vertices on a ranger. The
 * game's art direction (AI_HANDOVER §6.1) is flat-shaded low poly with colour
 * from a small palette texture, under a 5 MB initial download budget. This
 * script is that grading step: it strips the PBR maps, shrinks the base colour
 * to a 512 px WebP, decimates the mesh, quantizes attributes and writes one
 * self-contained GLB per outfit under `assets/derived/characters/`.
 *
 * All four outfits share the 65-joint Quaternius rig with the Universal
 * Animation Library, so one animation GLB (skeleton + selected clips, no mesh)
 * is emitted alongside them and applied at runtime by bone name.
 *
 * Deterministic and idempotent: run `npm run build:characters` after changing
 * a source asset or the lists below, and commit the outputs.
 */
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  prune,
  quantize,
  resample,
  simplify,
  textureCompress,
  weld,
} from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const outfits = path.join(root, 'assets/quaternius/modular-character-outfits-fantasy/Outfits');
const library = path.join(root, 'assets/quaternius/universal-animation-library-2');
const outDir = path.join(root, 'assets/derived/characters');

/** Outfit files to build, and the runtime name each becomes. */
const CHARACTERS = [
  // [source outfit, runtime name, decimation ratio]. The rangers carry hoods,
  // belts and bracers as separate dense meshes and need a harder cut to sit
  // inside the precache budget beside the peasants.
  ['Male_Peasant', 'peasant-m', 0.45],
  ['Female_Peasant', 'peasant-f', 0.45],
  ['Male_Ranger', 'ranger-m', 0.16],
];

/**
 * Creature GLBs get the same grade: decimated, palette texture shrunk, no
 * PBR maps. Paths are relative to `assets/`; outputs land beside the humans.
 */
const CREATURES = [
  // The wolf source carries every clip twice (with and without the armature
  // prefix); only the intents the creature renderer uses are kept.
  [
    'quaternius/low-poly-animated-animals/wolf.glb',
    'wolf',
    0.5,
    /^AnimalArmature\|(Idle|Walk|Attack|Death|Idle_HitReact_Left)$/,
  ],
  [
    'poly-pizza/armabee-evolved.glb',
    'armabee',
    0.5,
    /Flying_Idle|Fast_Flying|Headbutt|HitReact|Death/,
  ],
  [
    'quaternius/ultimate-monsters/ghost.glb',
    'ghost',
    0.5,
    /Flying_Idle|Fast_Flying|Punch|HitReact|Death/,
  ],
  [
    'quaternius/ultimate-monsters/ghost-skull.glb',
    'ghost-skull',
    0.5,
    /Flying_Idle|Fast_Flying|Punch|HitReact|Death/,
  ],
];

/**
 * Clips kept from the free Universal Animation Library. It has no plain idle
 * or walk, so locomotion is procedural at runtime (see `character-rig.ts`)
 * and only action clips are shipped.
 */
const CLIPS = [
  'Melee_Hook',
  'Sword_Regular_A',
  'Hit_Knockback',
  'TreeChopping_Loop',
  'Farm_Harvest',
  'Consume',
];

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);

function dropAnimations(document, shouldDrop) {
  for (const animation of document.getRoot().listAnimations()) {
    if (!shouldDrop(animation.getName())) continue;
    // Channels and samplers are separate properties; disposing only the
    // animation would leave every discarded clip's keyframes in the buffer.
    for (const channel of animation.listChannels()) channel.dispose();
    for (const sampler of animation.listSamplers()) sampler.dispose();
    animation.dispose();
  }
}

async function buildCharacter(source, name, ratio) {
  return grade(path.join(outfits, `${source}.gltf`), name, ratio, 384);
}

async function buildCreature(source, name, ratio, keepClips) {
  return grade(path.join(root, 'assets', source), name, ratio, 256, keepClips);
}

async function grade(file, name, ratio, textureSize, keepClips = null) {
  const document = await io.read(file);
  const root = document.getRoot();
  if (keepClips !== null) dropAnimations(document, (clip) => !keepClips.test(clip));

  // Flat, palette-led look: base colour only, no normal or ORM maps. Metalness
  // 0 and roughness 1 match every other material in the world.
  for (const material of root.listMaterials()) {
    material.setNormalTexture(null);
    material.setMetallicRoughnessTexture(null);
    material.setOcclusionTexture(null);
    material.setMetallicFactor(0);
    material.setRoughnessFactor(1);
  }

  await MeshoptSimplifier.ready;
  await document.transform(
    dedup(),
    prune(),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.02 }),
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [textureSize, textureSize],
      quality: 78,
    }),
    resample({ tolerance: 1e-3 }),
    quantize(),
    prune(),
  );

  const output = path.join(outDir, `${name}.glb`);
  await io.write(output, document);
  return output;
}

async function buildAnimations() {
  const document = await io.read(path.join(library, 'UAL2_Standard.glb'));
  const root = document.getRoot();
  dropAnimations(document, (clip) => !CLIPS.includes(clip));
  // Finger and leaf bones are invisible at play distance under an orthographic
  // phone camera and account for most of the library's tracks.
  const FINGER = /^(index|middle|pinky|ring|thumb)_|_leaf_/;
  for (const animation of root.listAnimations()) {
    for (const channel of animation.listChannels()) {
      const target = channel.getTargetNode();
      if (target && FINGER.test(target.getName())) channel.dispose();
    }
  }
  // The mannequin mesh is not needed at runtime: clips bind by bone name.
  for (const mesh of root.listMeshes()) mesh.dispose();
  for (const material of root.listMaterials()) material.dispose();
  for (const texture of root.listTextures()) texture.dispose();
  await document.transform(resample({ tolerance: 1e-3 }), dedup(), prune(), quantize());
  const file = path.join(outDir, 'animations.glb');
  await io.write(file, document);
  return file;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const outputs = [];
  for (const [source, name, ratio] of CHARACTERS)
    outputs.push(await buildCharacter(source, name, ratio));
  for (const [source, name, ratio, keepClips] of CREATURES)
    outputs.push(await buildCreature(source, name, ratio, keepClips));
  outputs.push(await buildAnimations());
  let total = 0;
  for (const file of outputs) {
    const { size } = await stat(file);
    total += size;
    console.log(`${path.relative(root, file)}  ${(size / 1024).toFixed(0)} KB`);
  }
  console.log(`total ${(total / 1024).toFixed(0)} KB`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
