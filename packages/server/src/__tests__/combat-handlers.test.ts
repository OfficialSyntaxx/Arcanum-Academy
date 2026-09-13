import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TUNABLES,
  ITEM_CATALOG,
  SKILL_TABLE,
  asId,
  type PlayerId,
  type SessionId,
} from '@alderfell/shared';
import { PlayerService } from '../domain/player-service.js';
import { RegistryCommandRouter } from '../net/gateway.js';
import { registerCombatHandlers } from '../net/handlers/combat.js';
import { InMemoryPlayerRepository } from '../persistence/repository.js';
import type { Session } from '../session/session-store.js';
const PLAYER = asId<PlayerId>('combat-player');
const SHORE_WOLF = 'int.combat.shore_wolf';
function session(): Session {
  return {
    id: asId<SessionId>('combat-session'),
    playerId: PLAYER,
    resumeToken: 'combat-token',
    createdAtMs: 0,
    disconnectedAtMs: null,
    lastClientSeq: 0,
  };
}
function harness() {
  let clock = 1_000_000;
  let position: { x: number; z: number } | null = { x: 0, z: 12.8 };
  const players = new PlayerService({
    repository: new InMemoryPlayerRepository(() => clock),
    slotCapacity: DEFAULT_TUNABLES.gathering.baseInventorySlots,
    now: () => clock,
  });
  const router = new RegistryCommandRouter();
  registerCombatHandlers(router, {
    players,
    items: ITEM_CATALOG,
    now: () => clock,
    tickMs: DEFAULT_TUNABLES.combat.tickMs,
    interactionRadius: DEFAULT_TUNABLES.world.interactionRadius,
    currencyCap: DEFAULT_TUNABLES.economy.currencyCap,
    skills: SKILL_TABLE,
    progression: DEFAULT_TUNABLES.progression,
    combatXpPerDamage: DEFAULT_TUNABLES.combat.combatXpPerDamage,
    positionFor: () => position,
  });
  return {
    dispatch: (
      interactableId = SHORE_WOLF,
      style: 'ACCURATE' | 'AGGRESSIVE' | 'DEFENSIVE' = 'ACCURATE',
    ) => router.dispatch(session(), 'combat.attack', { interactableId, style }),
    recover: () => router.dispatch(session(), 'combat.recover', {}),
    moveTo: (p: { x: number; z: number } | null) => {
      position = p;
    },
    advance: (ms: number) => {
      clock += ms;
    },
    async state() {
      const r = await players.load(PLAYER);
      if (!r.ok) throw Error(r.error.reason);
      return r.value;
    },
  };
}
describe('Shore Wolf combat handlers', () => {
  it('rejects remote attacks', async () => {
    const h = harness();
    h.moveTo({ x: 20, z: 20 });
    const r = await h.dispatch();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.reason).toBe('combat.out_of_range');
  });
  it('rejects a non-combat interactable', async () => {
    const h = harness();
    const r = await h.dispatch('int.node.mushroom');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.reason).toBe('combat.not_an_encounter');
  });
  it('awards confirmed Combat XP and reports the selected style', async () => {
    const h = harness();
    expect(await h.dispatch(SHORE_WOLF, 'DEFENSIVE')).toMatchObject({
      ok: true,
      value: { combat: { damage: 1, combatXpGained: 4, style: 'DEFENSIVE' } },
    });
    expect((await h.state()).skills['skill.combat']).toEqual({ level: 1, xp: 4 });
  });
  it('enforces cooldowns', async () => {
    const h = harness();
    await h.dispatch();
    const r = await h.dispatch();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.reason).toBe('combat.cooldown');
    h.advance(DEFAULT_TUNABLES.combat.tickMs);
    expect((await h.dispatch()).ok).toBe(true);
  });
  it('awards guaranteed raw meat on the gentle first defeat', async () => {
    const h = harness();
    let result: unknown;
    for (let i = 0; i < 4; i += 1) {
      result = await h.dispatch();
      h.advance(DEFAULT_TUNABLES.combat.tickMs);
    }
    expect(result).toMatchObject({
      ok: true,
      value: {
        combat: {
          defeated: true,
          coinsGained: 6,
          drops: [{ itemId: 'item.meat.raw_shore_wolf', quantity: 1 }],
        },
      },
    });
    expect((await h.state()).inventory.stacks).toContainEqual({
      definitionId: 'item.meat.raw_shore_wolf',
      quantity: 1,
    });
  });
});
