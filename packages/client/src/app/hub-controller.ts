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
  COMBAT_ENCOUNTERS,
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
import { NpcAvatarGroup } from '../npc/npc-avatar-group.js';
import { CombatAvatarGroup } from '../combat/combat-avatar-group.js';
import { GravestoneMarker } from '../combat/gravestone-marker.js';
import { Hitsplats } from '../combat/hitsplats.js';
import { questDialogueForNpc } from '../npc/quest-dialogue.js';
import { PlayerController } from '../player/player-controller.js';
import { PlayerAvatar } from '../player/player-avatar.js';
import type { RenderService } from '../render/renderer.js';
import { useAppStore, type InteractionPromptState } from '../state/app-store.js';
import { WorldService } from '../world/world-service.js';

const STORE_UPDATE_INTERVAL_MS = 250;
/** How long an aggressive creature waits after a refused engagement before trying again. */
const AGGRO_RETRY_MS = 4_000;
/** Retry spacing when the server says the tick has not elapsed yet (clock skew). */
const COOLDOWN_RETRY_MS = 180;

export interface HubControllerOptions {
  readonly render: RenderService;
  readonly input: InputService;
  readonly quality: QualitySettings;
  readonly tunables: Tunables;
  readonly canvas: HTMLCanvasElement;
  readonly now?: () => number;
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
  /** Called when the player reaches a bank chest. */
  readonly onEngageBankChest?: (interactableId: string) => void;
  /** Called when the player reaches a merchant stall. */
  readonly onEngageMerchantStall?: (interactableId: string) => void;
  /** Called when the player reads an in-world notice or quest board. */
  readonly onEngageQuestBoard?: (interactableId: string) => void;
  /** Called when the player attacks an in-world combat encounter. */
  readonly onEngageCombatEncounter?: (interactableId: string) => void;
  /** Called when the player investigates an authored treasure-trail site. */
  readonly onEngageClueSite?: (interactableId: string) => void;
  /** Reports movement to the gateway for authoritative interaction range checks. */
  readonly onPresence?: (position: {
    readonly x: number;
    readonly z: number;
    readonly facing: number;
  }) => void;
  /** Called when the player speaks to a nearby named character. */
  readonly onEngageNpc?: (npc: {
    readonly id: string;
    readonly name: string;
    readonly role: string;
    readonly line: string;
  }) => void;
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
  private playerAvatar: PlayerAvatar;
  private readonly camera: CameraRig;
  private npcs: NpcDirector;
  private npcAvatars: NpcAvatarGroup;
  private combatAvatars: CombatAvatarGroup;
  private gravestoneMarker: GravestoneMarker;
  private readonly hitsplats = new Hitsplats();
  /** Receipt time of the strike the last automatic exchange was paced from. */
  private autoAttackPacedFromMs = -1;
  private autoAttackRetries = 0;
  private autoAttackSentAtMs = 0;
  /** Strike receipt already turned into hitsplats, so each exchange splats once. */
  private lastSplatStrikeAtMs = 0;
  private readonly aggroRetryAtMs = new Map<string, number>();
  /** No creature picks a fight until this time; set when the player falls. */
  private aggroGraceUntilMs = 0;
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
    this.playerAvatar = this.createPlayerAvatar();
    this.npcs = new NpcDirector(world, options.tunables, this.now());
    this.npcAvatars = this.createNpcAvatars();
    this.combatAvatars = this.createCombatAvatars();
    this.gravestoneMarker = this.createGravestoneMarker();

    // The renderer owns the canvas and its resize observer; the rig owns the
    // frustum. Hooking them here keeps the renderer ignorant of the camera's
    // projection and the rig ignorant of the DOM.
    options.render.onViewportChange = (width, height) => this.camera.setViewport(width, height);
    options.render.resize();

    world.attach(options.render.scene);
    options.render.scene.add(this.hitsplats.root);
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

    const economy = useAppStore.getState().economy;
    const gathering = economy.gatheringNodeId !== null;
    this.driveCombat(economy);
    this.playerAvatar.update(
      dtSeconds,
      focus,
      this.player.facing,
      this.player.gait,
      this.playerAction(economy),
    );
    if (!this.playerAvatar.ready) {
      this.world.actors.setTransform(
        this.playerSlot,
        focus.x,
        focus.y,
        focus.z,
        this.player.facing,
        this.player.gait,
        this.now(),
        'none',
        gathering,
      );
    }
    this.npcs.update(this.now(), dtSeconds * 1000);
    this.npcAvatars.update(dtSeconds, this.npcs.presentations());
    this.combatAvatars.update(
      dtSeconds,
      economy.combat,
      economy.lastCombatStrikeAtMs,
      this.player.position,
      this.now(),
    );
    this.hitsplats.update(this.now());
    this.gravestoneMarker.update(economy.grave, this.now());
    this.world.actors.flush();

    const dayFraction =
      ((this.now() % this.options.tunables.world.worldDayLengthMs) +
        this.options.tunables.world.worldDayLengthMs) %
      this.options.tunables.world.worldDayLengthMs;
    this.world.updateAtmosphere(
      dayFraction / this.options.tunables.world.worldDayLengthMs,
      this.player.position,
      Math.floor(this.now() / this.options.tunables.world.worldDayLengthMs),
      this.now(),
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
    if (prompt === null) {
      useAppStore.getState().recordDiagnostic({
        level: 'warn',
        source: 'world',
        message: 'Interact pressed with no active prompt',
      });
      return;
    }
    if (prompt.kind === 'npc') {
      const npc = this.npcs.namedById(prompt.id);
      if (!npc) return;
      const minute = Math.floor(
        ((this.now() % this.options.tunables.world.worldDayLengthMs) /
          this.options.tunables.world.worldDayLengthMs) *
          1440,
      );
      const bark = npc.barks[minute % Math.max(1, npc.barks.length)] ?? 'Good to see you.';
      const line = questDialogueForNpc(npc.id, useAppStore.getState().economy.quests, bark);
      useAppStore.getState().recordDiagnostic({
        level: 'info',
        source: 'world',
        message: `Talk → ${npc.name} (${npc.id})`,
      });
      this.options.onEngageNpc?.({ id: npc.id, name: npc.name, role: npc.role, line });
      return;
    }
    useAppStore.getState().recordDiagnostic({
      level: 'info',
      source: 'world',
      message: `${prompt.verb} → ${prompt.label} (${prompt.id})`,
    });
    this.player.approach(prompt.approach);
    // The prompt only appears inside the interaction radius, so the player is
    // already in range: the walk is presentational and the command need not
    // wait for it to finish.
    if (prompt.kind === InteractableKind.GatheringNode) {
      this.options.onEngageGatheringNode?.(prompt.id);
    } else if (prompt.kind === InteractableKind.CraftingStation) {
      this.options.onEngageCraftingStation?.(prompt.id);
    } else if (prompt.kind === InteractableKind.BankChest) {
      this.options.onEngageBankChest?.(prompt.id);
    } else if (prompt.kind === InteractableKind.MerchantStall) {
      this.options.onEngageMerchantStall?.(prompt.id);
    } else if (prompt.kind === InteractableKind.QuestBoard) {
      this.options.onEngageQuestBoard?.(prompt.id);
    } else if (prompt.kind === InteractableKind.CombatEncounter) {
      this.options.onEngageCombatEncounter?.(prompt.id);
    } else if (prompt.kind === InteractableKind.ClueSite) {
      this.options.onEngageClueSite?.(prompt.id);
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
    this.npcAvatars.dispose();
    this.combatAvatars.dispose();
    this.gravestoneMarker.dispose();
    this.playerAvatar.dispose();
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
    this.playerAvatar = this.createPlayerAvatar();
    this.npcs = new NpcDirector(newWorld, this.options.tunables, this.now());
    this.npcAvatars = this.createNpcAvatars();
    this.combatAvatars = this.createCombatAvatars();
    this.gravestoneMarker = this.createGravestoneMarker();

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
    this.npcAvatars.dispose();
    this.combatAvatars.dispose();
    this.gravestoneMarker.dispose();
    this.playerAvatar.dispose();
    this.options.render.scene.remove(this.hitsplats.root);
    this.hitsplats.dispose();
    this.world.actors.release(this.playerSlot);
    this.options.render.scene.remove(this.world.root);
    this.world.dispose();
  }

  /**
   * OSRS combat: one tap starts a fight and the blows then trade themselves.
   *
   * The server owns every roll and the 600 ms tick. This loop only decides
   * *when* to ask for the next exchange: once the previous one has been
   * confirmed and a tick has passed since we received it. Pacing from the
   * receipt time rather than the server's clock keeps a phone with a skewed
   * clock from spamming or stalling. Walking away ends the fight, and an
   * aggressive creature starts one the moment the player is within its reach.
   */
  private driveCombat(economy: ReturnType<typeof useAppStore.getState>['economy']): void {
    const now = this.now();
    const store = useAppStore.getState();
    const combat = economy.combat;
    const alive = economy.hitpoints.current > 0 && economy.hitpoints.respawnAtMs === null;
    const tickMs = this.options.tunables.combat.tickMs;

    if (combat !== null && !combat.defeated) {
      this.spawnHitsplats(economy);
      const target = this.world.zone.interactables.find((i) => i.id === combat.interactableId);
      if (target) this.player.faceToward(target.position);
      if (!alive || this.player.isTravelling || !this.withinReach(combat.interactableId)) return;
      const pacedFrom = economy.lastCombatTickAtMs;
      if (pacedFrom !== this.autoAttackPacedFromMs) {
        this.autoAttackPacedFromMs = pacedFrom;
        this.autoAttackRetries = 0;
        this.autoAttackSentAtMs = 0;
      }
      const cooldownRefused = store.lastCommandError === 'combat.cooldown';
      const due =
        this.autoAttackSentAtMs === 0
          ? now >= pacedFrom + tickMs
          : cooldownRefused &&
            this.autoAttackRetries < 4 &&
            now >= this.autoAttackSentAtMs + COOLDOWN_RETRY_MS;
      if (!due) return;
      if (this.autoAttackSentAtMs !== 0) this.autoAttackRetries += 1;
      this.autoAttackSentAtMs = now;
      this.options.onEngageCombatEncounter?.(combat.interactableId);
      return;
    }

    if (combat !== null && combat.defeated) this.spawnHitsplats(economy);
    // A fallen player gets a breath after recovering before the den notices
    // them again, so a death never chains straight into another.
    if (!alive) this.aggroGraceUntilMs = now + AGGRO_RETRY_MS * 2;
    // Nothing is being fought: an aggressive creature within reach picks the
    // fight itself. The server still validates range, level and respawn.
    if (!alive || this.player.isTravelling || now < this.aggroGraceUntilMs) return;
    for (const encounter of COMBAT_ENCOUNTERS) {
      if (!encounter.aggressive) continue;
      if (encounter.zoneId !== undefined && encounter.zoneId !== this.world.zone.id) continue;
      if (
        encounter.zoneId === undefined &&
        !this.world.zone.interactables.some((i) => i.id === encounter.interactableId)
      )
        continue;
      if (!this.withinReach(encounter.interactableId)) continue;
      if (now < (this.aggroRetryAtMs.get(encounter.interactableId) ?? 0)) continue;
      // A creature that was just felled here is reforming; give it its respawn.
      if (combat?.interactableId === encounter.interactableId && combat.respawnAtMs !== null) {
        this.aggroRetryAtMs.set(encounter.interactableId, now + encounter.respawnMs);
        continue;
      }
      this.aggroRetryAtMs.set(encounter.interactableId, now + AGGRO_RETRY_MS);
      useAppStore.getState().recordDiagnostic({
        level: 'info',
        source: 'world',
        message: `${encounter.label} attacks you`,
      });
      this.options.onEngageCombatEncounter?.(encounter.interactableId);
      return;
    }
  }

  /** What the player's hands are doing this frame, from confirmed server state. */
  private playerAction(
    economy: ReturnType<typeof useAppStore.getState>['economy'],
  ): 'none' | 'attack' | 'chop' | 'harvest' | 'eat' | 'flinch' {
    const now = this.now();
    const combat = economy.combat;
    if (combat !== null && !combat.defeated) {
      const sinceTick = now - economy.lastCombatTickAtMs;
      if (combat.foodConsumed !== undefined && sinceTick < 700) return 'eat';
      const sinceStrike = now - economy.lastCombatStrikeAtMs;
      // The creature's answer lands a beat after the player's swing.
      if (combat.enemyDamage > 0 && sinceStrike >= 320 && sinceStrike < 900) return 'flinch';
      if (sinceStrike < 320) return 'attack';
    }
    if (economy.gatheringNodeId !== null && !this.player.isTravelling) {
      const node = this.world.zone.interactables.find((i) => i.id === economy.gatheringNodeId);
      return node?.verb === 'Fell' || node?.verb === 'Mine' ? 'chop' : 'harvest';
    }
    return 'none';
  }

  /** Whether the player stands close enough to an encounter for the server to accept a swing. */
  private withinReach(interactableId: string): boolean {
    const encounter = COMBAT_ENCOUNTERS.find((e) => e.interactableId === interactableId);
    if (!encounter) return false;
    const dx = this.player.position.x - encounter.position.x;
    const dz = this.player.position.z - encounter.position.z;
    const radius = this.options.tunables.world.interactionRadius;
    return dx * dx + dz * dz <= radius * radius;
  }

  /** Turns each confirmed exchange into a splat over whoever was struck. */
  private spawnHitsplats(economy: ReturnType<typeof useAppStore.getState>['economy']): void {
    const combat = economy.combat;
    if (combat === null || economy.lastCombatStrikeAtMs === this.lastSplatStrikeAtMs) return;
    this.lastSplatStrikeAtMs = economy.lastCombatStrikeAtMs;
    if (combat.foodConsumed !== undefined) return;
    const now = this.now();
    const head = this.combatAvatars.headPoint(combat.interactableId);
    if (head) this.hitsplats.spawn(head.x, head.y, head.z, combat.damage, now);
    if (combat.defeated) return;
    // The creature's answer lands a beat later, matching its lunge animation.
    const enemyDamage = combat.enemyDamage;
    const px = this.player.position.x;
    const pz = this.player.position.z;
    const py = this.player.elevation + 2.0;
    window.setTimeout(() => {
      if (!this.disposed) this.hitsplats.spawn(px, py, pz, enemyDamage, this.now());
    }, 320);
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

  private createPlayerAvatar(): PlayerAvatar {
    const avatar = new PlayerAvatar(this.options.quality.shadowsEnabled, () => {
      // The low-poly actor was only a cold-load fallback; release it once the
      // animated GLB is visible so there is never a duplicate player.
      this.world.actors.release(this.playerSlot);
    });
    this.world.root.add(avatar.root);
    return avatar;
  }

  private createNpcAvatars(): NpcAvatarGroup {
    const avatars = new NpcAvatarGroup(
      this.world,
      this.options.quality.shadowsEnabled,
      this.npcs.presentations(),
    );
    this.world.root.add(avatars.root);
    return avatars;
  }

  private createCombatAvatars(): CombatAvatarGroup {
    const avatars = new CombatAvatarGroup(this.world.zone, this.options.quality.shadowsEnabled);
    this.world.root.add(avatars.root);
    return avatars;
  }

  private createGravestoneMarker(): GravestoneMarker {
    const marker = new GravestoneMarker(this.world.zone);
    this.world.root.add(marker.root);
    return marker;
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
    this.pendingInteractionId = target.id;
  }

  /** Starts a queued skilling or travel action once the avatar reaches it. */
  private completePendingInteraction(): void {
    const id = this.pendingInteractionId;
    if (id === null || this.player.isTravelling) return;
    this.pendingInteractionId = null;
    const target = this.world.zone.interactables.find((interactable) => interactable.id === id);
    if (!target) return;
    const reached = this.world.nearestInteractable(
      this.player.position,
      this.options.tunables.world.interactionRadius,
    );
    if (reached?.interactable.id !== target.id) {
      useAppStore.getState().recordDiagnostic({
        level: 'warn',
        source: 'world',
        message: `Interaction cancelled before arrival: ${target.label}`,
      });
      return;
    }
    if (target.kind === InteractableKind.GatheringNode) {
      this.options.onEngageGatheringNode?.(target.id);
    } else if (target.kind === InteractableKind.CraftingStation) {
      this.options.onEngageCraftingStation?.(target.id);
    } else if (target.kind === InteractableKind.BankChest) {
      this.options.onEngageBankChest?.(target.id);
    } else if (target.kind === InteractableKind.MerchantStall) {
      this.options.onEngageMerchantStall?.(target.id);
    } else if (target.kind === InteractableKind.QuestBoard) {
      this.options.onEngageQuestBoard?.(target.id);
    } else if (target.kind === InteractableKind.CombatEncounter) {
      this.options.onEngageCombatEncounter?.(target.id);
    } else if (target.kind === InteractableKind.ClueSite) {
      this.options.onEngageClueSite?.(target.id);
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
    this.options.onPresence?.({
      x: this.player.position.x,
      z: this.player.position.z,
      facing: this.player.facing,
    });

    const store = useAppStore.getState();
    const nearest = this.player.isTravelling
      ? null
      : this.world.nearestInteractable(
          this.player.position,
          this.options.tunables.world.interactionRadius,
        );

    const nearbyNpc = nearest
      ? null
      : this.npcs.nearestNamed(
          this.player.position.x,
          this.player.position.z,
          this.options.tunables.world.interactionRadius,
        );
    const promptId = nearest?.interactable.id ?? nearbyNpc?.id ?? null;
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
        : nearbyNpc
          ? {
              id: nearbyNpc.id,
              label: nearbyNpc.name,
              verb: 'Talk',
              kind: 'npc',
              approach: this.world.zone.spawn,
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
    store.setPlayerPosition(
      { x: this.player.position.x, z: this.player.position.z, facing: this.player.facing },
      this.camera.orbitYaw,
    );
  }
}
