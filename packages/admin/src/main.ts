import './styles.css';
import {
  AdminApi,
  type DiagnosticEvent,
  type PlayerSummary,
  type RestoreAuditEntry,
  type SnapshotSummary,
  type SupportReport,
  normalizeEndpoint,
} from './api.js';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('Missing operations app root.');
const app: HTMLElement = root;

let api: AdminApi | undefined;
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
        'Disconnect',
        () => {
          api = undefined;
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
    node('h2', '', 'Connect securely'),
    node(
      'p',
      'muted',
      'Credentials stay in memory and are erased when this tab reloads or disconnects.',
    ),
  );
  const form = node('form');
  const endpointLabel = node('label', '', 'Server endpoint');
  const endpoint = node('input');
  endpoint.type = 'url';
  endpoint.required = true;
  endpoint.placeholder = 'https://server.example.com';
  endpoint.autocomplete = 'off';
  endpointLabel.append(endpoint);
  const tokenLabel = node('label', '', 'Read token');
  const token = node('input');
  token.type = 'password';
  token.required = true;
  token.minLength = 32;
  token.autocomplete = 'off';
  token.spellcheck = false;
  tokenLabel.append(token);
  const submit = node('button', 'primary', 'Open console');
  submit.type = 'submit';
  form.append(endpointLabel, tokenLabel, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      const candidate = new AdminApi(normalizeEndpoint(endpoint.value), token.value);
      await candidate.searchPlayers('', undefined);
      api = candidate;
      token.value = '';
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
    );
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

renderConnect();
