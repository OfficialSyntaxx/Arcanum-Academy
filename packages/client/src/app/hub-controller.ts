/**
 * Hub controller.
 *
 * The one place where world, player, camera, NPCs and input are joined together
 * and driven by the frame loop. Every other Phase 2 module is independently
 * testable precisely because this is the only thing that knows about all of
 * them.
 *
 * Two rules keep it honest:
 *
 * - Nothing here mutates React state per frame. Store writes are throttled to
 *   roughly four a second and only happen when a value actually changed, so a
 *   walking player does not trigger sixty re-renders a second.
 * - Nothing here contains rules. Movement, pathing and schedules all live in
 *   `@arcanum/sim` and are deterministic; this file is wiring and presentation.
 */

import {
  COURTYARD,
  InteractableKind,
  type Failure,
  type Result,
  type Tunables,
  err,
  ok,
} from '@arcanum/shared';
import { Raycaster, Vector2, type Vector3 } from 'three';

import {
  applyAccessibility,
  readSystemPreferences,
  type AccessibilityPreferences,
} from '../a11y/preferences.js';
import { CameraRig } from '../camera/camera-rig.js';
import type { QualitySettings } from '../core/device.js';
import { Joystick } from '../input/joystick.js';
import type { InputService } from '../input/input-service.js';
import { NpcDirector } from '../npc/npc-director.js';
import { PlayerController } from '../player/player-controller.js';
import type { RenderService } from '../render/renderer.js';
import { useAppStore, type InteractionPromptState } from '../state/app-store.js';
import { WorldService } from '../world/world-service.js';

const STORE_UPDATE_INTERVAL_MS = 250;

export interface HubControllerOptions {
  readonly render: RenderService;
  readonly input: InputService;
  readonly quality: QualitySettings;
  readonly tunables: Tunables;
  readonly canvas: HTMLCanvasElement;
  readonly now?: () => number;
  /**
   * Called when the player engages a gathering node.
   *
   * The controller reports the interactable rather than sending a command
   * itself: the world layer has no business knowing the wire protocol, and
   * this keeps the hub testable without a socket.
   */
  readonly onEngageGatheringNode?: (interactableId: string) => void;
}

export class HubController {
  readonly joystick = new Joystick();

  private readonly world: WorldService;
  private readonly player: PlayerController;
  private readonly camera: CameraRig;
  private readonly npcs: NpcDirector;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly now: () => number;
  private readonly playerSlot: number;

  private accessibility: AccessibilityPreferences;
  private storeAccumulatorMs = 0;
  private lastPromptId: string | null = null;
  private disposed = false;

  private constructor(
    private readonly options: HubControllerOptions,
    world: WorldService,
  ) {
    this.now = options.now ?? (() => Date.now());
    this.world = world;
    this.accessibility = readSystemPreferences();

    const { world: worldTunables } = options.tunables;
    this.player = new PlayerController({
      world,
      walkSpeed: worldTunables.playerWalkSpeed,
      runSpeed: worldTunables.playerRunSpeed,
      turnRate: worldTunables.playerTurnRate,
      arrivalRadius: worldTunables.waypointArrivalRadius,
    });

    this.camera = new CameraRig(options.render.camera, {
      followDistance: worldTunables.cameraFollowDistance,
      minDistance: worldTunables.cameraMinDistance,
      maxDistance: worldTunables.cameraMaxDistance,
      height: worldTunables.cameraHeight,
      smoothing: worldTunables.cameraSmoothing,
      minPitch: worldTunables.cameraMinPitch,
      maxPitch: worldTunables.cameraMaxPitch,
    });

    this.playerSlot = world.actors.acquire('player');
    this.npcs = new NpcDirector(world, options.tunables, this.now());

    world.attach(options.render.scene);
    this.camera.snapTo({
      x: this.player.position.x,
      y: this.player.elevation,
      z: this.player.position.z,
    });

    this.bindInput();
    useAppStore.getState().setAmbientPopulation(this.npcs.population);
    applyAccessibility(this.accessibility, document.documentElement);
    useAppStore.getState().setAccessibility(this.accessibility);
  }

  static create(options: HubControllerOptions): Result<HubController, Failure> {
    const world = WorldService.load(COURTYARD, options.quality);
    if (!world.ok) return err(world.error);
    return ok(new HubController(options, world.value));
  }

  /** Called once per rendered frame by the engine. */
  update(dtSeconds: number): void {
    if (this.disposed) return;
    const stick = this.joystick.read();

    this.player.step(stick.x, stick.y, this.camera.orbitYaw, dtSeconds);

    const focus = {
      x: this.player.position.x,
      y: this.player.elevation,
      z: this.player.position.z,
    };
    // Under reduced motion the camera resolves immediately instead of easing.
    this.camera.update(focus, this.accessibility.reducedMotion ? 1 : dtSeconds);

    this.world.actors.setTransform(this.playerSlot, focus.x, focus.y, focus.z, this.player.facing);
    this.npcs.update(this.now(), dtSeconds * 1000);
    this.world.actors.flush();

    const dayFraction =
      ((this.now() % this.options.tunables.world.worldDayLengthMs) +
        this.options.tunables.world.worldDayLengthMs) %
      this.options.tunables.world.worldDayLengthMs;
    this.world.updateAtmosphere(
      dayFraction / this.options.tunables.world.worldDayLengthMs,
      this.player.position,
    );

    this.publish(dtSeconds * 1000);
  }

  /** Walks the player to the current prompt's approach point. */
  engagePrompt(): void {
    const prompt = useAppStore.getState().interactionPrompt;
    if (prompt === null) return;
    this.player.approach(prompt.approach);
    // The prompt only appears inside the interaction radius, so the player is
    // already in range: the walk is presentational and the command need not
    // wait for it to finish.
    if (prompt.kind === InteractableKind.GatheringNode) {
      this.options.onEngageGatheringNode?.(prompt.id);
    }
  }

  setAccessibility(patch: Partial<AccessibilityPreferences>): void {
    this.accessibility = { ...this.accessibility, ...patch };
    applyAccessibility(this.accessibility, document.documentElement);
    useAppStore.getState().setAccessibility(this.accessibility);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.npcs.dispose();
    this.world.actors.release(this.playerSlot);
    this.options.render.scene.remove(this.world.root);
    this.world.dispose();
  }

  private bindInput(): void {
    const { input } = this.options;

    // A tap on the world is a destination; the joystick owns its own zone and
    // never reaches the canvas, so these cannot conflict.
    input.events.on('tap', ({ x, y }) => {
      const point = this.pickGround(x, y);
      if (point) this.player.moveTo({ x: point.x, z: point.z });
    });

    input.events.on('dragmove', ({ dx, dy }) => {
      // Horizontal drag orbits, vertical drag pitches, both scaled so a full
      // screen sweep is a little under half a turn.
      this.camera.orbit(-dx * 0.006, -dy * 0.004);
    });

    input.events.on('pinch', ({ scale }) => this.camera.zoomBy(scale));

    input.events.on('longpress', () => this.player.cancelTravel());
  }

  /** Screen point to a world position on the courtyard floor. */
  private pickGround(clientX: number, clientY: number): Vector3 | null {
    const rect = this.options.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.options.render.camera);
    const hits = this.raycaster.intersectObject(this.world.root, true);
    const hit = hits.find((candidate) => candidate.point.y <= 2.5);
    return hit ? hit.point : null;
  }

  /** Throttled projection of world state into the UI store. */
  private publish(dtMs: number): void {
    this.storeAccumulatorMs += dtMs;
    if (this.storeAccumulatorMs < STORE_UPDATE_INTERVAL_MS) return;
    this.storeAccumulatorMs = 0;

    const store = useAppStore.getState();
    const nearest = this.world.nearestInteractable(
      this.player.position,
      this.options.tunables.world.interactionRadius,
    );

    const promptId = nearest?.interactable.id ?? null;
    if (promptId !== this.lastPromptId) {
      this.lastPromptId = promptId;
      const prompt: InteractionPromptState | null = nearest
        ? {
            id: nearest.interactable.id,
            label: nearest.interactable.label,
            verb: nearest.interactable.verb,
            kind: nearest.interactable.kind,
            approach: nearest.interactable.approach,
          }
        : null;
      store.setInteractionPrompt(prompt);
    }

    const minute = Math.floor(
      ((this.now() % this.options.tunables.world.worldDayLengthMs) /
        this.options.tunables.world.worldDayLengthMs) *
        1440,
    );
    store.setWorldMinute(minute);
  }
}
