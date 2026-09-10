import { useAppStore } from '../state/app-store.js';

const STATUS_LABEL: Record<string, string> = {
  idle: 'Offline',
  connecting: 'Connecting',
  open: 'Connected',
  reconnecting: 'Reconnecting',
  closed: 'Disconnected',
};

/** Persistent connection and performance readout. Visible in every phase. */
export function StatusBar() {
  const transportStatus = useAppStore((state) => state.transportStatus);
  const latencyMs = useAppStore((state) => state.latencyMs);
  const fps = useAppStore((state) => state.fps);
  const diagnosticsOpen = useAppStore((state) => state.diagnosticsOpen);
  const setDiagnosticsOpen = useAppStore((state) => state.setDiagnosticsOpen);

  return (
    <>
      <div className="status-bar" role="status" aria-live="polite">
        <span className="status-bar__dot" data-status={transportStatus} aria-hidden="true" />
        <span>{STATUS_LABEL[transportStatus] ?? transportStatus}</span>
        {latencyMs !== null ? <span>{latencyMs} ms</span> : null}
        <span>{fps} fps</span>
        <button type="button" onClick={() => setDiagnosticsOpen(!diagnosticsOpen)}>
          Logs
        </button>
      </div>
      {diagnosticsOpen && <DiagnosticsPanel />}
    </>
  );
}

/** A compact mobile trace: enough context to diagnose a failed tap without devtools. */
export function DiagnosticsPanel() {
  const diagnostics = useAppStore((state) => state.diagnostics);
  const clearDiagnostics = useAppStore((state) => state.clearDiagnostics);
  const setDiagnosticsOpen = useAppStore((state) => state.setDiagnosticsOpen);

  return (
    <aside className="diagnostics-panel" aria-label="Session diagnostics">
      <div className="diagnostics-panel__head">
        <strong>Session logs</strong>
        <div>
          <button type="button" onClick={clearDiagnostics}>
            Clear
          </button>
          <button type="button" onClick={() => setDiagnosticsOpen(false)}>
            Close
          </button>
        </div>
      </div>
      {diagnostics.length === 0 ? (
        <p>No events yet. Try the action that is failing.</p>
      ) : (
        <ol>
          {[...diagnostics].reverse().map((entry) => (
            <li key={entry.id} data-level={entry.level}>
              <time>
                {new Date(entry.atMs).toLocaleTimeString([], {
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </time>
              <span>{entry.source}</span>
              <p>{entry.message}</p>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
