import { useAppStore } from '../state/app-store.js';
import { LabelStrip } from '../ui/LabelStrip.js';

/** Terminal-but-recoverable failures. One message, one way forward. */
export function FaultScreen() {
  const faultMessage = useAppStore((state) => state.faultMessage);

  return (
    <section className="panel fault">
      <LabelStrip title="Cannot continue" serial="FAULT-ENGINE" />
      <p>The academy could not finish starting. Reloading tries again from the beginning.</p>
      <p className="fault__detail">{faultMessage ?? 'No detail was reported.'}</p>
      <button type="button" data-variant="primary" onClick={() => window.location.reload()}>
        Reload
      </button>
    </section>
  );
}
