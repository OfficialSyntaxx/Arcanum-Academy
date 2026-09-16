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
  readonly afterVersion: number;
  readonly restoredAtMs: number;
}

export interface OperationsOverview {
  readonly generatedAtMs: number;
  readonly players: {
    readonly totalPlayers: number;
    readonly updatedLast24Hours: number;
    readonly updatedLast7Days: number;
    readonly snapshotCount: number;
    readonly restoreCount: number;
    readonly latestSaveAtMs: number | null;
  };
  readonly runtime: {
    readonly connections: number;
    readonly sessions: number;
    readonly uptimeSeconds: number;
    readonly rssBytes: number;
  };
  readonly diagnostics: {
    readonly total: number;
    readonly errors: number;
    readonly warnings: number;
  };
  readonly reports: { readonly open: number };
}

export interface DiagnosticEvent {
  readonly level: 'info' | 'warn' | 'error';
  readonly source: string;
  readonly message: string;
  readonly clientAtMs?: number;
  readonly receivedAtMs: number;
}

export interface SupportReport {
  readonly id: string;
  readonly category: 'bug' | 'gameplay' | 'account' | 'feedback';
  readonly message: string;
  readonly playerId?: string;
  readonly clientAtMs?: number;
  readonly diagnostics: readonly {
    readonly level: 'info' | 'warn' | 'error';
    readonly source: string;
    readonly message: string;
    readonly atMs: number;
  }[];
  readonly receivedAtMs: number;
  readonly status: 'open';
}

export class AdminApiError extends Error {
  constructor(readonly status: number) {
    super(
      status === 401 || status === 403
        ? 'Your operations session is unavailable or unauthorized. Sign in again.'
        : status === 404
          ? 'The requested operations resource was not found.'
          : `Request failed (${status}).`,
    );
    this.name = 'AdminApiError';
  }
}

type Fetcher = typeof fetch;

export class AdminApi {
  constructor(private readonly fetcher: Fetcher = globalThis.fetch.bind(globalThis)) {}

  searchPlayers(query = '', cursor?: string) {
    const params = new URLSearchParams({ limit: '25' });
    if (query.trim()) params.set('q', query.trim());
    if (cursor) params.set('cursor', cursor);
    return this.get<{ players: readonly PlayerSummary[]; nextCursor?: string }>(
      `/admin/players?${params.toString()}`,
    );
  }

  overview() {
    return this.get<OperationsOverview>('/admin/overview');
  }

  diagnostics() {
    return this.get<{ events: readonly DiagnosticEvent[] }>('/admin/diagnostics');
  }

  reports() {
    return this.get<{ reports: readonly SupportReport[] }>('/admin/reports');
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
    const response = await this.fetcher(`/.netlify/functions/admin-proxy${path}`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new AdminApiError(response.status);
    return (await response.json()) as T;
  }
}
