/**
 * Sends economy commands and applies the server's answers.
 *
 * This lives in `app` rather than `net` because it touches both the transport
 * and the store, and the layer rules deliberately forbid `net` from reaching
 * into state - a transport that knew about the UI would be impossible to test
 * without one.
 *
 * There is no local prediction here yet. Every number on screen is one the
 * server confirmed, which is the safest place to start: a wrong prediction
 * shows a player materials that then vanish, and gathering is slow enough that
 * a round trip is not felt. The rules needed to predict already live in
 * `@alderfell/sim`, so adding it later is a change here and nowhere else.
 */

import { ClientOpcode, ServerOpcode, type Failure, type QuestProgress } from '@alderfell/shared';
import type { Transport } from '../net/transport.js';
import { useAppStore, type EconomyState } from '../state/app-store.js';

interface HarvestPatch {
  readonly inventory?: {
    readonly stacks?: readonly { definitionId: string; quantity: number }[];
    readonly slotCapacity?: number;
  };
  readonly bank?: {
    readonly stacks?: readonly { definitionId: string; quantity: number }[];
    readonly slotCapacity?: number;
  };
  readonly coins?: number;
  readonly hitpoints?: EconomyState['hitpoints'];
  readonly skills?: Readonly<Record<string, { level: number; xp: number }>>;
  readonly tools?: Readonly<Record<string, { definitionId: string; durability: number }>>;
  readonly equipment?: EconomyState['equipment'];
  readonly gathering?: { readonly nodeId?: string } | null;
  readonly yields?: readonly { itemId: string; quantity: number }[];
  readonly xpGained?: number;
  readonly overflowed?: boolean;
  readonly cards?: readonly {
    definitionId: string;
    grade: number;
    foil: boolean;
    serial: string | null;
  }[];
  readonly decks?: Readonly<Record<string, { name: string; cardDefinitionIds: readonly string[] }>>;
  readonly quests?: Readonly<Record<string, QuestProgress>>;
  readonly discoveries?: EconomyState['discoveries'];
  readonly diaryRewards?: EconomyState['diaryRewards'];
  readonly grave?: EconomyState['grave'];
  readonly combat?: EconomyState['combat'];
  readonly location?: EconomyState['location'];
  readonly saltwake?: EconomyState['saltwake'];
  readonly tideglassTrail?: EconomyState['tideglassTrail'];
}

/** Command kinds this controller owns, so unrelated patches are ignored. */
const OWNED = new Set([
  'player.sync',
  'gathering.start',
  'gathering.collect',
  'gathering.stop',
  'crafting.craft',
  'bank.deposit',
  'bank.withdraw',
  'merchant.sell',
  'merchant.repair',
  'merchant.upgrade_tool',
  'equipment.equip',
  'equipment.unequip',
  'quest.accept',
  'quest.complete',
  'combat.attack',
  'combat.eat',
  'combat.recover',
  'combat.reclaim_grave',
  'world.travel',
  'dungeon.claim_tideglass',
  'clue.investigate',
]);

export class EconomyController {
  private disposed = false;
  /** Kept only for an actionable diagnostic if the gateway rejects it. */
  private pendingCommand: string | null = null;

  constructor(
    private readonly transport: Transport,
    private readonly onLocation?: (zoneId: string) => void,
  ) {
    this.transport.events.on('frame', (frame) => this.onFrame(frame));
  }

  sync(): void {
    this.send('player.sync');
  }

  startGathering(interactableId: string): void {
    this.send('gathering.start', { interactableId });
  }

  collect(): void {
    this.send('gathering.collect');
  }

  stopGathering(): void {
    const store = useAppStore.getState();
    if (store.economy.gatheringNodeId === null) return;
    // Leaving a station should feel immediate. The gateway's stop patch remains
    // authoritative, but clearing the local projection now prevents a stale
    // gathering HUD from following the player across the world.
    store.setEconomy({
      gatheringNodeId: null,
      lastYields: [],
      lastXpGained: 0,
      overflowed: false,
    });
    this.send('gathering.stop');
  }

  craft(recipeId: string): void {
    this.send('crafting.craft', { recipeId });
  }

  deposit(itemId: string, quantity: number): void {
    this.send('bank.deposit', { itemId, quantity });
  }

  withdraw(itemId: string, quantity: number): void {
    this.send('bank.withdraw', { itemId, quantity });
  }

  sell(itemId: string, quantity: number): void {
    this.send('merchant.sell', { itemId, quantity });
  }

  repair(skillId: string): void {
    this.send('merchant.repair', { skillId });
  }

  upgradeTool(toolId: string): void {
    this.send('merchant.upgrade_tool', { toolId });
  }

  /** Wears one piece of gear from the satchel. The server owns the swap. */
  equip(itemId: string): void {
    this.send('equipment.equip', { itemId });
  }

  unequip(slot: string): void {
    this.send('equipment.unequip', { slot });
  }

  acceptQuest(questId: string): void {
    this.send('quest.accept', { questId });
  }

  completeQuest(questId: string): void {
    this.send('quest.complete', { questId });
  }

  travel(targetZoneId: string): void {
    this.send('world.travel', { targetZoneId });
  }

  claimTideglass(): void {
    this.send('dungeon.claim_tideglass');
  }

  investigateClue(interactableId: string): void {
    this.send('clue.investigate', { interactableId });
  }

  /** One exchange of blows. The style defaults to the player's chosen stance. */
  attackEncounter(
    interactableId: string,
    style: 'ACCURATE' | 'AGGRESSIVE' | 'DEFENSIVE' | 'RANGED' | 'MAGIC' = useAppStore.getState()
      .combatStyle,
  ): void {
    this.send('combat.attack', { interactableId, style });
  }

  recoverCombat(): void {
    this.send('combat.recover');
  }

  reclaimCombatGrave(): void {
    this.send('combat.reclaim_grave');
  }

  /** Travelling away ends the local combat presentation; the server still owns target respawn. */
  disengageCombat(): void {
    useAppStore
      .getState()
      .setEconomy({ combat: null, lastCombatStrikeAtMs: 0, lastCombatTickAtMs: 0 });
  }

  eatCombatFood(interactableId: string, itemId: string): void {
    this.send('combat.eat', { interactableId, itemId });
  }

  dispose(): void {
    this.disposed = true;
  }

  private send(kind: string, payload: Record<string, unknown> = {}): void {
    if (this.disposed) return;
    this.pendingCommand = `${kind}${Object.keys(payload).length ? ` ${JSON.stringify(payload)}` : ''}`;
    useAppStore.getState().recordDiagnostic({
      level: 'info',
      source: 'economy',
      message: `Command sent: ${kind}${Object.keys(payload).length ? ` ${JSON.stringify(payload)}` : ''}`,
    });
    this.transport.send(ClientOpcode.Command, { kind, ...payload });
  }

  private onFrame(frame: { readonly op: string; readonly p: unknown }): void {
    if (this.disposed) return;

    // Sync on the accepted handshake rather than on the socket opening. An open
    // socket is not yet an authenticated one - the gateway refuses commands
    // with gateway.handshake_required until the exchange completes, and the
    // reply is a further round trip after the connection reports itself open.
    // This also covers a resumed session, whose state may have moved on while
    // the client was away.
    if (frame.op === ServerOpcode.HandshakeAccepted) {
      useAppStore.getState().recordDiagnostic({
        level: 'info',
        source: 'network',
        message: 'Gateway handshake accepted',
      });
      this.sync();
      return;
    }

    if (frame.op === ServerOpcode.CommandRejected) {
      const failure = frame.p as Failure | null;
      const reason = failure?.reason ?? 'command.failed';
      const attempted = this.pendingCommand ?? 'unknown command';
      this.pendingCommand = null;
      // Only surface refusals of commands this controller sent; a rejection
      // belonging to another subsystem is not this panel's to report.
      useAppStore.getState().setLastCommandError(reason);
      useAppStore.getState().recordDiagnostic({
        level: 'error',
        source: 'economy',
        message: `Command rejected: ${attempted} → ${reason}`,
      });
      return;
    }

    if (frame.op !== ServerOpcode.Patch) return;
    const envelope = frame.p as { readonly kind?: string; readonly state?: HarvestPatch } | null;
    if (envelope?.kind === undefined) return;

    if (!OWNED.has(envelope.kind)) return;
    const patch = envelope.state;
    if (patch === undefined) return;

    const next: Partial<EconomyState> = {
      ...(patch.inventory?.stacks !== undefined ? { stacks: patch.inventory.stacks } : {}),
      ...(patch.inventory?.slotCapacity !== undefined
        ? { slotCapacity: patch.inventory.slotCapacity }
        : {}),
      ...(patch.bank?.stacks !== undefined ? { bankStacks: patch.bank.stacks } : {}),
      ...(patch.bank?.slotCapacity !== undefined
        ? { bankSlotCapacity: patch.bank.slotCapacity }
        : {}),
      ...(patch.coins !== undefined ? { coins: patch.coins } : {}),
      ...(patch.hitpoints !== undefined ? { hitpoints: patch.hitpoints } : {}),
      ...(patch.skills !== undefined ? { skills: patch.skills } : {}),
      ...(patch.tools !== undefined ? { tools: patch.tools } : {}),
      gatheringNodeId: patch.gathering?.nodeId ?? null,
      // Yields are per-collection rather than cumulative, so a patch without
      // them clears the readout instead of leaving the previous haul on screen.
      lastYields: patch.yields ?? [],
      lastXpGained: patch.xpGained ?? 0,
      overflowed: patch.overflowed ?? false,
      ...(patch.equipment !== undefined ? { equipment: patch.equipment } : {}),
      ...(patch.cards !== undefined ? { cards: patch.cards } : {}),
      ...(patch.decks !== undefined ? { decks: patch.decks } : {}),
      ...(patch.quests !== undefined ? { quests: patch.quests } : {}),
      ...(patch.discoveries !== undefined ? { discoveries: patch.discoveries } : {}),
      ...(patch.diaryRewards !== undefined ? { diaryRewards: patch.diaryRewards } : {}),
      ...(patch.grave !== undefined ? { grave: patch.grave } : {}),
      ...(patch.combat !== undefined ? { combat: patch.combat } : {}),
      ...(patch.location !== undefined ? { location: patch.location } : {}),
      ...(patch.saltwake !== undefined ? { saltwake: patch.saltwake } : {}),
      ...(patch.tideglassTrail !== undefined ? { tideglassTrail: patch.tideglassTrail } : {}),
      ...(envelope.kind === 'combat.attack' && patch.combat !== undefined
        ? { lastCombatStrikeAtMs: Date.now() }
        : {}),
      // Eating spends a combat tick too, so the automatic exchange paces from it
      // without triggering the player's swing animation.
      ...((envelope.kind === 'combat.attack' || envelope.kind === 'combat.eat') &&
      patch.combat !== undefined
        ? { lastCombatTickAtMs: Date.now() }
        : {}),
    };

    const store = useAppStore.getState();
    this.pendingCommand = null;
    store.setEconomy(next);
    if (patch.location !== undefined) this.onLocation?.(patch.location.zoneId);
    store.setLastCommandError(null);
    store.recordDiagnostic({
      level: 'info',
      source: 'economy',
      message: `Server patch received: ${envelope.kind}`,
    });
  }
}
