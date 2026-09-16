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
  mergeDocuments,
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
const bodies = path.join(root, 'assets/quaternius/universal-base-characters');
const library = path.join(root, 'assets/quaternius/universal-animation-library-2');
const outDir = path.join(root, 'assets/derived/characters');

/** Outfit files to build, and the runtime name each becomes. */
const CHARACTERS = [
  // [source outfit, runtime name, decimation ratio, base body for the head].
  // Outfits are clothes only; a bare-headed outfit borrows its head, hair and
  // eyes from the matching base body. The rangers wear hoods and carry belts
  // and bracers as separate dense meshes, so they need a harder cut to sit
  // inside the precache budget beside the peasants.
  ['Male_Peasant', 'peasant-m', 0.45, 'Superhero_Male_FullBody'],
  ['Female_Peasant', 'peasant-f', 0.45, 'Superhero_Female_FullBody'],
  ['Male_Ranger', 'ranger-m', 0.16, null],
];

/** Bind-pose height (metres) above which base-body skin counts as the head and neck. */
const NECK_HEIGHT = 1.47;

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

async function buildCharacter(source, name, ratio, body) {
  return grade(path.join(outfits, `${source}.gltf`), name, ratio, 384, null, body);
}

/**
 * Copies the head from a base body into an outfit document.
 *
 * Both share the same 65-joint skeleton in the same joint order (checked), so
 * the head's skin indices are valid against the outfit's skin as they are.
 * The body skin mesh is cropped to triangles wholly above the neck; hair and
 * eyes come across whole.
 */
async function attachHead(document, body) {
  const base = await io.read(path.join(bodies, `${body}.gltf`));
  const outfitSkin = document.getRoot().listSkins()[0];
  const baseSkin = base.getRoot().listSkins()[0];
  const names = (skin) => skin.listJoints().map((joint) => joint.getName());
  if (JSON.stringify(names(outfitSkin)) !== JSON.stringify(names(baseSkin)))
    throw new Error(`${body}: joint order differs from the outfit skeleton`);

  for (const mesh of base.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const isSkin = primitive.getMaterial()?.getName().startsWith('MI_Superhero');
      if (isSkin) cropAboveHeight(primitive, NECK_HEIGHT);
    }
  }

  mergeDocuments(document, base);
  const merged = document;
  const root = merged.getRoot();
  const [outfitScene, baseScene] = root.listScenes();
  const skinInOutfit = root.listSkins()[0];
  const baseNodes = [];
  baseScene.traverse((node) => baseNodes.push(node));
  for (const node of baseNodes) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const head = merged.createNode(`head:${mesh.getName()}`).setMesh(mesh).setSkin(skinInOutfit);
    outfitScene.addChild(head);
  }
  for (const node of baseNodes) node.dispose();
  for (const skin of root.listSkins()) if (skin !== skinInOutfit) skin.dispose();
  baseScene.dispose();
  // Merging brings the base body's buffer along; a GLB may carry only one.
  const [buffer, ...extra] = root.listBuffers();
  for (const accessor of root.listAccessors()) accessor.setBuffer(buffer);
  for (const stray of extra) stray.dispose();
  return merged;
}

/** Keeps only the triangles whose three vertices sit above `height`, compacting attributes. */
function cropAboveHeight(primitive, height) {
  const position = primitive.getAttribute('POSITION');
  const indices = primitive.getIndices();
  const y = new Float32Array(position.getCount());
  const element = [0, 0, 0];
  for (let i = 0; i < position.getCount(); i += 1) y[i] = position.getElement(i, element)[1];
  const oldIndex = indices.getArray();
  const kept = [];
  for (let t = 0; t < oldIndex.length; t += 3) {
    const [a, b, c] = [oldIndex[t], oldIndex[t + 1], oldIndex[t + 2]];
    if (y[a] > height && y[b] > height && y[c] > height) kept.push(a, b, c);
  }
  const remap = new Map();
  const order = [];
  for (const index of kept) {
    if (!remap.has(index)) {
      remap.set(index, order.length);
      order.push(index);
    }
  }
  for (const semantic of primitive.listSemantics()) {
    const source = primitive.getAttribute(semantic);
    const size = source.getElementSize();
    const out = new Float32Array(order.length * size);
    const scratch = new Array(size).fill(0);
    order.forEach((from, to) => {
      source.getElement(from, scratch);
      out.set(scratch, to * size);
    });
    const target = source.clone().setArray(out).setNormalized(false);
    primitive.setAttribute(semantic, target);
  }
  const newIndices = new Uint32Array(kept.map((index) => remap.get(index)));
  primitive.setIndices(indices.clone().setArray(newIndices));
}

async function buildCreature(source, name, ratio, keepClips) {
  return grade(path.join(root, 'assets', source), name, ratio, 256, keepClips);
}

async function grade(file, name, ratio, textureSize, keepClips = null, body = null) {
  let document = await io.read(file);
  if (body !== null) document = await attachHead(document, body);
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
  for (const [source, name, ratio, body] of CHARACTERS)
    outputs.push(await buildCharacter(source, name, ratio, body));
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
