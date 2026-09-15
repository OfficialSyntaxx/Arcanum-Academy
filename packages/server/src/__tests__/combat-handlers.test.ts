import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TUNABLES,
  ITEM_CATALOG,
  QuestStatus,
  SKILL_TABLE,
  asId,
  type PlayerId,
  type SessionId,
  ok,
} from '@alderfell/shared';
import { addItems } from '@alderfell/sim';
import { PlayerService } from '../domain/player-service.js';
import { RegistryCommandRouter } from '../net/gateway.js';
import { registerCombatHandlers } from '../net/handlers/combat.js';
import { InMemoryPlayerRepository } from '../persistence/repository.js';
import type { Session } from '../session/session-store.js';
const PLAYER = asId<PlayerId>('combat-player');
const SHORE_WOLF = 'int.combat.shore_wolf';
const EMBERWING_ARMABEE = 'int.combat.emberwing_armabee';
const DROWNED_SENTINEL = 'int.combat.drowned_sentinel';
const DROWNED_WARDEN = 'int.combat.drowned_warden';
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
    hitpointsXpPerDamage: DEFAULT_TUNABLES.combat.hitpointsXpPerDamage,
    itemsKeptOnDeath: DEFAULT_TUNABLES.combat.itemsKeptOnDeath,
    graveExpiryMs: DEFAULT_TUNABLES.combat.graveExpiryMs,
    positionFor: () => position,
  });
  return {
    dispatch: (
      interactableId = SHORE_WOLF,
      style: 'ACCURATE' | 'AGGRESSIVE' | 'DEFENSIVE' = 'ACCURATE',
    ) => router.dispatch(session(), 'combat.attack', { interactableId, style }),
    recover: () => router.dispatch(session(), 'combat.recover', {}),
    reclaimGrave: () => router.dispatch(session(), 'combat.reclaim_grave', {}),
    eat: (itemId = 'item.meat.cooked_shore_wolf') =>
      router.dispatch(session(), 'combat.eat', { interactableId: SHORE_WOLF, itemId }),
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
    async grantCookedMeat() {
      const r = await players.update(PLAYER, (state) => {
        const inventory = addItems(
          state.inventory,
          'item.meat.cooked_shore_wolf' as Parameters<typeof addItems>[1],
          1,
          ITEM_CATALOG,
        );
        if (!inventory.ok) throw Error(inventory.error.reason);
        return ok({ state: { ...state, inventory: inventory.value }, value: undefined });
      });
      if (!r.ok) throw Error(r.error.reason);
    },
    async grant(itemId: Parameters<typeof addItems>[1], quantity: number) {
      const r = await players.update(PLAYER, (state) => {
        const inventory = addItems(state.inventory, itemId, quantity, ITEM_CATALOG);
        if (!inventory.ok) throw Error(inventory.error.reason);
        return ok({ state: { ...state, inventory: inventory.value }, value: undefined });
      });
      if (!r.ok) throw Error(r.error.reason);
    },
    async setHitpoints(current: number) {
      const r = await players.update(PLAYER, (state) =>
        ok({ state: { ...state, hitpoints: { ...state.hitpoints, current } }, value: undefined }),
      );
      if (!r.ok) throw Error(r.error.reason);
    },
    async activateFirstHunt() {
      const r = await players.update(PLAYER, (state) =>
        ok({
          state: {
            ...state,
            quests: {
              ...state.quests,
              'quest.first_hunt': {
                status: QuestStatus.Active,
                acceptedAtMs: clock,
                completedAtMs: null,
                objectiveCounts: {},
              },
            },
          },
          value: undefined,
        }),
      );
      if (!r.ok) throw Error(r.error.reason);
    },
    async enterSaltwake() {
      const progress = { level: 50, xp: 500_000 };
      const r = await players.update(PLAYER, (state) =>
        ok({
          state: {
            ...state,
            location: { zoneId: 'zone.saltwake_ruins', roomId: 'wp.saltwake.antechamber' },
            saltwake: { ...state.saltwake, enteredAtMs: clock },
            hitpoints: { current: 59, max: 59, respawnAtMs: null },
            skills: {
              ...state.skills,
              'skill.attack': progress,
              'skill.strength': progress,
              'skill.defence': progress,
              'skill.hitpoints': progress,
            },
            quests: {
              ...state.quests,
              'quest.beneath_the_saltline': {
                status: QuestStatus.Active,
                acceptedAtMs: clock,
                completedAtMs: null,
                objectiveCounts: {},
              },
            },
          },
          value: undefined,
        }),
      );
      if (!r.ok) throw Error(r.error.reason);
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
  it('awards Defence and Hitpoints XP for a defensive strike', async () => {
    const h = harness();
    expect(await h.dispatch(SHORE_WOLF, 'DEFENSIVE')).toMatchObject({
      ok: true,
      value: {
        combat: {
          damage: 1,
          combatXpGained: 4,
          hitpointsXpGained: 1,
          styleSkillId: 'skill.defence',
          style: 'DEFENSIVE',
        },
      },
    });
    expect((await h.state()).skills['skill.defence']).toEqual({ level: 1, xp: 4 });
    expect((await h.state()).skills['skill.hitpoints']).toEqual({ level: 1, xp: 1 });
  });
  it.each([
    ['ACCURATE', 'skill.attack'],
    ['AGGRESSIVE', 'skill.strength'],
    ['DEFENSIVE', 'skill.defence'],
  ] as const)('awards the selected %s style skill', async (style, skillId) => {
    const h = harness();
    await h.dispatch(SHORE_WOLF, style);
    expect((await h.state()).skills[skillId]).toEqual({ level: 1, xp: 4 });
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
    expect((await h.state()).discoveries).toHaveProperty('discovery.combat.shore_wolf');
  });
  it('resolves the distinct Emberwing Armabee encounter and awards wax', async () => {
    const h = harness();
    h.moveTo({ x: -7, z: 19 });
    let result: unknown;
    for (let i = 0; i < 5; i += 1) {
      result = await h.dispatch(EMBERWING_ARMABEE);
      h.advance(DEFAULT_TUNABLES.combat.tickMs);
    }
    expect(result).toMatchObject({
      ok: true,
      value: {
        combat: {
          label: 'Emberwing Armabee',
          defeated: true,
          coinsGained: 8,
          drops: [{ itemId: 'item.material.armabee_wax', quantity: 1 }],
        },
      },
    });
    expect((await h.state()).inventory.stacks).toContainEqual({
      definitionId: 'item.material.armabee_wax',
      quantity: 1,
    });
    expect((await h.state()).discoveries).toHaveProperty('discovery.combat.emberwing');
  });
  it('advances The First Hunt only for confirmed Shore Wolf defeats', async () => {
    const h = harness();
    await h.activateFirstHunt();
    for (let i = 0; i < 4; i += 1) {
      await h.dispatch();
      h.advance(DEFAULT_TUNABLES.combat.tickMs);
    }
    h.advance(4_000);
    for (let i = 0; i < 4; i += 1) {
      await h.dispatch();
      h.advance(DEFAULT_TUNABLES.combat.tickMs);
    }
    expect((await h.state()).quests['quest.first_hunt']?.objectiveCounts).toEqual({
      'hunt.shore_wolves': 2,
    });
  });
  it('eats cooked Shore Wolf Meat for 3 HP and spends one combat tick', async () => {
    const h = harness();
    await h.dispatch();
    await h.grantCookedMeat();
    expect(await h.eat()).toMatchObject({
      ok: true,
      value: {
        hitpoints: { current: 10, max: 10 },
        combat: {
          nextAttackAtMs: 1_000_600,
          foodConsumed: { itemId: 'item.meat.cooked_shore_wolf', healAmount: 3 },
        },
      },
    });
    expect((await h.state()).inventory.stacks).not.toContainEqual({
      definitionId: 'item.meat.cooked_shore_wolf',
      quantity: 1,
    });
    const blocked = await h.dispatch();
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.reason).toBe('combat.cooldown');
  });
  it('keeps the three most valuable items and restores the grave only in range', async () => {
    const h = harness();
    await h.grant('item.crystal.prismatic' as Parameters<typeof addItems>[1], 1);
    await h.grant('item.crystal.resonant' as Parameters<typeof addItems>[1], 2);
    await h.grant('item.crystal.shard' as Parameters<typeof addItems>[1], 3);
    await h.setHitpoints(1);
    expect(await h.dispatch()).toMatchObject({
      ok: true,
      value: { grave: { stacks: [{ definitionId: 'item.crystal.shard', quantity: 3 }] } },
    });
    let state = await h.state();
    expect(state.inventory.stacks).toEqual([
      { definitionId: 'item.crystal.prismatic', quantity: 1 },
      { definitionId: 'item.crystal.resonant', quantity: 2 },
    ]);
    h.advance(DEFAULT_TUNABLES.combat.tickMs + 5_000);
    expect((await h.recover()).ok).toBe(true);
    h.moveTo({ x: 20, z: 20 });
    const remote = await h.reclaimGrave();
    expect(remote.ok).toBe(false);
    if (!remote.ok) expect(remote.error.reason).toBe('combat.grave_out_of_range');
    h.moveTo({ x: 0, z: 12.8 });
    expect(await h.reclaimGrave()).toMatchObject({ ok: true, value: { grave: null } });
    state = await h.state();
    expect(state.grave).toBeNull();
    expect(state.discoveries).toHaveProperty('discovery.recovery.grave');
    expect(state.inventory.stacks).toContainEqual({
      definitionId: 'item.crystal.shard',
      quantity: 3,
    });
  });
  it('rejects inventory materials that are not combat food', async () => {
    const h = harness();
    await h.dispatch();
    const result = await h.eat('item.meat.raw_shore_wolf');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.reason).toBe('combat.not_food');
  });
});

describe('Saltwake combat lifecycle', () => {
  it('gates the Warden behind a confirmed gallery clear and persists both defeats', async () => {
    const h = harness();
    h.moveTo({ x: 0, z: -5 });
    await h.enterSaltwake();

    h.moveTo({ x: 0, z: 6.5 });
    const earlyBoss = await h.dispatch(DROWNED_WARDEN);
    expect(earlyBoss.ok).toBe(false);
    if (!earlyBoss.ok) expect(earlyBoss.error.reason).toBe('combat.gallery_not_cleared');

    h.moveTo({ x: 0, z: -5 });
    let sentinelDefeated = false;
    while (!sentinelDefeated) {
      const strike = await h.dispatch(DROWNED_SENTINEL, 'DEFENSIVE');
      expect(strike.ok).toBe(true);
      if (strike.ok)
        sentinelDefeated = (strike.value as { combat: { defeated: boolean } }).combat.defeated;
      h.advance(DEFAULT_TUNABLES.combat.tickMs);
    }
    expect((await h.state()).saltwake.galleryCleared).toBe(true);

    h.moveTo({ x: 0, z: 6.5 });
    let bossDefeated = false;
    let sawSecondPhase = false;
    while (!bossDefeated) {
      const strike = await h.dispatch(DROWNED_WARDEN, 'DEFENSIVE');
      expect(strike.ok).toBe(true);
      if (strike.ok) {
        const combat = (strike.value as { combat: { defeated: boolean; bossPhase?: number } })
          .combat;
        bossDefeated = combat.defeated;
        sawSecondPhase ||= combat.bossPhase === 2;
      }
      h.advance(DEFAULT_TUNABLES.combat.tickMs);
    }
    const state = await h.state();
    expect(sawSecondPhase).toBe(true);
    expect(state.saltwake.bossDefeated).toBe(true);
    expect(state.quests['quest.beneath_the_saltline']?.objectiveCounts).toMatchObject({
      'saltline.sentinel': 1,
      'saltline.warden': 1,
    });
    expect(state.discoveries).toHaveProperty('discovery.dungeon.warden');
  });
});
