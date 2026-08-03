import {
  createLogger,
  createMemorySink,
  consoleSink,
  COURTYARD,
  DEFAULT_TUNABLES,
  LogLevel,
  type Logger,
} from '@arcanum/shared';
import { GamePhase } from '@arcanum/sim';
import { Container } from '../core/container.js';
import { Engine } from '../core/engine.js';
import { readDeviceSignals, resolveQuality, type QualitySettings } from '../core/device.js';
import { RenderService } from '../render/renderer.js';
import { InputService } from '../input/input-service.js';
import { Transport, browserSocketFactory, TransportStatus } from '../net/transport.js';
import { EconomyController } from './economy-controller.js';
import {
  IndexedDbStore,
  MemoryStore,
  readDocument,
  writeDocument,
  type KeyValueStore,
} from '../persistence/local-store.js';
import { useAppStore } from '../state/app-store.js';
import { HubController } from './hub-controller.js';

/**
 * Composition root.
 *
 * Every service is constructed here, in one order, with explicit dependencies.
 * Nothing else in the client constructs a service or reaches for a global, which
 * is what makes the boot sequence auditable, the failure modes specific, and
 * teardown complete.
 *
 * Boot is fault-tolerant by design: storage and the network can both fail
 * without stopping the game. A player in private browsing with no signal still
 * gets a running client; they just get told what is unavailable.
 */

export interface ClientServices {
  logger: Logger;
  quality: QualitySettings;
  storage: KeyValueStore;
  render: RenderService;
  input: InputService;
  transport: Transport;
  economy: EconomyController;
  hub: HubController;
  engine: Engine;
}

const IDENTITY_KEY = 'identity';

const BOOT_STEPS = [
  { id: 'device', label: 'Reading device capabilities', status: 'pending' as const },
  { id: 'storage', label: 'Opening local storage', status: 'pending' as const },
  { id: 'identity', label: 'Restoring your enrolment', status: 'pending' as const },
  { id: 'render', label: 'Starting the renderer', status: 'pending' as const },
  { id: 'network', label: 'Contacting the academy', status: 'pending' as const },
  { id: 'world', label: 'Raising the courtyard', status: 'pending' as const },
  { id: 'engine', label: 'Starting the frame loop', status: 'pending' as const },
];

export interface BootstrapOptions {
  readonly canvas: HTMLCanvasElement;
  readonly serverUrl: string;
  readonly debug: boolean;
}

export async function bootstrap(options: BootstrapOptions): Promise<Container<ClientServices>> {
  const store = useAppStore.getState();
  store.registerBootSteps(BOOT_STEPS);
  const container = new Container<ClientServices>();

  const memorySink = createMemorySink(200);
  const logger = createLogger({
    scope: 'client',
    level: options.debug ? LogLevel.Debug : LogLevel.Info,
    sinks: [consoleSink, memorySink],
  });
  container.register('logger', () => logger);

  // 1. Device capabilities decide every renderer setting, so they come first.
  store.setBootStep('device', { status: 'active' });
  const quality = resolveQuality(readDeviceSignals());
  container.register('quality', () => quality);
  store.setQualityTier(quality.tier);
  store.setBootStep('device', { status: 'done', detail: quality.tier });

  // 2. Storage. Private browsing and evicted quotas are expected, not fatal.
  store.setBootStep('storage', { status: 'active' });
  const opened = await IndexedDbStore.open();
  const storage: KeyValueStore = opened.ok ? opened.value : new MemoryStore();
  container.register('storage', () => storage);
  if (opened.ok) {
    store.setBootStep('storage', { status: 'done' });
  } else {
    logger.warn('falling back to in-memory storage', { reason: opened.error.reason });
    store.setBootStep('storage', { status: 'done', detail: 'memory only' });
  }

  // 3. Identity. The server owns the account; this is the handle used to claim it.
  store.setBootStep('identity', { status: 'active' });
  const identityDocument = await readDocument(storage, IDENTITY_KEY);
  // The server owns identity now. This device keeps the token it was issued
  // and nothing else; a player id generated here would be a claim, not proof.
  let identityToken: string | undefined;
  let playerId = '';
  let resumeToken: string | undefined;
  if (identityDocument.ok && identityDocument.value) {
    const stored = identityDocument.value as {
      playerId?: string;
      identityToken?: string;
      resumeToken?: string;
    };
    if (typeof stored.identityToken === 'string') identityToken = stored.identityToken;
    if (typeof stored.playerId === 'string') playerId = stored.playerId;
    if (typeof stored.resumeToken === 'string') resumeToken = stored.resumeToken;
  }
  store.setBootStep('identity', {
    status: 'done',
    detail: identityToken === undefined ? 'enrolling' : playerId.slice(0, 8),
  });

  // 4. Renderer.
  store.setBootStep('render', { status: 'active' });
  const render = new RenderService({
    canvas: options.canvas,
    quality,
    logger: logger.child('render'),
    onContextLost: () => store.setFault('The graphics context was lost.'),
    onContextRestored: () => store.setFault(null),
  });
  container.register('render', () => render);
  const input = new InputService({ element: options.canvas });
  container.register('input', () => input);
  store.setBootStep('render', { status: 'done' });

  // 5. Network. Connection failure is a banner, never a blocked boot.
  store.setBootStep('network', { status: 'active' });
  const identity = resumeToken ? { identityToken, resumeToken } : { identityToken };
  const transport = new Transport(
    {
      url: options.serverUrl,
      logger: logger.child('net'),
      socketFactory: browserSocketFactory,
      baseDelayMs: DEFAULT_TUNABLES.network.reconnectBaseDelayMs,
      maxDelayMs: DEFAULT_TUNABLES.network.reconnectMaxDelayMs,
      heartbeatIntervalMs: DEFAULT_TUNABLES.network.heartbeatIntervalMs,
    },
    identity,
  );
  container.register('transport', () => transport);
  transport.events.on('status', ({ status }) => {
    store.setTransportStatus(status);
    if (status === TransportStatus.Open) store.setBootStep('network', { status: 'done' });
  });
  transport.events.on('latency', ({ roundTripMs }) => store.setLatency(Math.round(roundTripMs)));
  transport.events.on('frame', (frame) => {
    if (frame.op === 's:handshake_ok') {
      const payload = frame.p as {
        resumeToken?: string;
        identityToken?: string;
        playerId?: string;
      };
      if (payload?.resumeToken) {
        // The token arrives once, on the connection that created the account.
        // Losing it loses the account, so it is written before anything else
        // is done with the frame.
        if (typeof payload.identityToken === 'string') identityToken = payload.identityToken;
        if (typeof payload.playerId === 'string') {
          playerId = payload.playerId;
          store.setPlayerId(playerId);
        }
        void writeDocument(storage, IDENTITY_KEY, {
          playerId,
          identityToken,
          resumeToken: payload.resumeToken,
        });
      }
    }
  });
  transport.connect();

  // 6. The world. A zone that fails content validation is a hard failure: the
  // alternative is a courtyard the player can walk out of.
  store.setBootStep('world', { status: 'active' });
  // Owns the economy commands and applies the server's patches. Constructed
  // here rather than in the UI so the hub can be handed a way to start a
  // harvest without ever learning what a socket is.
  const economy = new EconomyController(transport);
  container.register('economy', () => economy);

  const hubResult = HubController.create({
    render,
    input,
    quality,
    tunables: DEFAULT_TUNABLES,
    canvas: options.canvas,
    onEngageGatheringNode: (interactableId) => economy.startGathering(interactableId),
    onEngageCraftingStation: (interactableId) => store.setOpenStation(interactableId),
    onEngageScribingTable: () => store.setCollectionOpen(true),
    onEngageDuelCircle: () => store.setLadderOpen(true),
  });
  if (!hubResult.ok) {
    store.setBootStep('world', { status: 'failed', detail: hubResult.error.reason });
    logger.error('zone failed validation', {
      reason: hubResult.error.reason,
      detail: hubResult.error.detail ?? '',
    });
    throw new Error(hubResult.error.detail ?? hubResult.error.reason);
  }
  const hub = hubResult.value;
  container.register('hub', () => hub);
  store.setBootStep('world', { status: 'done', detail: COURTYARD.name });

  // 7. Frame loop.
  store.setBootStep('engine', { status: 'active' });
  const engine = new Engine({
    logger: logger.child('engine'),
    tickHz: DEFAULT_TUNABLES.network.simulationTickHz,
    seed: playerId,
    hooks: {
      onRender: (_alpha, deltaSeconds) => {
        hub.update(deltaSeconds);
        render.render();
        const stats = engine.stats;
        store.setFrameStats(stats.fps, stats.simulationTick);
      },
      onTimeDropped: (droppedMs) =>
        logger.debug('dropped simulation time after a stall', { droppedMs }),
    },
  });
  container.register('engine', () => engine);
  engine.start();
  store.setBootStep('engine', { status: 'done' });

  engine.phases.transition(GamePhase.Loading, 'services ready');
  const entered = engine.phases.transition(GamePhase.WorldExploration, 'boot complete');
  store.setPhase(engine.phases.current);
  if (!entered.ok) {
    logger.error('failed to enter the world', { reason: entered.error.reason });
    store.setFault(entered.error.reason);
  }

  // Force construction so disposal order matches construction order.
  for (const key of [
    'logger',
    'quality',
    'storage',
    'render',
    'input',
    'transport',
    'hub',
    'engine',
  ] as const) {
    container.resolve(key);
  }
  return container;
}
