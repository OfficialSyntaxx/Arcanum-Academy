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
import {
  COURTYARD,
  FOREST,
  MOUNTAINS,
  SNOW,
  SALTWAKE_RUINS,
  COMBAT_ENCOUNTERS,
  combatEncounterByInteractable,
} from '@alderfell/shared';
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
    /** Attacks tick by tick until one strike lands for damage; returns that strike. */
    async strikeUntilDamage(
      interactableId: string,
      style: 'ACCURATE' | 'AGGRESSIVE' | 'DEFENSIVE' = 'ACCURATE',
    ) {
      for (let i = 0; i < 200; i += 1) {
        const r = await router.dispatch(session(), 'combat.attack', { interactableId, style });
        if (!r.ok) throw Error(r.error.reason);
        const combat = (r.value as { combat: { damage: number; defeated: boolean } }).combat;
        if (combat.damage > 0) return combat;
        clock += DEFAULT_TUNABLES.combat.tickMs;
      }
      throw Error('no damage landed in 200 ticks');
    },
    /** Fights tick by tick until the creature falls; returns the defeating result. */
    async fightUntilDefeated(interactableId: string) {
      for (let i = 0; i < 400; i += 1) {
        const r = await router.dispatch(session(), 'combat.attack', {
          interactableId,
          style: 'ACCURATE',
        });
        if (!r.ok) throw Error(r.error.reason);
        if ((r.value as { combat: { defeated: boolean } }).combat.defeated) return r;
        clock += DEFAULT_TUNABLES.combat.tickMs;
        // A healthy player should always outlast the starter creatures here.
        const state = await players.load(PLAYER);
        if (state.ok && state.value.hitpoints.current <= 0) throw Error('player fell');
      }
      throw Error('creature not defeated in 400 ticks');
    },
    /** Fights until the creature lands the killing blow on the player. */
    async fightUntilPlayerFalls(interactableId: string) {
      for (let i = 0; i < 400; i += 1) {
        const r = await router.dispatch(session(), 'combat.attack', {
          interactableId,
          style: 'ACCURATE',
        });
        if (!r.ok) throw Error(r.error.reason);
        const value = r.value as {
          hitpoints: { current: number };
          combat: { defeated: boolean };
        };
        if (value.hitpoints.current <= 0) return r;
        if (value.combat.defeated) {
          clock += 4_000;
          continue;
        }
        clock += DEFAULT_TUNABLES.combat.tickMs;
      }
      throw Error('player did not fall in 400 ticks');
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
  it("accepts an attack from the encounter's own approach waypoint", async () => {
    // The player walks to the authored approach point, not onto the creature.
    // For the Shore Wolf that is wp.duel.entry at (0, 14) against a creature
    // at (0, 12.8): 1.2 m, comfortably inside the 2.2 m interaction radius.
    // Authoring a creature further than that from its approach point would
    // make it unattackable by walking up to it, which is the normal way to
    // start a fight.
    const h = harness();
    h.moveTo({ x: 0, z: 14 });
    expect((await h.dispatch()).ok).toBe(true);
  });
  it('keeps every authored encounter inside reach of its approach waypoint', () => {
    const radius = DEFAULT_TUNABLES.world.interactionRadius;
    const problems: string[] = [];
    for (const zone of [COURTYARD, FOREST, MOUNTAINS, SNOW, SALTWAKE_RUINS]) {
      const waypoints = new Map(zone.waypoints.map((w) => [w.id as string, w]));
      for (const interactable of zone.interactables) {
        const encounter = combatEncounterByInteractable(interactable.id);
        if (encounter === undefined) continue;
        const approach = waypoints.get(interactable.approach as string);
        if (approach === undefined) {
          problems.push(`${interactable.id} has no approach waypoint`);
          continue;
        }
        const distance = Math.hypot(
          approach.position.x - encounter.position.x,
          approach.position.z - encounter.position.z,
        );
        if (distance > radius) {
          problems.push(`${interactable.id} is ${distance.toFixed(2)}m from its approach point`);
        }
      }
    }
    expect(problems, problems.join('; ')).toEqual([]);
  });
  it('rejects a non-combat interactable', async () => {
    const h = harness();
    const r = await h.dispatch('int.node.mushroom');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.reason).toBe('combat.not_an_encounter');
  });
  it('awards Defence and Hitpoints XP per point of damage on a defensive strike', async () => {
    const h = harness();
    const { damage } = await h.strikeUntilDamage(SHORE_WOLF, 'DEFENSIVE');
    expect(damage).toBeGreaterThan(0);
    const state = await h.state();
    expect(state.skills['skill.defence']).toEqual({ level: 1, xp: damage * 4 });
    expect(state.skills['skill.hitpoints']).toEqual({ level: 1, xp: damage });
  });
  it.each([
    ['ACCURATE', 'skill.attack'],
    ['AGGRESSIVE', 'skill.strength'],
    ['DEFENSIVE', 'skill.defence'],
  ] as const)('awards the selected %s style skill', async (style, skillId) => {
    const h = harness();
    const { damage } = await h.strikeUntilDamage(SHORE_WOLF, style);
    expect((await h.state()).skills[skillId]).toEqual({ level: 1, xp: damage * 4 });
  });
  it('rolls both sides every tick and never accepts browser-supplied damage', async () => {
    const h = harness();
    const first = await h.dispatch();
    expect(first).toMatchObject({
      ok: true,
      value: { combat: { style: 'ACCURATE', styleSkillId: 'skill.attack' } },
    });
    if (!first.ok) return;
    const combat = (first.value as { combat: Record<string, unknown> }).combat;
    expect(combat['damage']).toBe(combat['rolledDamage']);
    expect(typeof combat['enemyHit']).toBe('boolean');
    expect(combat['enemyDamage']).toBeGreaterThanOrEqual(0);
    expect(combat['enemyDamage']).toBeLessThanOrEqual(1);
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
    const result = await h.fightUntilDefeated(SHORE_WOLF);
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
    const result = await h.fightUntilDefeated(EMBERWING_ARMABEE);
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
    await h.fightUntilDefeated(SHORE_WOLF);
    h.advance(4_000);
    await h.fightUntilDefeated(SHORE_WOLF);
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
    expect(await h.fightUntilPlayerFalls(SHORE_WOLF)).toMatchObject({
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

describe('rare drop awards', () => {
  it('eventually pays the Sentinel ingot and never pays it outside a defeat', async () => {
    // The award path is worth exercising for real: a rare drop that rolls but
    // is never added to the satchel looks identical to bad luck.
    const h = harness();
    h.moveTo({ x: 0, z: -5 });
    await h.enterSaltwake();
    let ingots = 0;
    let defeats = 0;
    // 1/12 per kill: 60 kills makes a miss a genuine failure, not variance.
    for (let kill = 0; kill < 60 && ingots === 0; kill += 1) {
      let defeated = false;
      while (!defeated) {
        const strike = await h.dispatch(DROWNED_SENTINEL, 'DEFENSIVE');
        expect(strike.ok).toBe(true);
        if (strike.ok) {
          const value = strike.value as {
            combat: { defeated: boolean };
            drops?: readonly { itemId: string }[];
          };
          defeated = value.combat.defeated;
          if (!defeated) expect(value.drops ?? []).toEqual([]);
        }
        h.advance(DEFAULT_TUNABLES.combat.tickMs);
      }
      defeats += 1;
      h.advance(12_000);
      const stacks = (await h.state()).inventory.stacks;
      ingots = stacks.find((stack) => stack.definitionId === 'item.ingot.resonant')?.quantity ?? 0;
    }
    expect(defeats).toBeGreaterThan(0);
    expect(ingots).toBeGreaterThan(0);
  });
});

describe('rare drop tables', () => {
  it('names a real item and a sane chance on every rare drop', () => {
    const problems: string[] = [];
    for (const encounter of COMBAT_ENCOUNTERS) {
      for (const rare of encounter.rareDrops ?? []) {
        if (ITEM_CATALOG.get(rare.itemId) === undefined) {
          problems.push(`${encounter.label}: unknown item "${rare.itemId}"`);
        }
        // A denominator of one is a guaranteed drop wearing the wrong hat, and
        // a non-integer or negative one makes the roll meaningless.
        if (!Number.isInteger(rare.oneInChance) || rare.oneInChance < 2) {
          problems.push(`${encounter.label}: bad chance 1/${String(rare.oneInChance)}`);
        }
        if (rare.quantity < 1) {
          problems.push(`${encounter.label}: bad quantity ${String(rare.quantity)}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('keeps rare drops out of the guaranteed table', () => {
    // A creature that both guarantees and rolls the same item would pay it
    // twice on a lucky kill, which reads as a duplication bug.
    for (const encounter of COMBAT_ENCOUNTERS) {
      const guaranteed = new Set(encounter.drops.map((drop) => String(drop.itemId)));
      for (const rare of encounter.rareDrops ?? []) {
        expect(guaranteed.has(String(rare.itemId))).toBe(false);
      }
    }
  });
});
