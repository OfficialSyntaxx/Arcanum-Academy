export interface PlayerSummary {
  readonly playerId: string;
  readonly schemaVersion: number;
  readonly version: number;
  readonly updatedAtMs: number;
  readonly totalLevel: number;
  readonly lastSeenAtMs: number | null;
  readonly location: unknown;
}

export interface SnapshotSummary {
  readonly id: string;
  readonly playerId: string;
  readonly sourceVersion: number;
  readonly schemaVersion: number;
  readonly createdAtMs: number;
  readonly reason: string;
}

export interface RestoreAuditEntry {
  readonly id: string;
  readonly playerId: string;
  readonly snapshotId: string;
  readonly actor: string;
  readonly reason: string;
  readonly beforeVersion: number;
  readonly restoredVersion: number;
  readonly createdAtMs: number;
}

export class AdminApiError extends Error {
  constructor(readonly status: number) {
    super(
      status === 404
        ? 'Admin access unavailable or credentials refused.'
        : `Request failed (${status}).`,
    );
    this.name = 'AdminApiError';
  }
}

type Fetcher = typeof fetch;

export function normalizeEndpoint(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (trimmed === '') return '';
  const url = new URL(trimmed);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Endpoint must use HTTP or HTTPS.');
  }
  return url.toString().replace(/\/$/, '');
}

/**
 * The credential exists only inside this object. The UI never writes it to
 * storage, the URL, logs, or DOM after connection.
 */
export class AdminApi {
  constructor(
    private readonly endpoint: string,
    private readonly token: string,
    private readonly fetcher: Fetcher = globalThis.fetch.bind(globalThis),
  ) {}

  searchPlayers(query = '', cursor?: string) {
    const params = new URLSearchParams({ limit: '25' });
    if (query.trim()) params.set('q', query.trim());
    if (cursor) params.set('cursor', cursor);
    return this.get<{ players: readonly PlayerSummary[]; nextCursor?: string }>(
      `/admin/players?${params.toString()}`,
    );
  }

  player(playerId: string) {
    return this.get<{ player: PlayerSummary; state: unknown }>(
      `/admin/players/${encodeURIComponent(playerId)}`,
    );
  }

  snapshots(playerId: string) {
    return this.get<{ snapshots: readonly SnapshotSummary[] }>(
      `/admin/players/${encodeURIComponent(playerId)}/snapshots`,
    );
  }

  snapshot(playerId: string, snapshotId: string) {
    return this.get<{ snapshot: SnapshotSummary; state: unknown }>(
      `/admin/players/${encodeURIComponent(playerId)}/snapshots/${encodeURIComponent(snapshotId)}`,
    );
  }

  restoreAudit(playerId: string) {
    return this.get<{ audit: readonly RestoreAuditEntry[] }>(
      `/admin/players/${encodeURIComponent(playerId)}/restore-audit`,
    );
  }

  private async get<T>(path: string): Promise<T> {
    const response = await this.fetcher(`${this.endpoint}${path}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { authorization: `Bearer ${this.token}`, accept: 'application/json' },
    });
    if (!response.ok) throw new AdminApiError(response.status);
    return (await response.json()) as T;
  }
}
