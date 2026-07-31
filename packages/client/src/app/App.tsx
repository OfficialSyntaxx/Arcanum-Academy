import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../state/app-store.js';
import { bootstrap } from './bootstrap.js';
import { isHubPhase, resolveScreen } from '../screens/registry.js';
import { HubScreen } from '../screens/HubScreen.js';
import type { HubController } from './hub-controller.js';
import { StatusBar } from '../ui/StatusBar.js';
import { ErrorBoundary } from '../ui/ErrorBoundary.js';
import { GamePhase } from '@arcanum/sim';

/**
 * The application surface: one canvas for the world, one overlay for the UI.
 *
 * The overlay is click-through by default so the world stays reachable; panels
 * opt back into pointer events. That single rule is what keeps a full-screen HUD
 * from swallowing taps meant for a gathering node.
 */
export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phase = useAppStore((state) => state.phase);
  const setFault = useAppStore((state) => state.setFault);
  const setPhase = useAppStore((state) => state.setPhase);
  const [hub, setHub] = useState<HubController | null>(null);
  const Screen = resolveScreen(phase);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let disposed = false;
    let dispose: (() => Promise<void>) | null = null;

    void bootstrap({
      canvas,
      serverUrl: import.meta.env['VITE_SERVER_URL'] ?? 'ws://localhost:8787',
      debug: import.meta.env.DEV,
    })
      .then((container) => {
        if (disposed) {
          void container.dispose();
          return;
        }
        setHub(container.resolve('hub'));
        dispose = () => container.dispose();
      })
      .catch((error: unknown) => {
        setPhase(GamePhase.Fault);
        setFault(error instanceof Error ? error.message : String(error));
      });

    return () => {
      disposed = true;
      setHub(null);
      void dispose?.();
    };
  }, [setFault, setPhase]);

  return (
    <div className="app">
      <canvas ref={canvasRef} className="app__canvas" aria-hidden="true" />
      <div className="app__overlay">
        <StatusBar />
        <ErrorBoundary onError={(error) => setFault(error.message)}>
          {hub !== null && isHubPhase(phase) ? (
            <HubScreen
              joystick={hub.joystick}
              onEngage={() => {
                hub.engagePrompt();
              }}
            />
          ) : (
            <Screen />
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
}
