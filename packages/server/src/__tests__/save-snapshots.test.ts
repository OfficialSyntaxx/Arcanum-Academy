import { describe, expect, it } from 'vitest';
import { asId, err, failure, FailureCode, type PlayerId } from '@alderfell/shared';
import { InMemoryPlayerRepository, SAVE_SNAPSHOT_RETENTION } from '../persistence/repository.js';

const PLAYER = asId<PlayerId>('snapshot-player');
const OTHER = asId<PlayerId>('other-player');
const record = (coins: number) => ({ playerId: PLAYER, schemaVersion: 9, data: { coins } });

describe('save snapshots', () => {
  it('captures the exact previous state before every successful save', async () => {
    const repository = new InMemoryPlayerRepository(() => 100);
    const created = await repository.create(record(10));
    if (!created.ok) throw new Error(created.error.reason);
    await repository.save(record(20), created.value.version);
    const snapshots = await repository.listSnapshots(PLAYER);
    expect(snapshots.ok && snapshots.value).toMatchObject([
      { sourceVersion: 1, schemaVersion: 9, reason: 'SAVE', data: { coins: 10 } },
    ]);
  });

  it('does not capture a snapshot for a refused stale write', async () => {
    const repository = new InMemoryPlayerRepository();
    await repository.create(record(10));
    expect((await repository.save(record(99), 50)).ok).toBe(false);
    const snapshots = await repository.listSnapshots(PLAYER);
    expect(snapshots.ok && snapshots.value).toHaveLength(0);
  });

  it('retains only the newest bounded history for each account', async () => {
    const repository = new InMemoryPlayerRepository();
    let current = await repository.create(record(0));
    if (!current.ok) throw new Error(current.error.reason);
    for (let coins = 1; coins <= SAVE_SNAPSHOT_RETENTION + 5; coins += 1) {
      current = await repository.save(record(coins), current.value.version);
      if (!current.ok) throw new Error(current.error.reason);
    }
    const snapshots = await repository.listSnapshots(PLAYER);
    if (!snapshots.ok) throw new Error(snapshots.error.reason);
    expect(snapshots.value).toHaveLength(SAVE_SNAPSHOT_RETENTION);
    expect(snapshots.value[0]?.data.coins).toBe(SAVE_SNAPSHOT_RETENTION + 4);
    expect(snapshots.value.at(-1)?.data.coins).toBe(5);
  });

  it('restores atomically, preserves the displaced save, and appends an audit receipt', async () => {
    let now = 100;
    const repository = new InMemoryPlayerRepository(() => now++);
    const created = await repository.create(record(10));
    if (!created.ok) throw new Error(created.error.reason);
    const changed = await repository.save(record(80), created.value.version);
    if (!changed.ok) throw new Error(changed.error.reason);
    const snapshots = await repository.listSnapshots(PLAYER);
    if (!snapshots.ok) throw new Error(snapshots.error.reason);
    const restored = await repository.restoreSnapshot({
      playerId: PLAYER,
      snapshotId: snapshots.value[0]!.id,
      expectedVersion: changed.value.version,
      actor: 'operator@example.test',
      reason: 'Player reported an accidental destructive action',
    });
    if (!restored.ok) throw new Error(restored.error.reason);
    expect(restored.value.record).toMatchObject({ version: 3, data: { coins: 10 } });
    expect(restored.value.audit).toMatchObject({ beforeVersion: 2, afterVersion: 3 });
    const after = await repository.listSnapshots(PLAYER);
    expect(after.ok && after.value[0]).toMatchObject({
      reason: 'PRE_RESTORE',
      data: { coins: 80 },
    });
    const audit = await repository.listRestoreAudit(PLAYER);
    expect(audit.ok && audit.value).toEqual([restored.value.audit]);
  });

  it('refuses stale or unaudited restoration without changing live state', async () => {
    const repository = new InMemoryPlayerRepository();
    const created = await repository.create(record(10));
    if (!created.ok) throw new Error(created.error.reason);
    const changed = await repository.save(record(20), created.value.version);
    if (!changed.ok) throw new Error(changed.error.reason);
    const snapshots = await repository.listSnapshots(PLAYER);
    if (!snapshots.ok) throw new Error(snapshots.error.reason);
    const id = snapshots.value[0]!.id;
    expect(
      (
        await repository.restoreSnapshot({
          playerId: PLAYER,
          snapshotId: id,
          expectedVersion: 1,
          actor: 'op',
          reason: 'repair',
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await repository.restoreSnapshot({
          playerId: PLAYER,
          snapshotId: id,
          expectedVersion: 2,
          actor: '',
          reason: '',
        })
      ).ok,
    ).toBe(false);
    const live = await repository.find(PLAYER);
    expect(live.ok && live.value?.data.coins).toBe(20);
  });

  it('never restores a snapshot across account ownership boundaries', async () => {
    const repository = new InMemoryPlayerRepository();
    const created = await repository.create(record(10));
    if (!created.ok) throw new Error(created.error.reason);
    await repository.save(record(20), created.value.version);
    await repository.create({ playerId: OTHER, schemaVersion: 9, data: { coins: 5 } });
    const snapshots = await repository.listSnapshots(PLAYER);
    if (!snapshots.ok) throw new Error(snapshots.error.reason);
    const result = await repository.restoreSnapshot({
      playerId: OTHER,
      snapshotId: snapshots.value[0]!.id,
      expectedVersion: 1,
      actor: 'operator',
      reason: 'test ownership boundary',
    });
    expect(result.ok).toBe(false);
    const other = await repository.find(OTHER);
    expect(other.ok && other.value?.data.coins).toBe(5);
  });

  it('rolls back snapshots along with a refused transaction', async () => {
    const repository = new InMemoryPlayerRepository();
    const created = await repository.create(record(10));
    if (!created.ok) throw new Error(created.error.reason);
    const result = await repository.transaction(async (tx) => {
      await tx.save(record(99), created.value.version);
      return err(failure(FailureCode.Conflict, 'operation.refused'));
    });
    expect(result.ok).toBe(false);
    const snapshots = await repository.listSnapshots(PLAYER);
    expect(snapshots.ok && snapshots.value).toHaveLength(0);
    const live = await repository.find(PLAYER);
    expect(live.ok && live.value?.data.coins).toBe(10);
  });
});
