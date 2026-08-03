import { describe, expect, it } from 'vitest';
import { asId, type PlayerId } from '@arcanum/shared';
import { Matchmaker, applyRating, expectedScore, STARTING_RATING } from '../domain/matchmaking.js';

function harness(
  overrides: Partial<{ baseSpread: number; spreadPerSecond: number; maxSpread: number }> = {},
) {
  let clock = 0;
  const matchmaker = new Matchmaker({
    baseSpread: overrides.baseSpread ?? 100,
    spreadPerSecond: overrides.spreadPerSecond ?? 50,
    maxSpread: overrides.maxSpread ?? 600,
    now: () => clock,
  });
  return {
    matchmaker,
    advance: (ms: number) => {
      clock += ms;
    },
    join: (id: string, rating: number) => matchmaker.join(asId<PlayerId>(id), 'deck.1', rating),
  };
}

describe('queueing', () => {
  it('waits when nobody else is queued', () => {
    const h = harness();
    const result = h.join('a', STARTING_RATING);
    expect(result.ok && result.value).toBeNull();
    expect(h.matchmaker.queued).toBe(1);
  });

  it('pairs two players of similar rating at once', () => {
    const h = harness();
    h.join('a', 1_200);
    const result = h.join('b', 1_230);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === null) throw new Error('expected a match');
    expect(result.value.participants).toContain(asId<PlayerId>('a'));
    expect(result.value.participants).toContain(asId<PlayerId>('b'));
    // Both leave the queue, so neither is matched twice.
    expect(h.matchmaker.queued).toBe(0);
  });

  it('refuses to queue the same player twice', () => {
    const h = harness();
    h.join('a', 1_200);
    const again = h.join('a', 1_200);
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.reason).toBe('match.already_queued');
  });

  it('leaves a far-apart pair waiting rather than forcing a mismatch', () => {
    const h = harness({ baseSpread: 50, spreadPerSecond: 0 });
    h.join('a', 1_000);
    const result = h.join('b', 1_900);
    expect(result.ok && result.value).toBeNull();
    expect(h.matchmaker.queued).toBe(2);
  });

  it('widens the gap it accepts the longer someone waits', () => {
    const h = harness({ baseSpread: 50, spreadPerSecond: 100, maxSpread: 1_000 });
    h.join('a', 1_000);
    // A fair match you never get is worse than a slightly uneven one now.
    h.advance(10_000);
    const result = h.join('b', 1_400);
    expect(result.ok && result.value).not.toBeNull();
  });

  it('lets a long wait carry a newcomer who would not have accepted alone', () => {
    const h = harness({ baseSpread: 20, spreadPerSecond: 100, maxSpread: 5_000 });
    h.join('patient', 1_000);
    h.advance(30_000);
    // The newcomer's own range is narrow, but the waiting player has earned a
    // wide one. Requiring both would starve the queue.
    const result = h.join('newcomer', 2_500);
    expect(result.ok && result.value).not.toBeNull();
  });

  it('never exceeds the ceiling however long the wait', () => {
    const h = harness({ baseSpread: 10, spreadPerSecond: 1_000, maxSpread: 200 });
    h.join('a', 1_000);
    h.advance(600_000);
    const result = h.join('b', 5_000);
    expect(result.ok && result.value).toBeNull();
  });

  it('pairs the nearest rating rather than the first in the queue', () => {
    const h = harness();
    // Far enough apart not to pair with each other on arrival, both within
    // reach of the seeker.
    h.join('far', 1_300);
    h.join('near', 1_150);
    const result = h.join('seeker', 1_200);
    if (!result.ok || result.value === null) throw new Error('expected a match');
    expect(result.value.participants).toContain(asId<PlayerId>('near'));
  });

  it('removes a player who leaves', () => {
    const h = harness();
    h.join('a', 1_200);
    h.matchmaker.leave(asId<PlayerId>('a'));
    expect(h.matchmaker.isQueued(asId<PlayerId>('a'))).toBe(false);
    const result = h.join('b', 1_200);
    expect(result.ok && result.value).toBeNull();
  });

  it('seeds every match differently', () => {
    const h = harness();
    h.join('a', 1_200);
    const first = h.join('b', 1_200);
    h.advance(5);
    h.join('c', 1_200);
    const second = h.join('d', 1_200);
    if (!first.ok || !second.ok || !first.value || !second.value)
      throw new Error('expected matches');
    expect(first.value.seed).not.toBe(second.value.seed);
  });
});

describe('rating', () => {
  it('expects an even chance between equals', () => {
    expect(expectedScore(1_200, 1_200)).toBeCloseTo(0.5, 10);
  });

  it('expects the stronger player to win more often', () => {
    expect(expectedScore(1_600, 1_200)).toBeGreaterThan(0.8);
    expect(expectedScore(1_200, 1_600)).toBeLessThan(0.2);
  });

  it('moves both players in opposite directions by the same amount', () => {
    const winner = applyRating(1_200, 1_200, 'WIN');
    const loser = applyRating(1_200, 1_200, 'LOSS');
    expect(winner.delta).toBe(-loser.delta);
  });

  it('rewards beating a stronger opponent more than a weaker one', () => {
    const upset = applyRating(1_000, 1_800, 'WIN');
    const expected = applyRating(1_800, 1_000, 'WIN');
    expect(upset.delta).toBeGreaterThan(expected.delta);
  });

  it('barely moves a draw between equals', () => {
    expect(applyRating(1_200, 1_200, 'DRAW').delta).toBe(0);
  });

  it('moves a draw against a stronger opponent upward', () => {
    expect(applyRating(1_000, 1_600, 'DRAW').delta).toBeGreaterThan(0);
  });

  it('keeps ratings whole and never negative', () => {
    for (const rating of [0, 1, 50, 1_200, 3_000]) {
      const result = applyRating(rating, 2_800, 'LOSS');
      expect(Number.isInteger(result.rating)).toBe(true);
      expect(result.rating).toBeGreaterThanOrEqual(0);
    }
  });
});
