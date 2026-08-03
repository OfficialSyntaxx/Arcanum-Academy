/**
 * Who else is in the hub.
 *
 * Presence is answered on request rather than pushed. A client reports where it
 * is and receives the neighbours it can see, which bounds outbound bandwidth to
 * exactly one reply per request instead of one message per player per
 * movement - the difference between a hub that costs 40 KB/s per client and one
 * whose cost grows with the square of the population.
 *
 * The trade is up to one tick of latency on someone else's position. In a
 * social hub where nobody is being shot at, that is invisible; in a duel it
 * would not be, which is why duels do not run through this.
 *
 * Interest management is a radius and a hard cap. The radius is what makes a
 * crowded courtyard affordable; the cap is what stops a pathological case -
 * everyone standing on one tile - from undoing it.
 */

import type { PlayerId, SessionId } from '@arcanum/shared';

export interface PresencePosition {
  readonly x: number;
  readonly z: number;
  /** Facing in radians. Rendered as a heading, never used for rules. */
  readonly facing: number;
}

export interface PresenceEntry extends PresencePosition {
  readonly sessionId: SessionId;
  readonly playerId: PlayerId;
  readonly updatedAtMs: number;
}

export interface PresenceOptions {
  /** Metres within which another player is reported. */
  readonly radius: number;
  /** Most neighbours reported to one client, whatever the crowd. */
  readonly maxNeighbours: number;
  /** Entries older than this are treated as gone. */
  readonly staleAfterMs: number;
  readonly now: () => number;
}

function isFinitePosition(position: PresencePosition): boolean {
  return (
    Number.isFinite(position.x) && Number.isFinite(position.z) && Number.isFinite(position.facing)
  );
}

export class PresenceService {
  private readonly entries = new Map<SessionId, PresenceEntry>();

  constructor(private readonly options: PresenceOptions) {}

  get size(): number {
    return this.entries.size;
  }

  /**
   * Records where a session is.
   *
   * A non-finite coordinate is dropped rather than stored. NaN propagates
   * through every distance comparison it touches and would quietly make a
   * player invisible to everyone rather than obviously broken.
   */
  update(sessionId: SessionId, playerId: PlayerId, position: PresencePosition): boolean {
    if (!isFinitePosition(position)) return false;
    this.entries.set(sessionId, {
      sessionId,
      playerId,
      x: position.x,
      z: position.z,
      facing: position.facing,
      updatedAtMs: this.options.now(),
    });
    return true;
  }

  leave(sessionId: SessionId): void {
    this.entries.delete(sessionId);
  }

  /**
   * The neighbours a session can see, nearest first.
   *
   * Sorted by distance and then by session id, so a tie never depends on map
   * iteration order - two clients asking at the same moment must be told the
   * same thing.
   */
  neighbours(sessionId: SessionId): readonly PresenceEntry[] {
    const self = this.entries.get(sessionId);
    if (self === undefined) return [];

    const cutoff = this.options.now() - this.options.staleAfterMs;
    const limit = this.options.radius * this.options.radius;
    const near: { entry: PresenceEntry; distanceSquared: number }[] = [];

    for (const entry of this.entries.values()) {
      if (entry.sessionId === sessionId) continue;
      if (entry.updatedAtMs < cutoff) continue;
      const dx = entry.x - self.x;
      const dz = entry.z - self.z;
      const distanceSquared = dx * dx + dz * dz;
      if (distanceSquared > limit) continue;
      near.push({ entry, distanceSquared });
    }

    near.sort(
      (a, b) =>
        a.distanceSquared - b.distanceSquared || a.entry.sessionId.localeCompare(b.entry.sessionId),
    );
    return near.slice(0, this.options.maxNeighbours).map((candidate) => candidate.entry);
  }

  /** Drops entries nobody has refreshed. Driven by the gateway sweep. */
  sweep(): number {
    const cutoff = this.options.now() - this.options.staleAfterMs;
    let removed = 0;
    for (const [sessionId, entry] of this.entries) {
      if (entry.updatedAtMs < cutoff) {
        this.entries.delete(sessionId);
        removed += 1;
      }
    }
    return removed;
  }
}
