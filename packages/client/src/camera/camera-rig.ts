/**
 * The follow camera.
 *
 * A yaw/pitch/distance orbit rig that trails the player. Three properties matter
 * more than realism on a phone:
 *
 * - **Nothing is instantaneous.** Position and orientation are exponentially
 *   smoothed with a frame-rate-independent factor, so the camera feels the same
 *   at 30fps and 60fps rather than snapping on a fast device.
 * - **Pitch is clamped well away from the horizon and the zenith.** A camera that
 *   can look at the sky or under the floor is a camera a player will
 *   accidentally break while dragging with a thumb.
 * - **Framing is a first-class operation.** Walking up to a duel circle needs the
 *   camera to compose a shot, not to cut. `frame()` retargets the rig and lets
 *   the same smoothing carry it there, which is why the duel transition in
 *   Phase 5 needs no loading screen.
 */

import { MathUtils, type PerspectiveCamera, Vector3 } from 'three';

export interface CameraRigOptions {
  readonly followDistance: number;
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly height: number;
  /** Fraction of the remaining gap closed per second. */
  readonly smoothing: number;
  readonly minPitch: number;
  readonly maxPitch: number;
}

export interface CameraTarget {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export class CameraRig {
  private yaw = Math.PI;
  private pitch = 0.62;
  private distance: number;
  private readonly focus = new Vector3();
  private readonly desiredFocus = new Vector3();
  private readonly desiredPosition = new Vector3();
  /** Set while a framing shot is active; cleared when the player takes over. */
  private framedYaw: number | null = null;

  constructor(
    private readonly camera: PerspectiveCamera,
    private readonly options: CameraRigOptions,
  ) {
    this.distance = options.followDistance;
  }

  get orbitYaw(): number {
    return this.yaw;
  }

  get zoom(): number {
    return this.distance;
  }

  /** Drag-to-orbit, in radians. Cancels any active framing shot. */
  orbit(deltaYaw: number, deltaPitch: number): void {
    this.framedYaw = null;
    this.yaw += deltaYaw;
    this.pitch = MathUtils.clamp(
      this.pitch + deltaPitch,
      this.options.minPitch,
      this.options.maxPitch,
    );
  }

  /** Pinch-to-zoom. `scale` above 1 pulls the camera in. */
  zoomBy(scale: number): void {
    this.distance = MathUtils.clamp(
      this.distance / Math.max(0.01, scale),
      this.options.minDistance,
      this.options.maxDistance,
    );
  }

  /** Composes a shot: look at `target` from a fixed angle and distance. */
  frame(yaw: number, pitch: number, distance: number): void {
    this.framedYaw = yaw;
    this.yaw = yaw;
    this.pitch = MathUtils.clamp(pitch, this.options.minPitch, this.options.maxPitch);
    this.distance = MathUtils.clamp(distance, this.options.minDistance, this.options.maxDistance);
  }

  /** Returns control to the player and eases back to the follow distance. */
  release(): void {
    this.framedYaw = null;
    this.distance = this.options.followDistance;
  }

  get isFramed(): boolean {
    return this.framedYaw !== null;
  }

  /** Snaps the rig onto a target with no interpolation; used on zone entry. */
  snapTo(target: CameraTarget): void {
    this.desiredFocus.set(target.x, target.y + this.options.height * 0.35, target.z);
    this.focus.copy(this.desiredFocus);
    this.computeDesiredPosition();
    this.camera.position.copy(this.desiredPosition);
    this.camera.lookAt(this.focus);
  }

  update(target: CameraTarget, dtSeconds: number): void {
    this.desiredFocus.set(target.x, target.y + this.options.height * 0.35, target.z);
    // Exponential smoothing expressed per second rather than per frame, so the
    // feel does not change with the device's frame rate.
    const alpha = 1 - Math.exp(-this.options.smoothing * dtSeconds);
    this.focus.lerp(this.desiredFocus, alpha);
    this.computeDesiredPosition();
    this.camera.position.lerp(this.desiredPosition, alpha);
    this.camera.lookAt(this.focus);
  }

  private computeDesiredPosition(): void {
    const horizontal = Math.cos(this.pitch) * this.distance;
    this.desiredPosition.set(
      this.focus.x + Math.sin(this.yaw) * horizontal,
      this.focus.y + Math.sin(this.pitch) * this.distance,
      this.focus.z + Math.cos(this.yaw) * horizontal,
    );
  }
}
