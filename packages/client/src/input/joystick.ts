/**
 * Virtual joystick.
 *
 * A pure state machine over pointer positions — no DOM, no React — so the
 * control can be unit tested and so the same logic can later back a gamepad or a
 * keyboard without rewriting the movement path.
 *
 * The stick is *floating*: it appears wherever the thumb lands inside its zone
 * rather than at a fixed spot. Fixed sticks require players to look at their
 * hands. A floating stick with a generous zone lets a player drive the avatar
 * while watching the world, which is the whole point of a hub.
 */

export interface JoystickVector {
  /** -1..1, right positive. */
  readonly x: number;
  /** -1..1, up-screen positive. */
  readonly y: number;
  readonly magnitude: number;
}

export interface JoystickVisual {
  readonly active: boolean;
  /** Client coordinates of the stick base, in pixels. */
  readonly originX: number;
  readonly originY: number;
  /** Knob offset from the base, already clamped to the radius. */
  readonly knobX: number;
  readonly knobY: number;
}

const NEUTRAL: JoystickVector = { x: 0, y: 0, magnitude: 0 };

export class Joystick {
  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private currentX = 0;
  private currentY = 0;

  /**
   * @param radius pixels of travel for full deflection.
   * @param deadZone fraction of the radius ignored, which stops a resting thumb
   *        from nudging the avatar into a wall.
   */
  constructor(
    private readonly radius = 56,
    private readonly deadZone = 0.12,
  ) {}

  get isActive(): boolean {
    return this.pointerId !== null;
  }

  press(pointerId: number, clientX: number, clientY: number): void {
    if (this.pointerId !== null) return;
    this.pointerId = pointerId;
    this.originX = clientX;
    this.originY = clientY;
    this.currentX = clientX;
    this.currentY = clientY;
  }

  move(pointerId: number, clientX: number, clientY: number): void {
    if (this.pointerId !== pointerId) return;
    this.currentX = clientX;
    this.currentY = clientY;

    // Drag beyond the radius and the base follows the thumb. Without this, a
    // long drag pins the stick at full deflection in a direction the player has
    // since stopped pointing.
    const dx = this.currentX - this.originX;
    const dy = this.currentY - this.originY;
    const distance = Math.hypot(dx, dy);
    if (distance > this.radius) {
      const excess = distance - this.radius;
      this.originX += (dx / distance) * excess;
      this.originY += (dy / distance) * excess;
    }
  }

  release(pointerId: number): void {
    if (this.pointerId !== pointerId) return;
    this.pointerId = null;
  }

  /** Cancels regardless of pointer, for use when the page loses focus. */
  reset(): void {
    this.pointerId = null;
  }

  read(): JoystickVector {
    if (this.pointerId === null) return NEUTRAL;
    const dx = this.currentX - this.originX;
    // Screen Y grows downward; the vector is expressed with up positive.
    const dy = this.originY - this.currentY;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) return NEUTRAL;

    const normalised = Math.min(1, distance / this.radius);
    if (normalised <= this.deadZone) return NEUTRAL;
    // Rescale past the dead zone so the first responsive pixel gives a small
    // input rather than jumping straight to the dead-zone magnitude.
    const magnitude = (normalised - this.deadZone) / (1 - this.deadZone);
    return { x: (dx / distance) * magnitude, y: (dy / distance) * magnitude, magnitude };
  }

  visual(): JoystickVisual {
    if (this.pointerId === null) {
      return { active: false, originX: 0, originY: 0, knobX: 0, knobY: 0 };
    }
    const dx = this.currentX - this.originX;
    const dy = this.currentY - this.originY;
    const distance = Math.hypot(dx, dy);
    const scale = distance > this.radius ? this.radius / distance : 1;
    return {
      active: true,
      originX: this.originX,
      originY: this.originY,
      knobX: dx * scale,
      knobY: dy * scale,
    };
  }
}
