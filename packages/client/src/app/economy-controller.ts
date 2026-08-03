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
 * `@arcanum/sim`, so adding it later is a change here and nowhere else.
 */

import { ClientOpcode, ServerOpcode, type Failure } from '@arcanum/shared';
import type { Transport } from '../net/transport.js';
import { useAppStore, type EconomyState } from '../state/app-store.js';

interface HarvestPatch {
  readonly inventory?: {
    readonly stacks?: readonly { definitionId: string; quantity: number }[];
    readonly slotCapacity?: number;
  };
  readonly skills?: Readonly<Record<string, { level: number; xp: number }>>;
  readonly gathering?: { readonly nodeId?: string } | null;
  readonly yields?: readonly { itemId: string; quantity: number }[];
  readonly xpGained?: number;
  readonly overflowed?: boolean;
}

/** Command kinds this controller owns, so unrelated patches are ignored. */
const OWNED = new Set([
  'player.sync',
  'gathering.start',
  'gathering.collect',
  'gathering.claimOffline',
  'gathering.stop',
  'crafting.craft',
]);

export class EconomyController {
  private disposed = false;

  constructor(private readonly transport: Transport) {
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

  claimOffline(): void {
    this.send('gathering.claimOffline');
  }

  stopGathering(): void {
    this.send('gathering.stop');
  }

  craft(recipeId: string): void {
    this.send('crafting.craft', { recipeId });
  }

  dispose(): void {
    this.disposed = true;
  }

  private send(kind: string, payload: Record<string, unknown> = {}): void {
    if (this.disposed) return;
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
      this.sync();
      return;
    }

    if (frame.op === ServerOpcode.CommandRejected) {
      const failure = frame.p as Failure | null;
      const reason = failure?.reason ?? 'command.failed';
      // Only surface refusals of commands this controller sent; a rejection
      // belonging to another subsystem is not this panel's to report.
      useAppStore.getState().setLastCommandError(reason);
      return;
    }

    if (frame.op !== ServerOpcode.Patch) return;
    const envelope = frame.p as { readonly kind?: string; readonly state?: HarvestPatch } | null;
    if (envelope?.kind === undefined || !OWNED.has(envelope.kind)) return;
    const patch = envelope.state;
    if (patch === undefined) return;

    const next: Partial<EconomyState> = {
      ...(patch.inventory?.stacks !== undefined ? { stacks: patch.inventory.stacks } : {}),
      ...(patch.inventory?.slotCapacity !== undefined
        ? { slotCapacity: patch.inventory.slotCapacity }
        : {}),
      ...(patch.skills !== undefined ? { skills: patch.skills } : {}),
      gatheringNodeId: patch.gathering?.nodeId ?? null,
      // Yields are per-collection rather than cumulative, so a patch without
      // them clears the readout instead of leaving the previous haul on screen.
      lastYields: patch.yields ?? [],
      lastXpGained: patch.xpGained ?? 0,
      overflowed: patch.overflowed ?? false,
    };

    const store = useAppStore.getState();
    store.setEconomy(next);
    store.setLastCommandError(null);
  }
}
