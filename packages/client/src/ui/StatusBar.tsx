import { useState, type FormEvent } from 'react';
import { GamePhase } from '@alderfell/sim';
import { useAppStore } from '../state/app-store.js';
import type { DiagnosticEntry } from '../state/app-store.js';

type SupportCategory = 'bug' | 'gameplay' | 'account' | 'feedback';

interface SupportRequest {
  readonly category: SupportCategory;
  readonly message: string;
  readonly playerId?: string;
  readonly diagnostics: readonly DiagnosticEntry[];
}

const STATUS_LABEL: Record<string, string> = {
  idle: 'Offline',
  connecting: 'Connecting',
  open: 'Connected',
  reconnecting: 'Reconnecting',
  closed: 'Disconnected',
};

/** Persistent connection and performance readout. Visible in every phase. */
export function StatusBar({
  onSubmitReport,
}: {
  readonly onSubmitReport: (input: SupportRequest) => Promise<string>;
}) {
  const transportStatus = useAppStore((state) => state.transportStatus);
  const latencyMs = useAppStore((state) => state.latencyMs);
  const fps = useAppStore((state) => state.fps);
  const diagnosticsOpen = useAppStore((state) => state.diagnosticsOpen);
  const setDiagnosticsOpen = useAppStore((state) => state.setDiagnosticsOpen);
  const [reportOpen, setReportOpen] = useState(false);
  const hudCollapsed = useAppStore((state) => state.hudCollapsed);
  const phase = useAppStore((state) => state.phase);
  const inGame = phase === GamePhase.WorldExploration || phase === GamePhase.SocialHub;
  // In play the readout is a single dot; the numbers and tools are developer
  // information and live behind it. Outside the hub the full strip stays.
  const [expanded, setExpanded] = useState(false);
  const showDetail = !inGame || (expanded && !hudCollapsed);

  return (
    <>
      <div
        className="status-bar"
        role="status"
        aria-live="polite"
        data-compact={showDetail ? 'false' : 'true'}
      >
        <button
          type="button"
          className="status-bar__toggle"
          aria-label={`Connection: ${STATUS_LABEL[transportStatus] ?? transportStatus}`}
          aria-expanded={showDetail}
          onClick={() => setExpanded((open) => !open)}
        >
          <span className="status-bar__dot" data-status={transportStatus} aria-hidden="true" />
        </button>
        {showDetail && (
          <>
            <span>{STATUS_LABEL[transportStatus] ?? transportStatus}</span>
            {latencyMs !== null ? <span>{latencyMs} ms</span> : null}
            <span>{fps} fps</span>
            <button type="button" onClick={() => setDiagnosticsOpen(!diagnosticsOpen)}>
              Logs
            </button>
            <button type="button" onClick={() => setReportOpen(true)}>
              Report
            </button>
          </>
        )}
      </div>
      {diagnosticsOpen && <DiagnosticsPanel />}
      {reportOpen && (
        <SupportReportPanel onSubmit={onSubmitReport} onClose={() => setReportOpen(false)} />
      )}
    </>
  );
}

function SupportReportPanel({
  onSubmit,
  onClose,
}: {
  readonly onSubmit: (input: SupportRequest) => Promise<string>;
  readonly onClose: () => void;
}) {
  const diagnostics = useAppStore((state) => state.diagnostics);
  const playerId = useAppStore((state) => state.playerId);
  const [category, setCategory] = useState<SupportCategory>('bug');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setStatus(null);
    try {
      const receipt = await onSubmit({
        category,
        message,
        ...(playerId ? { playerId } : {}),
        diagnostics,
      });
      setMessage('');
      setStatus(`Report received · ${receipt.slice(0, 8)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The report could not be delivered.');
    } finally {
      setSending(false);
    }
  }

  return (
    <aside className="diagnostics-panel support-panel" aria-label="Send feedback">
      <div className="diagnostics-panel__head">
        <strong>Send a report</strong>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <p>Your player ID and up to 10 recent events are attached.</p>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          Category
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as SupportCategory)}
          >
            <option value="bug">Bug</option>
            <option value="gameplay">Gameplay problem</option>
            <option value="account">Account problem</option>
            <option value="feedback">Feedback</option>
          </select>
        </label>
        <label>
          What happened?
          <textarea
            required
            minLength={20}
            maxLength={2000}
            rows={5}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="What did you expect?"
          />
        </label>
        <button type="submit" disabled={sending || message.trim().length < 20}>
          {sending ? 'Sending…' : 'Send report'}
        </button>
        {status ? <p role="status">{status}</p> : null}
      </form>
    </aside>
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
