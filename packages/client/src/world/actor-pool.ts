/**
 * Actor rendering pool.
 *
 * Every walking figure in the courtyard — the player, six named NPCs and the
 * ambient crowd — is drawn from two `InstancedMesh` objects: one for bodies, one
 * for heads. That is two draw calls for the entire population regardless of how
 * many actors the quality tier allows, which is the difference between a phone
 * holding frame rate and not.
 *
 * The pool is fixed-capacity and allocated once. Acquiring an actor hands back a
 * slot index; releasing returns it. Nothing is created or destroyed at runtime,
 * so a busy hub never triggers a garbage collection pause.
 */

import {
  CapsuleGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';

import { Palette } from './palette.js';

/** Robe palettes keyed by an NPC definition's `appearance` field. */
const APPEARANCE: Readonly<Record<string, number>> = {
  'robe.indigo': 0x4a5a8c,
  'robe.slate': 0x55636f,
  'robe.crimson': 0x8c4a4a,
  'coat.umber': 0x7a5c3a,
  'apron.moss': 0x5c7a4a,
  'sash.gilt': Palette.gilt,
  'student.a': 0x63758a,
  'student.b': 0x4f6a72,
  'student.c': 0x6d6a86,
  player: Palette.verdigris,
};

export function appearanceColour(key: string): number {
  return APPEARANCE[key] ?? APPEARANCE['student.a']!;
}

const BODY_HEIGHT = 1.15;
const HEAD_HEIGHT = 1.62;

export class ActorPool {
  readonly group = new Group();
  private readonly bodies: InstancedMesh;
  private readonly heads: InstancedMesh;
  private readonly free: number[];
  private readonly active: Uint8Array;
  private readonly matrix = new Matrix4();
  private readonly quaternion = new Quaternion();
  private readonly position = new Vector3();
  private readonly scale = new Vector3(1, 1, 1);
  private readonly hidden = new Vector3(0, -1000, 0);
  private readonly colour = new Color();

  constructor(
    readonly capacity: number,
    shadowsEnabled: boolean,
  ) {
    const bodyGeometry = new CapsuleGeometry(0.28, 0.72, 4, 8);
    const headGeometry = new SphereGeometry(0.21, 10, 8);
    const material = new MeshStandardMaterial({ roughness: 0.78, metalness: 0.02 });

    this.bodies = new InstancedMesh(bodyGeometry, material, capacity);
    this.heads = new InstancedMesh(headGeometry, material.clone(), capacity);
    for (const mesh of [this.bodies, this.heads]) {
      mesh.castShadow = shadowsEnabled;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }

    this.free = Array.from({ length: capacity }, (_, i) => capacity - 1 - i);
    this.active = new Uint8Array(capacity);

    // Park every slot below the floor so an unacquired instance is never a
    // figure standing at the world origin.
    for (let i = 0; i < capacity; i += 1) this.park(i);
    this.flush();
  }

  get inUse(): number {
    return this.capacity - this.free.length;
  }

  /** @returns a slot index, or -1 when the pool is exhausted. */
  acquire(appearance: string): number {
    const slot = this.free.pop();
    if (slot === undefined) return -1;
    this.active[slot] = 1;
    this.colour.setHex(appearanceColour(appearance));
    this.bodies.setColorAt(slot, this.colour);
    this.heads.setColorAt(slot, this.colour.clone().offsetHSL(0, -0.15, 0.12));
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    if (this.heads.instanceColor) this.heads.instanceColor.needsUpdate = true;
    return slot;
  }

  release(slot: number): void {
    if (slot < 0 || slot >= this.capacity || this.active[slot] === 0) return;
    this.active[slot] = 0;
    this.park(slot);
    this.free.push(slot);
  }

  /** Places an actor. `facing` is radians, matching the simulation convention. */
  setTransform(slot: number, x: number, y: number, z: number, facing: number): void {
    if (slot < 0 || slot >= this.capacity || this.active[slot] === 0) return;
    this.quaternion.setFromAxisAngle(new Vector3(0, 1, 0), facing);

    this.position.set(x, y + BODY_HEIGHT, z);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.bodies.setMatrixAt(slot, this.matrix);

    this.position.set(x, y + HEAD_HEIGHT, z);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.heads.setMatrixAt(slot, this.matrix);
  }

  /** Uploads this frame's transforms. Call once per frame, after all writes. */
  flush(): void {
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const mesh of [this.bodies, this.heads]) {
      mesh.dispose();
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
    }
    this.group.clear();
  }

  private park(slot: number): void {
    this.matrix.compose(this.hidden, this.quaternion, this.scale);
    this.bodies.setMatrixAt(slot, this.matrix);
    this.heads.setMatrixAt(slot, this.matrix);
  }
}
