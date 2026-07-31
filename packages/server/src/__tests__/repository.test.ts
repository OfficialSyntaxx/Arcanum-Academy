import { describe, expect, it } from 'vitest';
import { asId, type PlayerId } from '@arcanum/shared';
import { InMemoryPlayerRepository } from '../persistence/repository.js';

const playerId = asId<PlayerId>('player-1');

describe('InMemoryPlayerRepository', () => {
  it('returns null for an unknown player', async () => {
    const repo = new InMemoryPlayerRepository();
    const result = await repo.find(playerId);
    expect(result.ok && result.value).toBeNull();
  });

  it('creates and reads back a record', async () => {
    const repo = new InMemoryPlayerRepository();
    const created = await repo.create({ playerId, schemaVersion: 1, data: { gold: 5 } });
    expect(created.ok).toBe(true);
    const found = await repo.find(playerId);
    expect(found.ok && found.value?.data.gold).toBe(5);
  });

  it('refuses to create the same player twice', async () => {
    const repo = new InMemoryPlayerRepository();
    await repo.create({ playerId, schemaVersion: 1, data: {} });
    const second = await repo.create({ playerId, schemaVersion: 1, data: {} });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.reason).toBe('repository.already_exists');
  });

  it('increments the version on every save', async () => {
    const repo = new InMemoryPlayerRepository();
    await repo.create({ playerId, schemaVersion: 1, data: {} });
    const saved = await repo.save({ playerId, schemaVersion: 1, data: { gold: 1 } }, 1);
    expect(saved.ok && saved.value.version).toBe(2);
  });

  it('rejects a stale write from a second device', async () => {
    const repo = new InMemoryPlayerRepository();
    await repo.create({ playerId, schemaVersion: 1, data: {} });
    await repo.save({ playerId, schemaVersion: 1, data: { gold: 1 } }, 1);
    const stale = await repo.save({ playerId, schemaVersion: 1, data: { gold: 99 } }, 1);
    expect(stale.ok).toBe(false);
    if (stale.ok) return;
    expect(stale.error.reason).toBe('repository.version_conflict');
    const current = await repo.find(playerId);
    expect(current.ok && current.value?.data.gold).toBe(1);
  });

  it('reports a save to a missing record', async () => {
    const repo = new InMemoryPlayerRepository();
    const result = await repo.save({ playerId, schemaVersion: 1, data: {} }, 1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.reason).toBe('repository.not_found');
  });
});
