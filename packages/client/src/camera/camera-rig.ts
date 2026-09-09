/**
 * The follow camera.
 *
 * An **orthographic** yaw/pitch rig that trails the player. Orthographic rather
 * than perspective is the whole visual identity: parallel lines stay parallel,
 * so the world reads as a stylised diorama rather than a cinematic scene, and a
 * hut at the far edge of the zone is drawn at the same scale as the one under
 * the player's feet. It is also what makes low-poly assets from different free
 * packs sit together, because nothing is distorted by a wide field of view.
 *
 * Four properties matter more than realism on a phone:
 *
 * - **Yaw is free, pitch is not.** The player can spin all the way round to see
 *   behind terrain and line up a tap, but pitch is clamped to a shallow band.
 *   That band is an art budget: roofs are never seen from above and nothing is
 *   ever seen from below, so neither needs to be modelled well.
 * - **Nothing is instantaneous.** Position and orientation are exponentially
 *   smoothed with a frame-rate-independent factor, so the camera feels the same
 *   at 30fps and 60fps rather than snapping on a fast device.
 * - **Zoom changes the frustum, not the distance.** Under orthographic
 *   projection, moving the camera closer changes nothing on screen. `viewSize`
 *   is the half-extent of the visible world along the shorter screen axis, and
 *   it is the only thing that makes the world bigger or smaller.
 * - **Framing is a first-class operation.** Composing a shot - a quest beat, a
 *   boss entrance - retargets the rig and lets the same smoothing carry it
 *   there, so a scripted moment needs no cut and no loading screen.
 */

import { MathUtils, type OrthographicCamera, Vector3 } from 'three';

export interface CameraRigOptions {
  /**
   * Half-extent of the visible world along the **shorter** screen axis, in
   * metres, at the default zoom.
   *
   * The orthographic equivalent of follow distance: this is what decides how
   * much of the world fits on screen. Measuring it on the short axis is what
   * keeps portrait and landscape at the same scale.
   */
  readonly viewSize: number;
  readonly minViewSize: number;
  readonly maxViewSize: number;
  /**
   * How far back the camera sits along its view direction.
   *
   * Under orthographic projection this does not affect apparent size at all; it
   * only has to be far enough that the near plane never clips terrain between
   * the camera and its focus. Treated as a constant, never as a zoom control.
   */
  readonly boomLength: number;
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
  private pitch = 0.72;
  private viewSize: number;
  private aspect = 1;
  private readonly focus = new Vector3();
  private readonly desiredFocus = new Vector3();
  private readonly desiredPosition = new Vector3();
  /** Set while a framing shot is active; cleared when the player takes over. */
  private framedYaw: number | null = null;

  constructor(
    private readonly camera: OrthographicCamera,
    private readonly options: CameraRigOptions,
  ) {
    this.viewSize = options.viewSize;
    this.applyProjection();
  }

  get orbitYaw(): number {
    return this.yaw;
  }

  /** Half-extent of the visible world along the shorter screen axis, in metres. */
  get zoom(): number {
    return this.viewSize;
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

  /**
   * Pinch-to-zoom. `scale` above 1 shows less world, which reads as zooming in.
   *
   * Dividing rather than multiplying keeps the gesture direction identical to
   * the perspective rig this replaced, so the control feels unchanged even
   * though the mechanism is entirely different.
   */
  zoomBy(scale: number): void {
    this.viewSize = MathUtils.clamp(
      this.viewSize / Math.max(0.01, scale),
      this.options.minViewSize,
      this.options.maxViewSize,
    );
    this.applyProjection();
  }

  /**
   * Tells the rig the drawing surface changed shape.
   *
   * `viewSize` is the half-extent of the **shorter** screen axis, and the
   * longer axis follows from the aspect ratio. This matters more than it
   * sounds: holding the half-*height* constant instead gives a portrait phone a
   * horizontal window of only `viewSize x aspect` - about five metres on a
   * 390x844 screen - so the player stands in the middle of a slit and sees
   * nothing but the ground they are standing on. Sizing by the short axis keeps
   * the scale identical in both orientations and turning the phone reveals more
   * world rather than changing how big everything is.
   */
  setViewport(width: number, height: number): void {
    this.aspect = height > 0 ? width / height : 1;
    this.applyProjection();
  }

  /** Composes a shot: look at the focus from a fixed angle and zoom. */
  frame(yaw: number, pitch: number, viewSize: number): void {
    this.framedYaw = yaw;
    this.yaw = yaw;
    this.pitch = MathUtils.clamp(pitch, this.options.minPitch, this.options.maxPitch);
    this.viewSize = MathUtils.clamp(viewSize, this.options.minViewSize, this.options.maxViewSize);
    this.applyProjection();
  }

  /** Returns control to the player and eases back to the default zoom. */
  release(): void {
    this.framedYaw = null;
    this.viewSize = this.options.viewSize;
    this.applyProjection();
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

  private applyProjection(): void {
    // viewSize is the half-extent of the shorter axis; the longer one follows.
    const halfWidth = this.aspect >= 1 ? this.viewSize * this.aspect : this.viewSize;
    const halfHeight = this.aspect >= 1 ? this.viewSize : this.viewSize / this.aspect;
    this.camera.left = -halfWidth;
    this.camera.right = halfWidth;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
  }

  private computeDesiredPosition(): void {
    const horizontal = Math.cos(this.pitch) * this.options.boomLength;
    this.desiredPosition.set(
      this.focus.x + Math.sin(this.yaw) * horizontal,
      this.focus.y + Math.sin(this.pitch) * this.options.boomLength,
      this.focus.z + Math.cos(this.yaw) * horizontal,
    );
  }
}
