import { describe, expect, it } from 'vitest';
import { asId, type PlayerId, type SessionId } from '@arcanum/shared';
import { PresenceService } from '../domain/presence.js';

function harness(overrides: { radius?: number; maxNeighbours?: number } = {}) {
  let clock = 1_000;
  const presence = new PresenceService({
    radius: overrides.radius ?? 40,
    maxNeighbours: overrides.maxNeighbours ?? 24,
    staleAfterMs: 5_000,
    now: () => clock,
  });
  return {
    presence,
    advance: (ms: number) => {
      clock += ms;
    },
    place(id: string, x: number, z: number) {
      return presence.update(asId<SessionId>(id), asId<PlayerId>(`player-${id}`), {
        x,
        z,
        facing: 0,
      });
    },
    near(id: string) {
      return presence.neighbours(asId<SessionId>(id)).map((entry) => entry.sessionId);
    },
  };
}

describe('presence', () => {
  it('reports nobody when alone', () => {
    const h = harness();
    h.place('a', 0, 0);
    expect(h.near('a')).toEqual([]);
  });

  it('reports a nearby player to each of them', () => {
    const h = harness();
    h.place('a', 0, 0);
    h.place('b', 5, 0);
    expect(h.near('a')).toEqual(['b']);
    expect(h.near('b')).toEqual(['a']);
  });

  it('never reports a session to itself', () => {
    const h = harness();
    h.place('a', 0, 0);
    expect(h.near('a')).not.toContain('a');
  });

  it('omits anyone past the radius', () => {
    const h = harness({ radius: 10 });
    h.place('a', 0, 0);
    h.place('far', 11, 0);
    expect(h.near('a')).toEqual([]);
    // Exactly on the boundary is inside it.
    h.place('edge', 10, 0);
    expect(h.near('a')).toEqual(['edge']);
  });

  it('orders by distance, nearest first', () => {
    const h = harness();
    h.place('a', 0, 0);
    h.place('far', 20, 0);
    h.place('near', 2, 0);
    h.place('middle', 8, 0);
    expect(h.near('a')).toEqual(['near', 'middle', 'far']);
  });

  it('breaks a tie on session id rather than map order', () => {
    // Two clients asking at the same moment must be told the same thing.
    const h = harness();
    h.place('a', 0, 0);
    h.place('zzz', 3, 0);
    h.place('bbb', 0, 3);
    expect(h.near('a')).toEqual(['bbb', 'zzz']);
  });

  it('caps the crowd however many are standing on one tile', () => {
    const h = harness({ maxNeighbours: 3 });
    h.place('a', 0, 0);
    for (let n = 0; n < 40; n += 1) h.place(`crowd-${n}`, 1, 1);
    expect(h.near('a')).toHaveLength(3);
  });

  it('drops a player who walks out immediately', () => {
    const h = harness();
    h.place('a', 0, 0);
    h.place('b', 1, 0);
    h.presence.leave(asId<SessionId>('b'));
    expect(h.near('a')).toEqual([]);
  });

  it('treats a silent player as gone once stale', () => {
    const h = harness();
    h.place('a', 0, 0);
    h.place('b', 1, 0);
    h.advance(6_000);
    // 'a' refreshes; 'b' has said nothing and is no longer reported.
    h.place('a', 0, 0);
    expect(h.near('a')).toEqual([]);
  });

  it('sweeps stale entries out rather than growing forever', () => {
    const h = harness();
    for (let n = 0; n < 10; n += 1) h.place(`s-${n}`, n, 0);
    expect(h.presence.size).toBe(10);
    h.advance(6_000);
    expect(h.presence.sweep()).toBe(10);
    expect(h.presence.size).toBe(0);
  });

  it('refuses a non-finite position rather than storing it', () => {
    const h = harness();
    // NaN propagates through every comparison it touches, which would make a
    // player invisible rather than obviously broken.
    expect(h.place('a', Number.NaN, 0)).toBe(false);
    expect(h.place('b', 0, Number.POSITIVE_INFINITY)).toBe(false);
    expect(h.presence.size).toBe(0);
  });

  it('moves a player rather than duplicating them', () => {
    const h = harness();
    h.place('a', 0, 0);
    h.place('b', 1, 0);
    h.place('b', 2, 0);
    expect(h.presence.size).toBe(2);
    expect(h.near('a')).toEqual(['b']);
  });
});
