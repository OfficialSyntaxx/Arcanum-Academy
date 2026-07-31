import { generateId, type PlayerId, type SessionId } from '@arcanum/shared';

/**
 * Resumable session registry.
 *
 * Mobile browsers drop sockets constantly: the player locks the phone, switches
 * apps, walks into a lift. Without resumption every one of those events costs a
 * full reload and, mid-duel, a loss. A session survives disconnection for a
 * bounded window; reconnecting with the token restores the same player context.
 *
 * In-process for now. The interface is deliberately narrow so the Phase 6
 * Redis-backed implementation is a drop-in replacement.
 */

export interface Session {
  readonly id: SessionId;
  readonly playerId: PlayerId;
  readonly resumeToken: string;
  readonly createdAtMs: number;
  /** Set when the socket drops; cleared on resume. */
  readonly disconnectedAtMs: number | null;
  /** Last sequence the server processed, so a resumed client can replay the gap. */
  readonly lastClientSeq: number;
}

export interface SessionStoreOptions {
  readonly resumeWindowMs: number;
  readonly now?: () => number;
}

export class SessionStore {
  private readonly byId = new Map<SessionId, Session>();
  private readonly byToken = new Map<string, SessionId>();
  private readonly now: () => number;

  constructor(private readonly options: SessionStoreOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  get size(): number {
    return this.byId.size;
  }

  create(playerId: PlayerId): Session {
    const timestamp = this.now();
    const session: Session = {
      id: generateId(timestamp) as SessionId,
      playerId,
      resumeToken: generateId(timestamp),
      createdAtMs: timestamp,
      disconnectedAtMs: null,
      lastClientSeq: 0,
    };
    this.byId.set(session.id, session);
    this.byToken.set(session.resumeToken, session.id);
    return session;
  }

  get(id: SessionId): Session | undefined {
    return this.byId.get(id);
  }

  /** Marks a session disconnected, starting the resume countdown. */
  markDisconnected(id: SessionId): void {
    const session = this.byId.get(id);
    if (!session || session.disconnectedAtMs !== null) return;
    this.byId.set(id, { ...session, disconnectedAtMs: this.now() });
  }

  recordSeq(id: SessionId, seq: number): void {
    const session = this.byId.get(id);
    if (!session || seq <= session.lastClientSeq) return;
    this.byId.set(id, { ...session, lastClientSeq: seq });
  }

  /**
   * Exchanges a resume token for its session. Returns undefined when the token
   * is unknown, already live, or past the resume window.
   */
  resume(token: string): Session | undefined {
    const id = this.byToken.get(token);
    if (!id) return undefined;
    const session = this.byId.get(id);
    if (!session) return undefined;
    if (session.disconnectedAtMs === null) return undefined;
    if (this.now() - session.disconnectedAtMs > this.options.resumeWindowMs) {
      this.destroy(id);
      return undefined;
    }
    const resumed: Session = { ...session, disconnectedAtMs: null };
    this.byId.set(id, resumed);
    return resumed;
  }

  destroy(id: SessionId): void {
    const session = this.byId.get(id);
    if (!session) return;
    this.byToken.delete(session.resumeToken);
    this.byId.delete(id);
  }

  /** Drops sessions past the resume window. Called on an interval by the gateway. */
  sweep(): number {
    const cutoff = this.now() - this.options.resumeWindowMs;
    let removed = 0;
    for (const [id, session] of this.byId) {
      if (session.disconnectedAtMs !== null && session.disconnectedAtMs < cutoff) {
        this.destroy(id);
        removed += 1;
      }
    }
    return removed;
  }
}
