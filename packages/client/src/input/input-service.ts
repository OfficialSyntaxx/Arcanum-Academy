import { EventBus } from '@arcanum/shared';

/**
 * Pointer abstraction.
 *
 * One code path for touch, mouse and pen via Pointer Events. The service reports
 * intent - tap, drag, pinch - rather than raw coordinates, so gameplay code never
 * re-implements gesture detection and the thresholds stay consistent across the
 * hub, the deck builder and the duel board.
 *
 * Thresholds are expressed in CSS pixels and tuned for a thumb, not a mouse: a
 * 10px slop before a press becomes a drag, and a 500ms hold for long press.
 */

export interface PointerSample {
  readonly x: number;
  readonly y: number;
  readonly pointerId: number;
}

export type InputEvents = {
  tap: PointerSample;
  longpress: PointerSample;
  dragstart: PointerSample;
  dragmove: PointerSample & { dx: number; dy: number };
  dragend: PointerSample;
  pinch: { scale: number; centerX: number; centerY: number };
};

export interface InputOptions {
  readonly element: HTMLElement;
  readonly dragThresholdPx?: number;
  readonly longPressMs?: number;
  readonly now?: () => number;
}

interface ActivePointer {
  readonly startX: number;
  readonly startY: number;
  readonly startedAtMs: number;
  x: number;
  y: number;
  dragging: boolean;
  longPressFired: boolean;
}

export class InputService {
  readonly events = new EventBus<InputEvents>();

  private readonly pointers = new Map<number, ActivePointer>();
  private readonly dragThreshold: number;
  private readonly longPressMs: number;
  private readonly now: () => number;
  private longPressTimer: ReturnType<typeof setTimeout> | null = null;
  private pinchStartDistance = 0;

  constructor(private readonly options: InputOptions) {
    this.dragThreshold = options.dragThresholdPx ?? 10;
    this.longPressMs = options.longPressMs ?? 500;
    this.now = options.now ?? (() => performance.now());

    const element = options.element;
    element.addEventListener('pointerdown', this.handleDown);
    element.addEventListener('pointermove', this.handleMove);
    element.addEventListener('pointerup', this.handleUp);
    element.addEventListener('pointercancel', this.handleUp);
    // Suppresses the browser's own pan/zoom so the world can own the gesture.
    element.style.touchAction = 'none';
  }

  dispose(): void {
    const element = this.options.element;
    element.removeEventListener('pointerdown', this.handleDown);
    element.removeEventListener('pointermove', this.handleMove);
    element.removeEventListener('pointerup', this.handleUp);
    element.removeEventListener('pointercancel', this.handleUp);
    if (this.longPressTimer) clearTimeout(this.longPressTimer);
    this.pointers.clear();
    this.events.clear();
  }

  private readonly handleDown = (event: PointerEvent): void => {
    this.options.element.setPointerCapture?.(event.pointerId);
    this.pointers.set(event.pointerId, {
      startX: event.clientX,
      startY: event.clientY,
      startedAtMs: this.now(),
      x: event.clientX,
      y: event.clientY,
      dragging: false,
      longPressFired: false,
    });

    if (this.pointers.size === 2) {
      this.pinchStartDistance = this.pointerDistance();
      if (this.longPressTimer) clearTimeout(this.longPressTimer);
      return;
    }

    this.longPressTimer = setTimeout(() => {
      const pointer = this.pointers.get(event.pointerId);
      if (!pointer || pointer.dragging) return;
      pointer.longPressFired = true;
      this.events.emit('longpress', { x: pointer.x, y: pointer.y, pointerId: event.pointerId });
    }, this.longPressMs);
  };

  private readonly handleMove = (event: PointerEvent): void => {
    const pointer = this.pointers.get(event.pointerId);
    if (!pointer) return;
    const dx = event.clientX - pointer.x;
    const dy = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (this.pointers.size === 2 && this.pinchStartDistance > 0) {
      const distance = this.pointerDistance();
      const [a, b] = [...this.pointers.values()];
      if (a && b) {
        this.events.emit('pinch', {
          scale: distance / this.pinchStartDistance,
          centerX: (a.x + b.x) / 2,
          centerY: (a.y + b.y) / 2,
        });
      }
      return;
    }

    if (!pointer.dragging) {
      const travelled = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY);
      if (travelled < this.dragThreshold) return;
      pointer.dragging = true;
      if (this.longPressTimer) clearTimeout(this.longPressTimer);
      this.events.emit('dragstart', {
        x: pointer.startX,
        y: pointer.startY,
        pointerId: event.pointerId,
      });
    }
    this.events.emit('dragmove', {
      x: pointer.x,
      y: pointer.y,
      pointerId: event.pointerId,
      dx,
      dy,
    });
  };

  private readonly handleUp = (event: PointerEvent): void => {
    const pointer = this.pointers.get(event.pointerId);
    this.pointers.delete(event.pointerId);
    if (this.pointers.size < 2) this.pinchStartDistance = 0;
    if (this.longPressTimer) clearTimeout(this.longPressTimer);
    if (!pointer) return;

    if (pointer.dragging) {
      this.events.emit('dragend', { x: pointer.x, y: pointer.y, pointerId: event.pointerId });
      return;
    }
    if (!pointer.longPressFired) {
      this.events.emit('tap', { x: pointer.x, y: pointer.y, pointerId: event.pointerId });
    }
  };

  private pointerDistance(): number {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}
