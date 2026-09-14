/**
 * A small, non-interactive world beacon for the server-confirmed gravestone.
 *
 * It is deliberately procedural: recovery must stay visible even on a cold
 * asset load, and a few simple meshes are cheaper than bundling another model.
 */
import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, RingGeometry } from 'three';
import { heightAt, type Zone } from '@alderfell/shared';

export interface GraveProjection {
  readonly position: { readonly x: number; readonly z: number };
}

export class GravestoneMarker {
  readonly root = new Group();
  private readonly stoneMaterial = new MeshStandardMaterial({ color: '#706a63', roughness: 0.88 });
  private readonly glowMaterial = new MeshStandardMaterial({
    color: '#f4ae4f',
    emissive: '#c86220',
    emissiveIntensity: 0.9,
    roughness: 0.55,
  });
  private readonly stone = new Mesh(new CylinderGeometry(0.28, 0.38, 0.95, 6), this.stoneMaterial);
  private readonly glow = new Mesh(new RingGeometry(0.48, 0.64, 20), this.glowMaterial);

  constructor(private readonly zone: Zone) {
    this.root.name = 'combat-gravestone-marker';
    this.stone.position.y = 0.48;
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.025;
    this.stone.castShadow = true;
    this.stone.receiveShadow = true;
    // Markers explain recovery; they must never hijack a tap-to-walk raycast.
    this.stone.raycast = () => {};
    this.glow.raycast = () => {};
    this.root.add(this.glow, this.stone);
    this.root.visible = false;
  }

  update(grave: GraveProjection | null, nowMs: number): void {
    if (grave === null) {
      this.root.visible = false;
      return;
    }
    this.root.visible = true;
    this.root.position.set(
      grave.position.x,
      heightAt(this.zone.terrain, grave.position),
      grave.position.z,
    );
    const pulse = 1 + Math.sin(nowMs / 240) * 0.12;
    this.glow.scale.setScalar(pulse);
    this.glow.rotation.z = nowMs / 1_800;
  }

  dispose(): void {
    this.stone.geometry.dispose();
    this.glow.geometry.dispose();
    this.stoneMaterial.dispose();
    this.glowMaterial.dispose();
    this.root.clear();
  }
}
