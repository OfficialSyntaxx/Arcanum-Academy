import { useCallback, useRef, useState } from 'react';

import type { Joystick } from '../input/joystick.js';

/**
 * The movement stick.
 *
 * Owns a generous invisible zone in the lower-left of the screen rather than a
 * small visible pad: on a phone the thumb is already there, and a control you
 * have to aim for is a control you look at instead of looking at the game. The
 * visible ring only appears once a thumb lands.
 *
 * Pointer events are captured on the zone, so a drag that wanders over the world
 * keeps steering instead of being stolen by the camera. Rendering is driven by
 * pointer movement, not by the frame loop, so an idle stick costs nothing.
 */
export function JoystickPad({ joystick }: { joystick: Joystick }) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const [visual, setVisual] = useState(joystick.visual());

  const handleDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      zoneRef.current?.setPointerCapture(event.pointerId);
      joystick.press(event.pointerId, event.clientX, event.clientY);
      setVisual(joystick.visual());
    },
    [joystick],
  );

  const handleMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!joystick.isActive) return;
      joystick.move(event.pointerId, event.clientX, event.clientY);
      setVisual(joystick.visual());
    },
    [joystick],
  );

  const handleUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      joystick.release(event.pointerId);
      setVisual(joystick.visual());
    },
    [joystick],
  );

  return (
    <div
      ref={zoneRef}
      className="joystick-zone"
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      /* The stick is a touch affordance with a keyboard equivalent elsewhere;
         announcing it to a screen reader would only add noise. */
      aria-hidden="true"
    >
      {visual.active ? (
        <div
          className="joystick"
          style={{ left: `${String(visual.originX)}px`, top: `${String(visual.originY)}px` }}
        >
          <span className="joystick__base" />
          <span
            className="joystick__knob"
            style={{
              transform: `translate(calc(-50% + ${String(visual.knobX)}px), calc(-50% + ${String(visual.knobY)}px))`,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
