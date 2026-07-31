import { Component, type ErrorInfo, type ReactNode } from 'react';
import { LabelStrip } from './LabelStrip.js';

/**
 * Catches render-time failures so a broken panel does not blank the whole app.
 * The message is written for a player, with the technical detail available but
 * subordinate - and a single obvious way forward.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; onError?: (error: Error, info: ErrorInfo) => void },
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <section className="panel fault">
        <LabelStrip title="Interface stopped" serial="FAULT-UI" />
        <p>Something in this screen failed to draw. Reloading returns you to the courtyard.</p>
        <p className="fault__detail">{this.state.error.message}</p>
        <button type="button" data-variant="primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </section>
    );
  }
}
