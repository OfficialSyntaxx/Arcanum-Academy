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
 *   `@alderfell/sim` and are deterministic; this file is wiring and presentation.
 */

import {
  COURTYARD,
  InteractableKind,
  type Failure,
  type Result,
  type Tunables,
  type Zone,
  err,
  ok,
} from '@alderfell/shared';
import { Raycaster, Vector2, type Vector3 } from 'three';

import {
  applyAccessibility,
  readSystemPreferences,
  type AccessibilityPreferences,
} from '../a11y/preferences.js';
import { CameraRig } from '../camera/camera-rig.js';
import type { QualitySettings } from '../core/device.js';
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
  /** Called before the player begins a new route, to end station-bound activity. */
  readonly onBeginTravel?: () => void;
  /** Called before the player begins a new route, to end station-bound activity. */
  readonly onBeginTravel?: () => void;
  /**
   * Called when the player engages a gathering node.
   *
   * The controller reports the interactable rather than sending a command
   * itself: the world layer has no business knowing the wire protocol, and
   * this keeps the hub testable without a socket.
   */
  readonly onEngageGatheringNode?: (interactableId: string) => void;
  /** Called when the player engages a crafting station. */
  readonly onEngageCraftingStation?: (interactableId: string) => void;
  /** Called when the player engages a zone portal, with the target zone id. */
  readonly onEngageZonePortal?: (targetZoneId: string) => void;
  /**
   * Called on a long press, with whatever was under or near the press.
   *
   * The controller reports; it does not decide what the menu contains. Verbs
   * belong to content, and building them here would put content knowledge in
   * the world layer.
   */
  readonly onContextMenu?: (target: {
    readonly worldPoint: { readonly x: number; readonly z: number } | null;
    readonly interactableId: string | null;
  }) => void;
}

export class HubController {
  private world: WorldService;
  private player: PlayerController;
  private readonly camera: CameraRig;
  private npcs: NpcDirector;
  private readonly raycaster = new Raycaster();
  private readonly pointer = new Vector2();
  private readonly now: () => number;
  private playerSlot: number;

  private accessibility: AccessibilityPreferences;
  private storeAccumulatorMs = 0;
  private lastPromptId: string | null = null;
  /** One-tap skilling/travel request waiting for its route to complete. */
  private pendingInteractionId: string | null = null;
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
      viewSize: worldTunables.cameraViewSize,
      minViewSize: worldTunables.cameraMinViewSize,
      maxViewSize: worldTunables.cameraMaxViewSize,
      boomLength: worldTunables.cameraBoomLength,
      height: worldTunables.cameraHeight,
      smoothing: worldTunables.cameraSmoothing,
      minPitch: worldTunables.cameraMinPitch,
      maxPitch: worldTunables.cameraMaxPitch,
    });

    this.playerSlot = world.actors.acquire('player');
    this.npcs = new NpcDirector(world, options.tunables, this.now());

    // The renderer owns the canvas and its resize observer; the rig owns the
    // frustum. Hooking them here keeps the renderer ignorant of the camera's
    // projection and the rig ignorant of the DOM.
    options.render.onViewportChange = (width, height) => this.camera.setViewport(width, height);
    options.render.resize();

    world.attach(options.render.scene);
    this.camera.snapTo({
      x: this.player.position.x,
      y: this.player.elevation,
      z: this.player.position.z,
    });

    this.bindInput();
    useAppStore.getState().setAmbientPopulation(this.npcs.population);
    useAppStore.getState().setZone(world.zone.id, world.zone.name);
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
    this.player.step(dtSeconds);
    this.completePendingInteraction();

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
    this.world.updateDoors(this.player.position, dtSeconds);
    this.world.updateNavigationMarker(this.player.destination, this.now());

    this.publish(dtSeconds * 1000);
  }

  /** Walks the player to the current prompt's approach point. */
  navigateToInteractable(id: string): void {
    const target = this.world.zone.interactables.find((item) => item.id === id);
    if (target) {
      this.beginTravel();
      this.player.approach(target.approach);
    }
  }

  /** Starts the available activity through its normal in-world prompt. */
  engagePrompt(): void {
    const prompt = useAppStore.getState().interactionPrompt;
    if (prompt === null) return;
    this.player.approach(prompt.approach);
    // The prompt only appears inside the interaction radius, so the player is
    // already in range: the walk is presentational and the command need not
    // wait for it to finish.
    if (prompt.kind === InteractableKind.GatheringNode) {
      this.options.onEngageGatheringNode?.(prompt.id);
    } else if (prompt.kind === InteractableKind.CraftingStation) {
      this.options.onEngageCraftingStation?.(prompt.id);
    } else if (prompt.kind === InteractableKind.ZonePortal && prompt.targetZone) {
      this.options.onEngageZonePortal?.(prompt.targetZone);
    }
  }

  /**
   * Tears down the current zone and stands up a new one in its place.
   *
   * Purely a client-side concern for now: the server has no notion of "which
   * zone a player is in" (gathering/crafting/duels are addressed by
   * interactable id, not by zone), so travel never touches the network. The
   * player always arrives at the new zone's authored `spawn` waypoint.
   */
  switchZone(zone: Zone): Result<void, Failure> {
    const loaded = WorldService.load(zone, this.options.quality);
    if (!loaded.ok) return err(loaded.error);
    const newWorld = loaded.value;

    this.npcs.dispose();
    this.world.actors.release(this.playerSlot);
    this.options.render.scene.remove(this.world.root);
    this.world.dispose();

    this.world = newWorld;
    const { world: worldTunables } = this.options.tunables;
    this.player = new PlayerController({
      world: newWorld,
      walkSpeed: worldTunables.playerWalkSpeed,
      runSpeed: worldTunables.playerRunSpeed,
      turnRate: worldTunables.playerTurnRate,
      arrivalRadius: worldTunables.waypointArrivalRadius,
    });
    this.playerSlot = newWorld.actors.acquire('player');
    this.npcs = new NpcDirector(newWorld, this.options.tunables, this.now());

    newWorld.attach(this.options.render.scene);
    this.camera.snapTo({
      x: this.player.position.x,
      y: this.player.elevation,
      z: this.player.position.z,
    });

    // A prompt or population count left over from the old zone is stale the
    // instant the zone changes, not on the next throttled publish tick.
    this.lastPromptId = null;
    const store = useAppStore.getState();
    store.setInteractionPrompt(null);
    store.setAmbientPopulation(this.npcs.population);
    store.setZone(newWorld.zone.id, newWorld.zone.name);

    return ok(undefined);
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

    // A tap on the world is a destination. It is the only movement control, so
    // there is nothing for it to arbitrate against.
    input.events.on('tap', ({ x, y }) => {
      const interactable = this.pickInteractable(x, y);
      if (interactable) {
        this.routeToInteractable(interactable.id);
        return;
      }
      const point = this.pickGround(x, y);
      if (point) {
        this.pendingInteractionId = null;
        this.beginTravel();
        this.player.moveTo({ x: point.x, z: point.z });
      }
    });

    input.events.on('dragmove', ({ dx, dy }) => {
      // Horizontal drag orbits, vertical drag pitches, both scaled so a full
      // screen sweep is a little under half a turn.
      this.camera.orbit(-dx * 0.006, -dy * 0.004);
    });

    input.events.on('pinch', ({ scale }) => this.camera.zoomBy(scale));

    // Long press is the context menu - OSRS's right-click. Many things carry
    // more than one verb (Chop / Examine, Attack / Examine), and a game with a
    // single tap gesture has nowhere else to put the second one. The controller
    // reports what was pressed and lets the UI present the choice, so the menu
    // is never built down here in the world layer.
    input.events.on('longpress', ({ x, y }) => {
      const nearest = this.world.nearestInteractable(
        this.player.position,
        this.options.tunables.world.interactionRadius,
      );
      const point = this.pickGround(x, y);
      this.options.onContextMenu?.({
        worldPoint: point ? { x: point.x, z: point.z } : null,
        interactableId: nearest?.interactable.id ?? null,
      });
    });
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
    const hit = hits.find((candidate) => candidate.object.userData['ground'] === true);
    return hit ? hit.point : null;
  }

  /** Resolves a direct tap on an interactable's visible world marker. */
  private pickInteractable(clientX: number, clientY: number): { readonly id: string } | null {
    const rect = this.options.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.options.render.camera);
    for (const hit of this.raycaster.intersectObject(this.world.root, true)) {
      const interactable = this.world.interactableFromObject(hit.object);
      if (interactable) return { id: interactable.id };
    }
    return null;
  }

  /** Routes to a specific world object and queues its one-tap action if any. */
  private routeToInteractable(id: string): void {
    const target = this.world.zone.interactables.find((interactable) => interactable.id === id);
    if (!target) return;
    this.beginTravel();
    this.player.approach(target.approach);
    this.pendingInteractionId =
      target.kind === InteractableKind.MerchantStall || target.kind === InteractableKind.QuestBoard
        ? null
        : target.id;
  }

  /** Starts a queued skilling or travel action once the avatar reaches it. */
  private completePendingInteraction(): void {
    const id = this.pendingInteractionId;
    if (id === null || this.player.isTravelling) return;
    this.pendingInteractionId = null;
    const target = this.world.zone.interactables.find((interactable) => interactable.id === id);
    if (!target) return;
    if (target.kind === InteractableKind.GatheringNode) {
      this.options.onEngageGatheringNode?.(target.id);
    } else if (target.kind === InteractableKind.CraftingStation) {
      this.options.onEngageCraftingStation?.(target.id);
    } else if (target.kind === InteractableKind.ZonePortal && target.targetZone) {
      this.options.onEngageZonePortal?.(target.targetZone);
    }
  }

  /** Ends contextual UI before an avatar leaves the current location. */
  private beginTravel(): void {
    this.lastPromptId = null;
    useAppStore.getState().beginTravel();
    this.options.onBeginTravel?.();
  }

  /** Throttled projection of world state into the UI store. */
  private publish(dtMs: number): void {
    this.storeAccumulatorMs += dtMs;
    if (this.storeAccumulatorMs < STORE_UPDATE_INTERVAL_MS) return;
    this.storeAccumulatorMs = 0;

    const store = useAppStore.getState();
    const nearest = this.player.isTravelling
      ? null
      : this.world.nearestInteractable(
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
            ...(nearest.interactable.targetZone !== undefined
              ? { targetZone: nearest.interactable.targetZone }
              : {}),
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
