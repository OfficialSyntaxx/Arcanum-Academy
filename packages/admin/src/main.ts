import './styles.css';
import {
  AdminApi,
  type PlayerSummary,
  type RestoreAuditEntry,
  type SnapshotSummary,
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
      await renderPlayers();
    } catch (error) {
      showError(error);
      submit.disabled = false;
    }
  });
  card.append(form);
  app.append(card);
}

async function renderPlayers(cursor?: string) {
  if (!api) return renderConnect();
  app.replaceChildren(header());
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
  app.append(section);
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
    node('h3', '', player.playerId),
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
  app.replaceChildren(header());
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
      node('h2', '', result.player.playerId),
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
    const state = node('section', 'card');
    state.append(node('h3', '', 'Redacted state'), jsonPanel(result.state));
    app.append(summary, state);
  } catch (error) {
    showError(error);
  }
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
  app.replaceChildren(header(), detailNav(playerId, 'snapshots'));
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
  app.replaceChildren(header(), detailNav(playerId, 'snapshots'));
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
  app.replaceChildren(header(), detailNav(playerId, 'audit'));
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

function auditRow(entry: RestoreAuditEntry) {
  const row = node('article', 'record');
  row.append(
    node('strong', '', `${entry.actor} · v${entry.beforeVersion} → v${entry.restoredVersion}`),
    node('span', 'muted', formatTime(entry.createdAtMs)),
    node('span', '', entry.reason),
  );
  return row;
}

window.addEventListener('pagehide', () => {
  api = undefined;
});

renderConnect();
