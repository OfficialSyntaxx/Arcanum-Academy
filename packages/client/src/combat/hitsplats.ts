/**
 * OSRS-style hitsplats: a number that pops over whoever was struck on the
 * frame the server confirms the exchange, then rises and fades.
 *
 * Sprites are pooled and their canvases redrawn, so a long fight never
 * allocates. A red splat is damage; a blue one is a miss (a zero).
 */
import { CanvasTexture, Group, Sprite, SpriteMaterial } from 'three';

const POOL_SIZE = 8;
const LIFETIME_MS = 750;
const RISE_METRES = 0.55;

interface Splat {
  readonly sprite: Sprite;
  readonly canvas: HTMLCanvasElement;
  readonly texture: CanvasTexture;
  bornAtMs: number;
  baseY: number;
}

export class Hitsplats {
  readonly root = new Group();
  private readonly pool: Splat[] = [];
  private next = 0;

  constructor() {
    this.root.name = 'hitsplats';
    for (let i = 0; i < POOL_SIZE; i += 1) {
      const canvas = document.createElement('canvas');
      canvas.width = 96;
      canvas.height = 96;
      const texture = new CanvasTexture(canvas);
      const sprite = new Sprite(
        new SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
      );
      sprite.scale.set(0.7, 0.7, 1);
      sprite.visible = false;
      sprite.renderOrder = 20;
      sprite.raycast = () => {};
      this.root.add(sprite);
      this.pool.push({ sprite, canvas, texture, bornAtMs: 0, baseY: 0 });
    }
  }

  /** Shows `damage` at a world point. Zero draws the blue miss splat. */
  spawn(x: number, y: number, z: number, damage: number, nowMs: number): void {
    const splat = this.pool[this.next]!;
    this.next = (this.next + 1) % POOL_SIZE;
    const ctx = splat.canvas.getContext('2d');
    if (ctx === null) return;
    ctx.clearRect(0, 0, 96, 96);
    ctx.beginPath();
    ctx.arc(48, 48, 34, 0, Math.PI * 2);
    ctx.fillStyle = damage > 0 ? '#c8361f' : '#2c5f9e';
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.stroke();
    ctx.fillStyle = '#fff6e6';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(damage), 48, 50);
    splat.texture.needsUpdate = true;
    splat.sprite.position.set(x, y, z);
    splat.sprite.visible = true;
    splat.bornAtMs = nowMs;
    splat.baseY = y;
  }

  update(nowMs: number): void {
    for (const splat of this.pool) {
      if (!splat.sprite.visible) continue;
      const t = (nowMs - splat.bornAtMs) / LIFETIME_MS;
      if (t >= 1) {
        splat.sprite.visible = false;
        continue;
      }
      splat.sprite.position.y = splat.baseY + t * RISE_METRES;
      (splat.sprite.material as SpriteMaterial).opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    }
  }

  dispose(): void {
    for (const splat of this.pool) {
      splat.texture.dispose();
      splat.sprite.material.dispose();
    }
    this.root.clear();
  }
}
