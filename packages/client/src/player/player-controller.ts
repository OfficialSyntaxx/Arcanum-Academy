/**
 * Player controller.
 *
 * Translates intent — a stick vector, a tap on the ground — into locomotion, and
 * owns the player's mover. Two control schemes coexist rather than one being
 * chosen at build time, because they suit different moments: the stick for
 * moving around a crowd, tap-to-move for crossing the courtyard to a stall
 * without holding a thumb down for ten seconds.
 *
 * They are mutually exclusive in the obvious way: touching the stick abandons a
 * tapped destination, since a player reaching for the stick has changed their
 * mind. Getting this wrong produces the single most complained-about bug in
 * mobile hub games, where the avatar fights the player for control.
 */

import {
  createMover,
  followPath,
  isMoving,
  setPath,
  steer,
  type LocomotionParams,
  type Mover,
} from '@arcanum/sim';
import type { Vec2, WaypointId } from '@arcanum/shared';

import type { WorldService } from '../world/world-service.js';

export interface PlayerControllerOptions {
  readonly world: WorldService;
  readonly walkSpeed: number;
  readonly runSpeed: number;
  readonly turnRate: number;
  readonly arrivalRadius: number;
}

export class PlayerController {
  private mover: Mover;
  private readonly params: LocomotionParams;

  constructor(private readonly options: PlayerControllerOptions) {
    const spawn = options.world.graph.nodes[options.world.graph.indexOf(options.world.zone.spawn)];
    this.mover = createMover(spawn?.position ?? { x: 0, z: 0 }, 0);
    this.params = {
      speed: options.runSpeed,
      turnRate: options.turnRate,
      arrivalRadius: options.arrivalRadius,
    };
  }

  get position(): Vec2 {
    return this.mover.position;
  }

  get facing(): number {
    return this.mover.facing;
  }

  /** Ground height under the player, for placing the mesh and the camera focus. */
  get elevation(): number {
    return this.options.world.heightAt(this.mover.position);
  }

  /** 0 when still, 1 at full run. Drives the walk-cycle blend. */
  get gait(): number {
    return Math.min(1, this.mover.velocity / this.options.runSpeed);
  }

  get isTravelling(): boolean {
    return isMoving(this.mover);
  }

  /**
   * Routes the player to an arbitrary world point via the navigation graph.
   *
   * The tapped point is appended after the final graph node so the player walks
   * the last metre to exactly where they tapped rather than stopping on a
   * waypoint centre — the difference between feeling responsive and feeling
   * like the world is on rails.
   */
  moveTo(destination: Vec2): void {
    const path = this.options.world.pathfinder.between(this.mover.position, destination);
    if (path.length === 0) return;
    this.mover = setPath(this.mover, [...path, destination], this.params.arrivalRadius);
  }

  /** Routes to an interactable's approach waypoint and adopts its facing. */
  approach(waypointId: string): boolean {
    const index = this.options.world.graph.indexOf(waypointId as WaypointId);
    if (index < 0) return false;
    const node = this.options.world.graph.nodes[index]!;
    this.moveTo(node.position);
    return true;
  }

  cancelTravel(): void {
    this.mover = { ...this.mover, path: [], pathIndex: 0, velocity: 0 };
  }

  /**
   * Applies one step of stick input.
   *
   * `stickX`/`stickY` are screen-space: +Y is up on the screen, which is away
   * from the camera. They are rotated into world space by the camera's yaw so
   * that "up" always means "away", regardless of which way the camera faces.
   */
  step(stickX: number, stickY: number, cameraYaw: number, dtSeconds: number): void {
    const magnitude = Math.hypot(stickX, stickY);
    if (magnitude >= 0.05) {
      const sin = Math.sin(cameraYaw);
      const cos = Math.cos(cameraYaw);
      // Forward on screen is the camera's forward projected onto the ground.
      const worldX = -(stickY * sin) + stickX * cos;
      const worldZ = -(stickY * cos) - stickX * sin;
      // A light touch walks, a firm one runs; the stick is analogue, not a
      // digital pad, which is what makes crowded spaces navigable.
      const speed =
        magnitude < 0.65
          ? this.options.walkSpeed
          : this.options.walkSpeed + (this.options.runSpeed - this.options.walkSpeed);
      this.mover = steer(
        this.mover,
        worldX,
        worldZ,
        { ...this.params, speed },
        dtSeconds,
        this.options.world.zone.bounds,
      );
      return;
    }

    this.mover = followPath(this.mover, this.params, dtSeconds);
  }
}
