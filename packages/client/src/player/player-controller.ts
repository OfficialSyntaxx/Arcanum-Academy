/**
 * Player controller.
 *
 * Translates intent — a tap on the ground, an approach to an interactable —
 * into locomotion, and owns the player's mover.
 *
 * **Tap-to-walk is the only control.** There is no virtual joystick. A stick
 * asks a player to hold a thumb on the glass for the whole journey, which
 * covers a quarter of a phone screen with a hand and makes long travel tiring;
 * it also fights tap-to-move for ownership of the avatar, which is the
 * single most complained-about bug in mobile hub games. One scheme cannot
 * fight itself.
 *
 * The camera's yaw is therefore not an input to movement at all: a tap is a
 * world position, and where the camera happens to be pointing does not change
 * where the player asked to go.
 */

import {
  createMover,
  followPath,
  isMoving,
  setPath,
  type LocomotionParams,
  type Mover,
} from '@alderfell/sim';
import type { Vec2, WaypointId } from '@alderfell/shared';

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

  /** The final reachable point of the active route, for world-space feedback. */
  get destination(): Vec2 | null {
    if (!isMoving(this.mover)) return null;
    return this.mover.path[this.mover.path.length - 1] ?? null;
  }

  /**
   * Routes the player to the nearest authored navigation point.
   *
   * The graph is the walkable part of the zone: adding a raw tap point after
   * the route lets an avatar take a final straight-line shortcut through a
   * building, tree, or landmark. Snapping the destination keeps travel on the
   * visible paths and gives level art a reliable physical boundary.
   */
  moveTo(destination: Vec2): void {
    const path = this.options.world.pathfinder.between(this.mover.position, destination);
    if (path.length === 0) return;
    this.mover = setPath(this.mover, path, this.params.arrivalRadius);
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
   * Advances one frame along the current path.
   *
   * The player always runs. There is no stamina and no walk/run distinction to
   * arbitrate: the cost of travel is the distance, which is a decision the zone
   * layout makes, not one the player manages with a bar.
   */
  step(dtSeconds: number): void {
    this.mover = followPath(this.mover, this.params, dtSeconds);
  }
}
