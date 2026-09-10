/**
 * Actor rendering pool.
 *
 * Every walking figure is a small low-poly character model: robe, head, hair,
 * arms, and legs. Each body part is an instanced mesh, so the entire crowd is
 * still only a handful of draw calls on a phone.
 *
 * The pool is fixed-capacity and allocated once. Acquiring an actor hands back a
 * slot index; releasing returns it. Nothing is created or destroyed at runtime,
 * so a busy hub never triggers a garbage collection pause.
 */

import {
  CapsuleGeometry,
  Color,
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
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
const HAIR_HEIGHT = 1.76;
const LEG_HEIGHT = 0.52;
const ARM_HEIGHT = 1.22;

/** Presentation-only equipment. Rules still live in the economy service. */
export type ActorTool = 'none' | 'axe' | 'pick' | 'sickle' | 'net';

function hairColour(body: number): number {
  return new Color(body).offsetHSL(0.02, -0.35, -0.28).getHex();
}

export class ActorPool {
  readonly group = new Group();
  private readonly bodies: InstancedMesh;
  private readonly heads: InstancedMesh;
  private readonly hairs: InstancedMesh;
  private readonly leftArms: InstancedMesh;
  private readonly rightArms: InstancedMesh;
  private readonly leftLegs: InstancedMesh;
  private readonly rightLegs: InstancedMesh;
  private readonly toolHandles: InstancedMesh;
  private readonly toolHeads: InstancedMesh;
  private readonly sickles: InstancedMesh;
  private readonly nets: InstancedMesh;
  private readonly free: number[];
  private readonly active: Uint8Array;
  private readonly matrix = new Matrix4();
  private readonly quaternion = new Quaternion();
  private readonly limbQuaternion = new Quaternion();
  private readonly position = new Vector3();
  private readonly scale = new Vector3(1, 1, 1);
  private readonly hidden = new Vector3(0, -1000, 0);
  private readonly colour = new Color();
  private readonly axisY = new Vector3(0, 1, 0);
  private readonly axisX = new Vector3(1, 0, 0);

  constructor(
    readonly capacity: number,
    shadowsEnabled: boolean,
  ) {
    const bodyGeometry = new CapsuleGeometry(0.3, 0.72, 4, 8);
    const headGeometry = new SphereGeometry(0.21, 10, 8);
    const hairGeometry = new SphereGeometry(0.225, 8, 6);
    const limbGeometry = new CapsuleGeometry(0.075, 0.34, 3, 6);
    const legGeometry = new CapsuleGeometry(0.09, 0.38, 3, 6);
    const toolHandleGeometry = new BoxGeometry(0.07, 0.7, 0.07);
    const toolHeadGeometry = new BoxGeometry(0.36, 0.12, 0.1);
    const curvedToolGeometry = new TorusGeometry(0.19, 0.045, 5, 8, Math.PI * 1.3);
    const netGeometry = new TorusGeometry(0.22, 0.035, 5, 8);
    const material = new MeshStandardMaterial({ roughness: 0.78, metalness: 0.02 });

    this.bodies = new InstancedMesh(bodyGeometry, material, capacity);
    this.heads = new InstancedMesh(headGeometry, material.clone(), capacity);
    this.hairs = new InstancedMesh(hairGeometry, material.clone(), capacity);
    this.leftArms = new InstancedMesh(limbGeometry, material.clone(), capacity);
    this.rightArms = new InstancedMesh(limbGeometry, material.clone(), capacity);
    this.leftLegs = new InstancedMesh(legGeometry, material.clone(), capacity);
    this.rightLegs = new InstancedMesh(legGeometry, material.clone(), capacity);
    this.toolHandles = new InstancedMesh(toolHandleGeometry, material.clone(), capacity);
    this.toolHeads = new InstancedMesh(toolHeadGeometry, material.clone(), capacity);
    this.sickles = new InstancedMesh(curvedToolGeometry, material.clone(), capacity);
    this.nets = new InstancedMesh(netGeometry, material.clone(), capacity);
    for (const mesh of [
      this.bodies,
      this.heads,
      this.hairs,
      this.leftArms,
      this.rightArms,
      this.leftLegs,
      this.rightLegs,
      this.toolHandles,
      this.toolHeads,
      this.sickles,
      this.nets,
    ]) {
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
    this.hairs.setColorAt(slot, new Color(hairColour(this.colour.getHex())));
    const clothDark = this.colour.clone().offsetHSL(0, -0.08, -0.18);
    const clothLight = this.colour.clone().offsetHSL(0, -0.05, 0.06);
    this.leftArms.setColorAt(slot, clothLight);
    this.rightArms.setColorAt(slot, clothLight);
    this.leftLegs.setColorAt(slot, clothDark);
    this.rightLegs.setColorAt(slot, clothDark);
    const toolColour = new Color(0x7e8f9b);
    this.toolHandles.setColorAt(slot, new Color(0x7a5232));
    this.toolHeads.setColorAt(slot, toolColour);
    this.sickles.setColorAt(slot, toolColour);
    this.nets.setColorAt(slot, new Color(Palette.verdigris));
    for (const mesh of [
      this.bodies,
      this.heads,
      this.hairs,
      this.leftArms,
      this.rightArms,
      this.leftLegs,
      this.rightLegs,
      this.toolHandles,
      this.toolHeads,
      this.sickles,
      this.nets,
    ]) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    return slot;
  }

  release(slot: number): void {
    if (slot < 0 || slot >= this.capacity || this.active[slot] === 0) return;
    this.active[slot] = 0;
    this.park(slot);
    this.free.push(slot);
  }

  /** Places an actor. `facing` is radians, matching the simulation convention. */
  setTransform(
    slot: number,
    x: number,
    y: number,
    z: number,
    facing: number,
    gait = 0,
    nowMs = 0,
    tool: ActorTool = 'none',
    gathering = false,
  ): void {
    if (slot < 0 || slot >= this.capacity || this.active[slot] === 0) return;
    this.quaternion.setFromAxisAngle(this.axisY, facing);

    this.setPart(this.bodies, slot, x, y + BODY_HEIGHT, z, this.quaternion);
    this.setPart(this.heads, slot, x, y + HEAD_HEIGHT, z, this.quaternion);
    this.setPart(this.hairs, slot, x, y + HAIR_HEIGHT, z - 0.03, this.quaternion, 1, 0.62, 1);

    const stride = Math.sin(nowMs * 0.012 + slot * 0.71) * gait * 0.72;
    const workSwing = gathering ? -0.9 + Math.sin(nowMs * 0.018) * 0.32 : stride;
    this.setLimb(this.leftArms, slot, x, y + ARM_HEIGHT, z, facing, -0.35, -stride);
    this.setLimb(this.rightArms, slot, x, y + ARM_HEIGHT, z, facing, 0.35, workSwing);
    this.setLimb(this.leftLegs, slot, x, y + LEG_HEIGHT, z, facing, -0.13, stride);
    this.setLimb(this.rightLegs, slot, x, y + LEG_HEIGHT, z, facing, 0.13, -stride);
    this.setTool(slot, x, y, z, facing, workSwing, tool);
  }

  /** Uploads this frame's transforms. Call once per frame, after all writes. */
  flush(): void {
    for (const mesh of [
      this.bodies,
      this.heads,
      this.hairs,
      this.leftArms,
      this.rightArms,
      this.leftLegs,
      this.rightLegs,
      this.toolHandles,
      this.toolHeads,
      this.sickles,
      this.nets,
    ])
      mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const mesh of [
      this.bodies,
      this.heads,
      this.hairs,
      this.leftArms,
      this.rightArms,
      this.leftLegs,
      this.rightLegs,
      this.toolHandles,
      this.toolHeads,
      this.sickles,
      this.nets,
    ]) {
      mesh.dispose();
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
    }
    this.group.clear();
  }

  private park(slot: number): void {
    this.matrix.compose(this.hidden, this.quaternion, this.scale);
    for (const mesh of [
      this.bodies,
      this.heads,
      this.hairs,
      this.leftArms,
      this.rightArms,
      this.leftLegs,
      this.rightLegs,
      this.toolHandles,
      this.toolHeads,
      this.sickles,
      this.nets,
    ])
      mesh.setMatrixAt(slot, this.matrix);
  }

  private setPart(
    mesh: InstancedMesh,
    slot: number,
    x: number,
    y: number,
    z: number,
    rotation: Quaternion,
    sx = 1,
    sy = 1,
    sz = 1,
  ) {
    this.position.set(x, y, z);
    this.scale.set(sx, sy, sz);
    this.matrix.compose(this.position, rotation, this.scale);
    mesh.setMatrixAt(slot, this.matrix);
    this.scale.set(1, 1, 1);
  }

  private setLimb(
    mesh: InstancedMesh,
    slot: number,
    x: number,
    y: number,
    z: number,
    facing: number,
    side: number,
    swing: number,
  ) {
    const localX = side * 0.31;
    const worldX = x + Math.cos(facing) * localX;
    const worldZ = z - Math.sin(facing) * localX;
    this.quaternion.setFromAxisAngle(this.axisY, facing);
    this.limbQuaternion.setFromAxisAngle(this.axisX, swing);
    this.quaternion.multiply(this.limbQuaternion);
    this.setPart(mesh, slot, worldX, y, worldZ, this.quaternion);
  }

  /** Renders a light, procedural tool in the actor's right hand. */
  private setTool(
    slot: number,
    x: number,
    y: number,
    z: number,
    facing: number,
    swing: number,
    tool: ActorTool,
  ): void {
    for (const mesh of [this.toolHandles, this.toolHeads, this.sickles, this.nets]) {
      this.matrix.compose(this.hidden, this.quaternion, this.scale);
      mesh.setMatrixAt(slot, this.matrix);
    }
    if (tool === 'none') return;

    const localX = 0.43;
    const handX = x + Math.cos(facing) * localX;
    const handZ = z - Math.sin(facing) * localX;
    this.quaternion.setFromAxisAngle(this.axisY, facing);
    this.limbQuaternion.setFromAxisAngle(this.axisX, swing - 0.18);
    this.quaternion.multiply(this.limbQuaternion);
    this.setPart(this.toolHandles, slot, handX, y + 0.99, handZ, this.quaternion, 0.85, 1, 0.85);

    if (tool === 'net') {
      this.setPart(this.nets, slot, handX, y + 1.31, handZ, this.quaternion);
    } else if (tool === 'sickle') {
      this.setPart(this.sickles, slot, handX, y + 1.28, handZ, this.quaternion);
    } else {
      this.setPart(this.toolHeads, slot, handX, y + 1.32, handZ, this.quaternion);
    }
  }
}
