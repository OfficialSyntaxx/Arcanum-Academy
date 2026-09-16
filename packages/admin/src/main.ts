import './styles.css';
import {
  AuthError,
  acceptInvite,
  getUser,
  handleAuthCallback,
  login,
  logout,
  requestPasswordRecovery,
  updateUser,
} from '@netlify/identity';
import {
  AdminApi,
  type DiagnosticEvent,
  type PlayerSummary,
  type RestoreAuditEntry,
  type SnapshotSummary,
  type SupportReport,
} from './api.js';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing operations app root.');
const app: HTMLElement = root;

let api: AdminApi | undefined;
let operatorEmail = '';
let activeQuery = '';
let nextCursor: string | undefined;

function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function button(label: string, action: () => void | Promise<void>, kind = '') {
  const element = node('button', kind, label);
  element.type = 'button';
  element.addEventListener('click', () => void action());
  return element;
}

function formatTime(value: number | null) {
  return value === null ? 'Never' : new Date(value).toLocaleString();
}

function jsonPanel(value: unknown) {
  const pre = node('pre', 'json');
  pre.textContent = JSON.stringify(value, null, 2);
  return pre;
}

function showError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unexpected request failure.';
  document.querySelector('.notice')?.remove();
  const notice = node('p', 'notice error', message);
  app.prepend(notice);
}

function header() {
  const bar = node('header', 'topbar');
  const title = node('div');
  title.append(node('p', 'eyebrow', 'Read-only console'), node('h1', '', 'Alderfell Operations'));
  bar.append(title);
  if (api) {
    bar.append(
      button(
        'Sign out',
        async () => {
          api = undefined;
          await logout();
          renderConnect();
        },
        'quiet',
      ),
    );
  }
  return bar;
}

type MainView = 'dashboard' | 'players' | 'reports' | 'diagnostics';

function mainNav(active: MainView) {
  const nav = node('nav', 'main-nav');
  nav.setAttribute('aria-label', 'Operations sections');
  const entries: readonly [MainView, string, () => void | Promise<void>][] = [
    ['dashboard', 'Overview', renderDashboard],
    ['players', 'Players', renderPlayers],
    ['reports', 'Reports', renderReports],
    ['diagnostics', 'Events', renderDiagnostics],
  ];
  for (const [id, label, action] of entries) {
    nav.append(button(label, action, id === active ? 'active' : ''));
  }
  return nav;
}

function shell(active: MainView, ...content: HTMLElement[]) {
  app.replaceChildren(header(), mainNav(active), ...content);
}

function renderConnect() {
  app.replaceChildren(header());
  const card = node('section', 'card connect');
  card.append(
    node('p', 'eyebrow', 'Authorized operators only'),
    node('h2', '', 'Sign in'),
    node('p', 'muted', 'Use the administrator account invited to this operations console.'),
  );
  const form = node('form');
  const usernameLabel = node('label', '', 'Username');
  const username = node('input');
  username.type = 'email';
  username.required = true;
  username.placeholder = 'Administrator email';
  username.autocomplete = 'username';
  username.autocapitalize = 'none';
  username.spellcheck = false;
  usernameLabel.append(username);
  const passwordLabel = node('label', '', 'Password');
  const password = node('input');
  password.type = 'password';
  password.required = true;
  password.minLength = 8;
  password.autocomplete = 'current-password';
  passwordLabel.append(password);
  const submit = node('button', 'primary', 'Sign in');
  submit.type = 'submit';
  const recovery = button('Forgot password?', renderRecovery, 'link-button');
  form.append(usernameLabel, passwordLabel, submit, recovery);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      const user = await login(username.value.trim(), password.value);
      operatorEmail = user.email ?? '';
      const candidate = new AdminApi();
      await candidate.overview();
      api = candidate;
      password.value = '';
      await renderDashboard();
    } catch (error) {
      await logout().catch(() => undefined);
      operatorEmail = '';
      showError(
        error instanceof AuthError && error.status === 401
          ? new Error('Username or password is incorrect.')
          : error,
      );
      submit.disabled = false;
    }
  });
  card.append(form);
  app.append(card);
}

function renderRecovery() {
  api = undefined;
  app.replaceChildren(header());
  const card = node('section', 'card connect');
  card.append(
    node('p', 'eyebrow', 'Account recovery'),
    node('h2', '', 'Reset password'),
    node('p', 'muted', 'We will send a secure reset link to the invited administrator email.'),
  );
  const form = node('form');
  const emailLabel = node('label', '', 'Username');
  const email = node('input');
  email.type = 'email';
  email.required = true;
  email.autocomplete = 'username';
  email.autocapitalize = 'none';
  email.spellcheck = false;
  emailLabel.append(email);
  const submit = node('button', 'primary', 'Send reset link');
  submit.type = 'submit';
  form.append(emailLabel, submit, button('Back to sign in', renderConnect, 'quiet'));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      await requestPasswordRecovery(email.value.trim());
      form.replaceChildren(
        node('p', 'success', 'If that administrator account exists, a reset link is on its way.'),
        button('Back to sign in', renderConnect, 'primary'),
      );
    } catch {
      form.replaceChildren(
        node('p', 'success', 'If that administrator account exists, a reset link is on its way.'),
        button('Back to sign in', renderConnect, 'primary'),
      );
    }
  });
  card.append(form);
  app.append(card);
}

function renderNewPassword(mode: 'invite' | 'recovery', token?: string) {
  api = undefined;
  app.replaceChildren(header());
  const card = node('section', 'card connect');
  card.append(
    node('p', 'eyebrow', mode === 'invite' ? 'Administrator invitation' : 'Account recovery'),
    node('h2', '', mode === 'invite' ? 'Create your password' : 'Choose a new password'),
    node('p', 'muted', 'Use at least 12 characters and a password manager-generated value.'),
  );
  const form = node('form');
  const passwordLabel = node('label', '', 'New password');
  const password = node('input');
  password.type = 'password';
  password.required = true;
  password.minLength = 12;
  password.autocomplete = 'new-password';
  passwordLabel.append(password);
  const confirmLabel = node('label', '', 'Confirm password');
  const confirm = node('input');
  confirm.type = 'password';
  confirm.required = true;
  confirm.minLength = 12;
  confirm.autocomplete = 'new-password';
  confirmLabel.append(confirm);
  const submit = node('button', 'primary', 'Save password');
  submit.type = 'submit';
  form.append(passwordLabel, confirmLabel, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (password.value !== confirm.value) return showError(new Error('Passwords do not match.'));
    submit.disabled = true;
    try {
      if (mode === 'invite') {
        if (!token) throw new Error('This invitation is incomplete. Request a new invite.');
        await acceptInvite(token, password.value);
      } else {
        await updateUser({ password: password.value });
      }
      api = new AdminApi();
      await api.overview();
      history.replaceState(null, '', location.pathname);
      await renderDashboard();
    } catch (error) {
      showError(error);
      submit.disabled = false;
    }
  });
  card.append(form);
  app.append(card);
}

async function renderDashboard() {
  if (!api) return renderConnect();
  const loading = node('section', 'card', 'Loading operational overview…');
  shell('dashboard', loading);
  try {
    const overview = await api.overview();
    const intro = node('section', 'card hero-card');
    intro.append(
      node('p', 'eyebrow', 'Realm status'),
      node('h2', '', overview.runtime.connections > 0 ? 'Players are connected' : 'Realm is quiet'),
      node('p', 'muted', `Updated ${formatTime(overview.generatedAtMs)}`),
    );
    const metrics = node('section', 'metric-grid');
    metrics.append(
      metricCard('Players', overview.players.totalPlayers, 'Authoritative accounts'),
      metricCard(
        'Connected',
        overview.runtime.connections,
        `${overview.runtime.sessions} resumable sessions`,
      ),
      metricCard(
        '24h saves',
        overview.players.updatedLast24Hours,
        `${overview.players.updatedLast7Days} in seven days`,
      ),
      metricCard(
        'Open reports',
        overview.reports.open,
        `${overview.diagnostics.errors} recent errors`,
      ),
      metricCard(
        'Snapshots',
        overview.players.snapshotCount,
        `${overview.players.restoreCount} restores`,
      ),
      metricCard(
        'Uptime',
        formatDuration(overview.runtime.uptimeSeconds),
        formatBytes(overview.runtime.rssBytes),
      ),
    );
    const actions = node('section', 'card quick-actions');
    actions.append(
      node('h3', '', 'Quick actions'),
      button('Find a player', renderPlayers, 'primary'),
      button('Review reports', renderReports, 'quiet'),
      button('Inspect events', renderDiagnostics, 'quiet'),
    );
    shell('dashboard', intro, metrics, actions);
  } catch (error) {
    showError(error);
  }
}

function metricCard(label: string, value: string | number, detail: string) {
  const card = node('article', 'metric-card');
  card.append(
    node('span', 'muted', label),
    node('strong', '', String(value)),
    node('small', '', detail),
  );
  return card;
}

function formatDuration(seconds: number) {
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3_600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}

function formatBytes(bytes: number) {
  return `${Math.round(bytes / 1_048_576)} MiB memory`;
}

async function renderPlayers(cursor?: string) {
  if (!api) return renderConnect();
  const section = node('section', 'card');
  section.append(node('h2', '', 'Player lookup'));
  const form = node('form', 'search');
  const input = node('input');
  input.type = 'search';
  input.placeholder = 'Search player ID';
  input.value = activeQuery;
  input.maxLength = 100;
  const submit = node('button', 'primary', 'Search');
  submit.type = 'submit';
  form.append(input, submit);
  section.append(
    form,
    node(
      'p',
      'muted',
      'Searches authoritative saves. Results expose no credentials or secret fields.',
    ),
  );
  shell('players', section);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    activeQuery = input.value.trim();
    void renderPlayers();
  });
  try {
    const result = await api.searchPlayers(activeQuery, cursor);
    nextCursor = result.nextCursor;
    const list = node('section', 'list');
    if (result.players.length === 0) list.append(node('p', 'empty', 'No matching players.'));
    for (const player of result.players) list.append(playerCard(player));
    if (nextCursor) list.append(button('Next 25', () => renderPlayers(nextCursor), 'quiet more'));
    app.append(list);
  } catch (error) {
    showError(error);
  }
}

function playerCard(player: PlayerSummary) {
  const card = node('article', 'card player');
  card.append(
    node('h3', 'identifier', player.playerId),
    node(
      'p',
      'metrics',
      `Level ${player.totalLevel} · Save v${player.version} · Schema ${player.schemaVersion}`,
    ),
    node(
      'p',
      'muted',
      `Updated ${formatTime(player.updatedAtMs)} · Last seen ${formatTime(player.lastSeenAtMs)}`,
    ),
    button('Inspect player', () => renderPlayer(player.playerId), 'primary'),
  );
  return card;
}

async function renderPlayer(playerId: string) {
  if (!api) return renderConnect();
  shell('players');
  const nav = node('nav', 'tabs');
  nav.append(
    button('← Players', () => renderPlayers(), 'quiet'),
    button('Save', () => renderPlayer(playerId), 'active'),
    button('Snapshots', () => renderSnapshots(playerId)),
    button('Restore audit', () => renderAudit(playerId)),
  );
  app.append(nav);
  try {
    const result = await api.player(playerId);
    const summary = node('section', 'card');
    summary.append(
      node('p', 'eyebrow', 'Authoritative save'),
      node('h2', 'identifier', result.player.playerId),
      node(
        'p',
        'metrics',
        `Level ${result.player.totalLevel} · v${result.player.version} · schema ${result.player.schemaVersion}`,
      ),
      node(
        'p',
        'muted',
        `Updated ${formatTime(result.player.updatedAtMs)} · Last seen ${formatTime(result.player.lastSeenAtMs)}`,
      ),
    );
    const account = accountSummary(result.state);
    const state = node('details', 'card raw-state');
    const stateLabel = node('summary', '', 'View redacted raw save');
    state.append(stateLabel, jsonPanel(result.state));
    app.append(summary, account, state);
  } catch (error) {
    showError(error);
  }
}

function accountSummary(state: unknown) {
  const data = isRecord(state) ? state : {};
  const inventory = isRecord(data['inventory']) ? data['inventory'] : {};
  const bank = isRecord(data['bank']) ? data['bank'] : {};
  const skills = isRecord(data['skills']) ? data['skills'] : {};
  const quests = isRecord(data['quests']) ? data['quests'] : {};
  const completedQuests = Object.values(quests).filter(
    (quest) => isRecord(quest) && quest['status'] === 'completed',
  ).length;
  const section = node('section', 'metric-grid account-grid');
  section.append(
    metricCard('Coins', typeof data['coins'] === 'number' ? data['coins'] : 0, 'Current purse'),
    metricCard(
      'Bag stacks',
      arrayLength(inventory['stacks']),
      `${String(inventory['slotCapacity'] ?? '—')} slots`,
    ),
    metricCard(
      'Bank stacks',
      arrayLength(bank['stacks']),
      `${String(bank['slotCapacity'] ?? '—')} slots`,
    ),
    metricCard('Skills', Object.keys(skills).length, 'Tracked disciplines'),
    metricCard('Quests', completedQuests, `${Object.keys(quests).length} tracked`),
    metricCard('Zone', locationLabel(data['location']), 'Last saved position'),
  );
  return section;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function arrayLength(value: unknown) {
  return Array.isArray(value) ? value.length : 0;
}

function locationLabel(value: unknown) {
  return isRecord(value) && typeof value['zoneId'] === 'string'
    ? value['zoneId'].replace(/^zone\./, '')
    : 'Unknown';
}

function detailNav(playerId: string, active: 'snapshots' | 'audit') {
  const nav = node('nav', 'tabs');
  nav.append(
    button('← Players', () => renderPlayers(), 'quiet'),
    button('Save', () => renderPlayer(playerId)),
    button('Snapshots', () => renderSnapshots(playerId), active === 'snapshots' ? 'active' : ''),
    button('Restore audit', () => renderAudit(playerId), active === 'audit' ? 'active' : ''),
  );
  return nav;
}

async function renderSnapshots(playerId: string) {
  if (!api) return renderConnect();
  shell('players', detailNav(playerId, 'snapshots'));
  try {
    const result = await api.snapshots(playerId);
    const section = node('section', 'card');
    section.append(node('h2', '', `Snapshots · ${playerId}`));
    if (result.snapshots.length === 0) section.append(node('p', 'empty', 'No retained snapshots.'));
    for (const snapshot of result.snapshots) section.append(snapshotRow(snapshot, playerId));
    app.append(section);
  } catch (error) {
    showError(error);
  }
}

function snapshotRow(snapshot: SnapshotSummary, playerId: string) {
  const row = node('article', 'record');
  row.append(
    node('strong', '', `Save v${snapshot.sourceVersion}`),
    node('span', 'muted', `${formatTime(snapshot.createdAtMs)} · ${snapshot.reason}`),
    button('View state', () => renderSnapshot(playerId, snapshot.id), 'quiet'),
  );
  return row;
}

async function renderSnapshot(playerId: string, snapshotId: string) {
  if (!api) return renderConnect();
  shell('players', detailNav(playerId, 'snapshots'));
  try {
    const result = await api.snapshot(playerId, snapshotId);
    const section = node('section', 'card');
    section.append(
      button('← Snapshot list', () => renderSnapshots(playerId), 'quiet'),
      node('h2', '', `Snapshot v${result.snapshot.sourceVersion}`),
      node('p', 'muted', `${formatTime(result.snapshot.createdAtMs)} · ${result.snapshot.reason}`),
      jsonPanel(result.state),
      button('Review restore', () => renderRestoreReview(playerId, result.snapshot), 'primary'),
    );
    app.append(section);
  } catch (error) {
    showError(error);
  }
}

async function renderRestoreReview(playerId: string, snapshot: SnapshotSummary) {
  if (!api) return renderConnect();
  shell('players', detailNav(playerId, 'snapshots'));
  try {
    const current = await api.player(playerId);
    const section = node('section', 'card restore-review');
    section.append(
      node('p', 'eyebrow', 'Audited repair'),
      node('h2', '', 'Restore reviewed snapshot'),
      node(
        'p',
        'muted',
        `Snapshot v${snapshot.sourceVersion} from ${formatTime(snapshot.createdAtMs)} will replace current save v${current.player.version}.`,
      ),
      node(
        'p',
        'muted',
        'The current save will be captured first as a permanent PRE_RESTORE snapshot, so this action can be undone from the snapshot list.',
      ),
    );
    const form = node('form');
    const reasonLabel = node('label', '', 'Reason for this repair');
    const reason = node('textarea');
    reason.required = true;
    reason.minLength = 10;
    reason.maxLength = 240;
    reason.placeholder =
      'Explain the support issue and why this snapshot is the correct recovery point.';
    reasonLabel.append(reason);
    const passwordLabel = node('label', '', 'Confirm your password');
    const password = node('input');
    password.type = 'password';
    password.required = true;
    password.autocomplete = 'current-password';
    passwordLabel.append(password);
    const submit = node('button', 'primary', 'Restore snapshot');
    submit.type = 'submit';
    form.append(
      reasonLabel,
      passwordLabel,
      submit,
      button('Cancel', () => renderSnapshot(playerId, snapshot.id), 'quiet'),
    );
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      submit.disabled = true;
      try {
        if (!operatorEmail)
          throw new Error('Your operator identity is unavailable. Sign in again.');
        const user = await login(operatorEmail, password.value);
        operatorEmail = user.email ?? operatorEmail;
        const restored = await api!.restore(playerId, {
          snapshotId: snapshot.id,
          expectedVersion: current.player.version,
          reason: reason.value.trim(),
        });
        const receipt = node('section', 'card');
        receipt.append(
          node('p', 'eyebrow', 'Restore complete'),
          node('h2', '', `Save is now v${restored.player.version}`),
          node(
            'p',
            'muted',
            `Audit receipt ${restored.audit.id} · ${formatTime(restored.audit.restoredAtMs)}`,
          ),
          node(
            'p',
            'muted',
            'The previous live save is now a PRE_RESTORE snapshot and can be restored if needed.',
          ),
          button('View updated snapshots', () => renderSnapshots(playerId), 'primary'),
          button('View restore audit', () => renderAudit(playerId), 'quiet'),
        );
        shell('players', detailNav(playerId, 'snapshots'), receipt);
      } catch (error) {
        showError(error);
        submit.disabled = false;
      } finally {
        password.value = '';
      }
    });
    app.append(section);
  } catch (error) {
    showError(error);
  }
}

async function renderAudit(playerId: string) {
  if (!api) return renderConnect();
  shell('players', detailNav(playerId, 'audit'));
  try {
    const result = await api.restoreAudit(playerId);
    const section = node('section', 'card');
    section.append(node('h2', '', `Restore audit · ${playerId}`));
    if (result.audit.length === 0) section.append(node('p', 'empty', 'No restore events.'));
    for (const entry of result.audit) section.append(auditRow(entry));
    app.append(section);
  } catch (error) {
    showError(error);
  }
}

async function renderReports() {
  if (!api) return renderConnect();
  shell('reports', node('section', 'card', 'Loading player reports…'));
  try {
    const result = await api.reports();
    const section = node('section', 'card');
    section.append(node('p', 'eyebrow', 'Player support'), node('h2', '', 'Open reports'));
    if (result.reports.length === 0) section.append(node('p', 'empty', 'No player reports yet.'));
    for (const report of result.reports) section.append(reportRow(report));
    shell('reports', section);
  } catch (error) {
    showError(error);
  }
}

function reportRow(report: SupportReport) {
  const article = node('article', 'record report');
  article.dataset['category'] = report.category;
  const heading = node('div', 'record-head');
  heading.append(
    node('strong', '', report.category),
    node('time', 'muted', formatTime(report.receivedAtMs)),
  );
  article.append(heading, node('p', '', report.message));
  if (report.playerId) {
    article.append(
      button(
        `Player · ${report.playerId}`,
        () => renderPlayer(report.playerId!),
        'quiet identifier-button',
      ),
    );
  }
  if (report.diagnostics.length > 0) {
    const details = node('details', 'context');
    details.append(node('summary', '', `${report.diagnostics.length} attached events`));
    for (const event of report.diagnostics) details.append(eventRow(event));
    article.append(details);
  }
  return article;
}

async function renderDiagnostics() {
  if (!api) return renderConnect();
  shell('diagnostics', node('section', 'card', 'Loading recent events…'));
  try {
    const result = await api.diagnostics();
    const section = node('section', 'card');
    section.append(node('p', 'eyebrow', 'Sanitized feed'), node('h2', '', 'Recent events'));
    if (result.events.length === 0) section.append(node('p', 'empty', 'No retained events.'));
    for (const event of result.events) section.append(eventRow(event));
    shell('diagnostics', section);
  } catch (error) {
    showError(error);
  }
}

function eventRow(event: DiagnosticEvent | SupportReport['diagnostics'][number]) {
  const article = node('article', 'record event');
  article.dataset['level'] = event.level;
  const time = 'receivedAtMs' in event ? event.receivedAtMs : event.atMs;
  article.append(
    node('strong', '', `${event.level} · ${event.source}`),
    node('span', 'muted', formatTime(time)),
    node('span', '', event.message),
  );
  return article;
}

function auditRow(entry: RestoreAuditEntry) {
  const row = node('article', 'record');
  row.append(
    node('strong', '', `${entry.actor} · v${entry.beforeVersion} → v${entry.afterVersion}`),
    node('span', 'muted', formatTime(entry.restoredAtMs)),
    node('span', '', entry.reason),
  );
  return row;
}

window.addEventListener('pagehide', () => {
  api = undefined;
});

async function boot() {
  try {
    const callback = await handleAuthCallback();
    if (callback?.type === 'invite') return renderNewPassword('invite', callback.token);
    if (callback?.type === 'recovery') return renderNewPassword('recovery');
    const user = await getUser();
    if (user) {
      operatorEmail = user.email ?? '';
      api = new AdminApi();
      await api.overview();
      return renderDashboard();
    }
  } catch (error) {
    await logout().catch(() => undefined);
    renderConnect();
    showError(error);
    return;
  }
  renderConnect();
}

void boot();
