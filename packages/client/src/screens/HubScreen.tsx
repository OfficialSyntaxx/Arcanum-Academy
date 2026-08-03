import { useState } from 'react';
import { HubHud, InteractionPrompt } from '../ui/HubOverlay.js';
import { JoystickPad } from '../ui/JoystickPad.js';
import { CommandError, GatheringHud, InventoryPanel } from '../ui/EconomyPanels.js';
import type { Joystick } from '../input/joystick.js';

/**
 * The hub overlay.
 *
 * Deliberately almost empty. The world is the content; chrome is a clock strip
 * at the top, a stick zone bottom-left and one contextual button bottom-right.
 * Everything else the GDD calls for — inventory, collection, deckbuilder — opens
 * as a full-surface panel from later phases rather than crowding this layer,
 * because a hub HUD that fills the screen on a phone leaves nothing to look at.
 *
 * It takes the two things it needs rather than the controller that owns them, so
 * the screen layer never depends on the composition root.
 */
export interface HubScreenProps {
  readonly joystick: Joystick;
  readonly onEngage: () => void;
  readonly onCollect: () => void;
  readonly onStopGathering: () => void;
  readonly onClaimOffline: () => void;
}

export function HubScreen({
  joystick,
  onEngage,
  onCollect,
  onStopGathering,
  onClaimOffline,
}: HubScreenProps) {
  // The satchel is a panel rather than a permanent strip: it is consulted
  // occasionally and would otherwise cost screen the world should be using.
  const [satchelOpen, setSatchelOpen] = useState(false);

  return (
    <div className="hub">
      <HubHud />
      <JoystickPad joystick={joystick} />
      <InteractionPrompt onEngage={onEngage} />
      <GatheringHud
        onCollect={onCollect}
        onStop={onStopGathering}
        onClaimOffline={onClaimOffline}
      />
      <CommandError />
      {satchelOpen ? (
        <InventoryPanel onClose={() => setSatchelOpen(false)} />
      ) : (
        <button
          type="button"
          className="satchel-toggle"
          onClick={() => setSatchelOpen(true)}
          aria-label="Open satchel"
        >
          Satchel
        </button>
      )}
    </div>
  );
}
