import { useAppStore, type DiagnosticEntry } from '../state/app-store.js';

function reportUrl(serverUrl: string): string | null {
  try {
    const url = new URL(serverUrl.replace(/^ws/, 'http'));
    url.protocol = url.protocol === 'https:' ? 'https:' : 'http:';
    url.pathname = '/diagnostics/events';
    url.search = '';
    return url.toString();
  } catch {
    return null;
  }
}

/** Ships low-volume diagnostics without blocking gameplay or exposing secrets. */
export function startDiagnosticReporter(serverUrl: string): () => void {
  const endpoint = reportUrl(serverUrl);
  if (endpoint === null) return () => undefined;
  let lastId = 0;
  let stopped = false;
  const unsubscribe = useAppStore.subscribe((state) => {
    const pending = state.diagnostics.filter(
      (entry) => entry.id > lastId && (entry.level !== 'info' || entry.source === 'world'),
    );
    if (pending.length === 0 || stopped) return;
    lastId = Math.max(...state.diagnostics.map((entry) => entry.id));
    for (const entry of pending.slice(-3)) {
      void send(endpoint, entry);
    }
  });
  return () => {
    stopped = true;
    unsubscribe();
  };
}

async function send(endpoint: string, entry: DiagnosticEntry): Promise<void> {
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        level: entry.level,
        source: entry.source,
        message: entry.message,
        clientAtMs: entry.atMs,
      }),
      keepalive: true,
    });
  } catch {
    // Diagnostics must never become a new visible failure or block the game.
  }
}
