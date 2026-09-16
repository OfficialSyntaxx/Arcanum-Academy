import { InteractableKind, zoneById, type ZoneId } from '@alderfell/shared';
import { useAppStore } from '../state/app-store.js';

/** Metres from the player to the minimap's edge. */
const RANGE = 26;
const SIZE = 104;

const DOT_COLOURS: Readonly<Record<string, string>> = {
  [InteractableKind.GatheringNode]: '#6fc3b1',
  [InteractableKind.CraftingStation]: '#d8c3a0',
  [InteractableKind.MerchantStall]: '#e7c063',
  [InteractableKind.BankChest]: '#e7c063',
  [InteractableKind.QuestBoard]: '#f1e6c8',
  [InteractableKind.CombatEncounter]: '#e05a45',
  [InteractableKind.ClueSite]: '#e4b95f',
  [InteractableKind.ZonePortal]: '#8fd0ff',
};

/**
 * OSRS-style minimap: the local routes and landmarks around the player,
 * turned with the camera so up on the map is forward on screen. Tapping it
 * opens the full local map. Drawn from zone data, never from the renderer.
 */
export function Minimap({ onOpenMap }: { readonly onOpenMap: () => void }) {
  const zoneId = useAppStore((state) => state.currentZoneId);
  const player = useAppStore((state) => state.playerPosition);
  const yaw = useAppStore((state) => state.cameraYaw);
  const zone = zoneById(zoneId as ZoneId);
  if (!zone) return null;
  const scale = SIZE / 2 / RANGE;
  const half = SIZE / 2;
  const project = (x: number, z: number) => [
    half + (x - player.x) * scale,
    half + (z - player.z) * scale,
  ];
  const nearby = (x: number, z: number) => Math.hypot(x - player.x, z - player.z) < RANGE * 1.4;
  // The camera looks along -Z at yaw 0 from behind the player, so the map turns by yaw.
  const rotate = `rotate(${(-yaw * 180) / Math.PI} ${half} ${half})`;
  return (
    <button type="button" className="minimap" onClick={onOpenMap} aria-label="Open the local map">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE} aria-hidden="true">
        <defs>
          <clipPath id="minimap-clip">
            <circle cx={half} cy={half} r={half - 1} />
          </clipPath>
        </defs>
        <circle cx={half} cy={half} r={half - 1} fill="rgba(24, 40, 28, 0.82)" />
        <g clipPath="url(#minimap-clip)" transform={rotate}>
          {zone.waypoints.flatMap((waypoint) =>
            waypoint.links
              .filter((id) => id > waypoint.id)
              .map((id) => {
                const target = zone.waypoints.find((node) => node.id === id);
                if (!target) return null;
                if (
                  !nearby(waypoint.position.x, waypoint.position.z) &&
                  !nearby(target.position.x, target.position.z)
                )
                  return null;
                const [x1, y1] = project(waypoint.position.x, waypoint.position.z);
                const [x2, y2] = project(target.position.x, target.position.z);
                return (
                  <line
                    key={`${waypoint.id}:${id}`}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="#c9b98f"
                    strokeWidth="3"
                    strokeOpacity="0.55"
                  />
                );
              }),
          )}
          {zone.interactables
            .filter((place) => nearby(place.position.x, place.position.z))
            .map((place) => {
              const [cx, cy] = project(place.position.x, place.position.z);
              return (
                <circle
                  key={place.id}
                  cx={cx}
                  cy={cy}
                  r="3.2"
                  fill={DOT_COLOURS[place.kind] ?? '#fff'}
                />
              );
            })}
          <g transform={`rotate(${(-player.facing * 180) / Math.PI} ${half} ${half})`}>
            <path
              d={`M ${half} ${half - 7} L ${half + 4.5} ${half + 4} L ${half - 4.5} ${half + 4} Z`}
              fill="#fff6e6"
            />
          </g>
        </g>
        <circle cx={half} cy={half} r={half - 1} fill="none" stroke="#9c6f2c" strokeWidth="2" />
      </svg>
    </button>
  );
}
