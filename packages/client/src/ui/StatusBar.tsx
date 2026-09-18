import { useEffect, useState, type FormEvent } from 'react';
import {
  AuthError,
  getUser,
  handleAuthCallback,
  login,
  logout,
  requestPasswordRecovery,
  signup,
  updateUser,
  type User,
} from '@netlify/identity';
import { GamePhase } from '@alderfell/sim';
import { useAppStore } from '../state/app-store.js';
import type { DiagnosticEntry } from '../state/app-store.js';

interface CharacterAccountActions {
  linkCurrentCharacter(): Promise<void>;
  recoverCharacter(): Promise<void>;
}

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
  account,
}: {
  readonly onSubmitReport: (input: SupportRequest) => Promise<string>;
  readonly account: CharacterAccountActions | null;
}) {
  const transportStatus = useAppStore((state) => state.transportStatus);
  const latencyMs = useAppStore((state) => state.latencyMs);
  const fps = useAppStore((state) => state.fps);
  const diagnosticsOpen = useAppStore((state) => state.diagnosticsOpen);
  const setDiagnosticsOpen = useAppStore((state) => state.setDiagnosticsOpen);
  const [reportOpen, setReportOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
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
            <button type="button" onClick={() => setAccountOpen(true)}>
              Account
            </button>
          </>
        )}
      </div>
      {diagnosticsOpen && <DiagnosticsPanel />}
      {reportOpen && (
        <SupportReportPanel onSubmit={onSubmitReport} onClose={() => setReportOpen(false)} />
      )}
      {accountOpen && account && (
        <AccountPanel account={account} onClose={() => setAccountOpen(false)} />
      )}
    </>
  );
}

function AccountPanel({
  account,
  onClose,
}: {
  readonly account: CharacterAccountActions;
  readonly onClose: () => void;
}) {
  const [user, setUser] = useState<User | null>(null);
  const [mode, setMode] = useState<'login' | 'signup' | 'recovery' | 'password'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const callback = await handleAuthCallback();
        if (callback?.type === 'recovery') setMode('password');
        if (active) setUser(await getUser());
      } catch {
        if (active) setStatus('The account link is invalid or expired.');
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus('');
    try {
      if (mode === 'signup') {
        await signup(email.trim(), password);
        setStatus('Check your email to confirm the account, then sign in here.');
        setMode('login');
      } else if (mode === 'recovery') {
        await requestPasswordRecovery(email.trim());
        setStatus('If that account exists, a reset link is on its way.');
      } else if (mode === 'password') {
        await updateUser({ password });
        setUser(await getUser());
        history.replaceState(null, '', location.pathname);
        setStatus('Password updated.');
      } else {
        setUser(await login(email.trim(), password));
        setPassword('');
      }
    } catch (error) {
      setStatus(
        error instanceof AuthError && error.status === 401
          ? 'Email or password is incorrect.'
          : 'The account request failed.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function transfer(action: 'link' | 'recover') {
    setBusy(true);
    setStatus('');
    try {
      if (action === 'link') await account.linkCurrentCharacter();
      else await account.recoverCharacter();
      setStatus(
        action === 'link' ? 'Character protected. Reloading…' : 'Character recovered. Reloading…',
      );
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'The account request failed.');
      setBusy(false);
    }
  }

  return (
    <aside className="diagnostics-panel support-panel account-panel" aria-label="Character account">
      <div className="diagnostics-panel__head">
        <strong>Character account</strong>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>
      {busy ? (
        <p>Checking secure login…</p>
      ) : user ? (
        <>
          <p>
            Signed in as <strong>{user.email}</strong>
          </p>
          <p>
            Protect this device’s character once, or recover your protected character on a new
            device.
          </p>
          <div className="account-panel__actions">
            <button type="button" onClick={() => void transfer('link')}>
              Protect this character
            </button>
            <button type="button" onClick={() => void transfer('recover')}>
              Recover my character
            </button>
            <button type="button" onClick={() => void logout().then(() => setUser(null))}>
              Sign out
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <p>
            {mode === 'signup'
              ? 'Create a recovery login.'
              : mode === 'recovery'
                ? 'Reset your password.'
                : mode === 'password'
                  ? 'Choose a new password.'
                  : 'Sign in to protect or recover a character.'}
          </p>
          {mode !== 'password' && (
            <label>
              Email
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
          )}
          {mode !== 'recovery' && (
            <label>
              Password
              <input
                type="password"
                required
                minLength={8}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          )}
          <button type="submit">
            {mode === 'signup'
              ? 'Create login'
              : mode === 'recovery'
                ? 'Send reset link'
                : mode === 'password'
                  ? 'Save password'
                  : 'Sign in'}
          </button>
          {mode !== 'password' && (
            <div className="account-panel__links">
              <button type="button" onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}>
                {mode === 'signup' ? 'Back to sign in' : 'Create login'}
              </button>
              <button type="button" onClick={() => setMode('recovery')}>
                Forgot password?
              </button>
            </div>
          )}
        </form>
      )}
      {status && <p role="status">{status}</p>}
    </aside>
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
