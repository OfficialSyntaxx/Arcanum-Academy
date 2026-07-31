import { useAppStore } from '../state/app-store.js';
import { LabelStrip } from '../ui/LabelStrip.js';

/**
 * Systems readout.
 *
 * Phase 1 has no gameplay, so this is the screen that proves the engine is
 * alive: the frame loop, the deterministic simulation, the transport and the
 * quality tier all report real values here. It survives into later phases as the
 * in-game diagnostics panel behind the debug gesture.
 */
export function SystemsScreen() {
  const { phase, fps, simulationTick, transportStatus, latencyMs, qualityTier } = useAppStore();

  return (
    <section className="panel boot">
      <LabelStrip title="Systems" serial="ARC-DIAG" />
      <p className="boot__lede">
        Engine services are running. Gameplay systems arrive in the next phase.
      </p>
      <dl className="readout">
        <dt>Phase</dt>
        <dd>{phase}</dd>
        <dt>Frame rate</dt>
        <dd data-tone={fps >= 50 ? 'good' : fps >= 30 ? undefined : 'bad'}>{fps} fps</dd>
        <dt>Simulation tick</dt>
        <dd>{simulationTick}</dd>
        <dt>Connection</dt>
        <dd data-tone={transportStatus === 'open' ? 'good' : 'bad'}>{transportStatus}</dd>
        <dt>Latency</dt>
        <dd>{latencyMs === null ? '--' : `${latencyMs} ms`}</dd>
        <dt>Quality tier</dt>
        <dd>{qualityTier ?? '--'}</dd>
      </dl>
    </section>
  );
}
