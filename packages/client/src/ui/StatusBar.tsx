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

  return (
    <div className="status-bar" role="status" aria-live="polite">
      <span className="status-bar__dot" data-status={transportStatus} aria-hidden="true" />
      <span>{STATUS_LABEL[transportStatus] ?? transportStatus}</span>
      {latencyMs !== null ? <span>{latencyMs} ms</span> : null}
      <span>{fps} fps</span>
    </div>
  );
}
