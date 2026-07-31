import { useAppStore } from '../state/app-store.js';
import { LabelStrip } from '../ui/LabelStrip.js';

/**
 * Shown while services start. Boot steps are real: each entry is a service that
 * either came up or did not, so a failed start is diagnosable from the screen
 * itself rather than from a console the player cannot open.
 */
export function BootScreen() {
  const steps = useAppStore((state) => state.bootSteps);

  return (
    <section className="panel boot">
      <LabelStrip title="The Arcanum Academy" serial="ARC-0001" />
      <p className="boot__lede">Preparing the courtyard.</p>
      <ol className="boot__steps">
        {steps.map((step) => (
          <li key={step.id} className="boot__step" data-status={step.status}>
            <span className="boot__marker" aria-hidden="true" />
            <span>{step.label}</span>
            {step.detail ? <span className="label-strip__serial">{step.detail}</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
