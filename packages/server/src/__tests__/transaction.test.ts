import { describe, expect, it } from 'vitest';
import { asId, err, failure, FailureCode, ok, type PlayerId } from '@arcanum/shared';
import { InMemoryPlayerRepository, type PlayerStore } from '../persistence/repository.js';

const ALICE = asId<PlayerId>('alice');
const BOB = asId<PlayerId>('bob');

function record(playerId: PlayerId, coins: number) {
  return { playerId, schemaVersion: 1, data: { coins } };
}

async function seed(repository: InMemoryPlayerRepository) {
  await repository.create(record(ALICE, 100));
  await repository.create(record(BOB, 0));
}

async function coinsOf(store: PlayerStore, playerId: PlayerId): Promise<number> {
  const found = await store.find(playerId);
  if (!found.ok || found.value === null) throw new Error('missing record');
  return found.value.data.coins as number;
}

/** Moves coins between two records, which is the shape every trade has. */
async function transfer(store: PlayerStore, amount: number) {
  const from = await store.find(ALICE);
  const to = await store.find(BOB);
  if (!from.ok || !to.ok || from.value === null || to.value === null) {
    return err(failure(FailureCode.NotFound, 'missing'));
  }
  const held = from.value.data.coins as number;
  if (held < amount) {
    return err(failure(FailureCode.Conflict, 'insufficient'));
  }
  const debited = await store.save(record(ALICE, held - amount), from.value.version);
  if (!debited.ok) return err(debited.error);
  const credited = await store.save(
    record(BOB, (to.value.data.coins as number) + amount),
    to.value.version,
  );
  if (!credited.ok) return err(credited.error);
  return ok(amount);
}

describe('transactional writes', () => {
  it('commits every write together', async () => {
    const repository = new InMemoryPlayerRepository();
    await seed(repository);

    const result = await repository.transaction((tx) => transfer(tx, 40));
    expect(result.ok).toBe(true);
    expect(await coinsOf(repository, ALICE)).toBe(60);
    expect(await coinsOf(repository, BOB)).toBe(40);
  });

  it('rolls back a write already made when the rule then refuses', async () => {
    const repository = new InMemoryPlayerRepository();
    await seed(repository);

    // Debits Alice, then refuses. Without a transaction this is exactly how a
    // player loses assets that never reach anyone.
    const result = await repository.transaction(async (tx) => {
      const from = await tx.find(ALICE);
      if (!from.ok || from.value === null) return err(failure(FailureCode.NotFound, 'missing'));
      await tx.save(record(ALICE, 0), from.value.version);
      return err(failure(FailureCode.Conflict, 'trade.refused'));
    });

    expect(result.ok).toBe(false);
    expect(await coinsOf(repository, ALICE)).toBe(100);
  });

  it('rolls back on a thrown error too, then rethrows it', async () => {
    const repository = new InMemoryPlayerRepository();
    await seed(repository);

    await expect(
      repository.transaction(async (tx) => {
        const from = await tx.find(ALICE);
        if (!from.ok || from.value === null) return err(failure(FailureCode.NotFound, 'missing'));
        await tx.save(record(ALICE, 0), from.value.version);
        throw new Error('connection lost mid-trade');
      }),
    ).rejects.toThrow('connection lost mid-trade');

    expect(await coinsOf(repository, ALICE)).toBe(100);
  });

  it('never leaves assets in two places at once', async () => {
    const repository = new InMemoryPlayerRepository();
    await seed(repository);

    // Whatever happens, the total is conserved. Duplication is the failure
    // that matters: in a game with a market it is a currency printer.
    for (const amount of [30, 30, 30, 30]) {
      await repository.transaction((tx) => transfer(tx, amount));
      const total = (await coinsOf(repository, ALICE)) + (await coinsOf(repository, BOB));
      expect(total).toBe(100);
    }
  });

  it('serialises concurrent transactions rather than losing one', async () => {
    const repository = new InMemoryPlayerRepository();
    await seed(repository);

    // Both read before either writes if transactions interleave, and one
    // transfer vanishes. Serialising is what stops that.
    const results = await Promise.all([
      repository.transaction((tx) => transfer(tx, 25)),
      repository.transaction((tx) => transfer(tx, 25)),
      repository.transaction((tx) => transfer(tx, 25)),
    ]);

    const succeeded = results.filter((result) => result.ok).length;
    expect(succeeded).toBe(3);
    expect(await coinsOf(repository, ALICE)).toBe(25);
    expect(await coinsOf(repository, BOB)).toBe(75);
  });

  it('refuses an overdraft without touching either record', async () => {
    const repository = new InMemoryPlayerRepository();
    await seed(repository);

    const result = await repository.transaction((tx) => transfer(tx, 500));
    expect(result.ok).toBe(false);
    expect(await coinsOf(repository, ALICE)).toBe(100);
    expect(await coinsOf(repository, BOB)).toBe(0);
  });

  it('leaves a later transaction seeing the earlier one committed', async () => {
    const repository = new InMemoryPlayerRepository();
    await seed(repository);
    await repository.transaction((tx) => transfer(tx, 10));
    const second = await repository.transaction(async (tx) => ok(await coinsOf(tx, ALICE)));
    expect(second.ok && second.value).toBe(90);
  });
});
