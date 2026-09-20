import { useEffect, useRef } from 'react';
import { InteractableKind, zoneById, type Waypoint, type ZoneId } from '@alderfell/shared';
import { useAppStore } from '../state/app-store.js';
import { hasElevationChange } from '../core/elevation.js';
import { mapRouteColour, mapSurfaceColour } from '../core/map-surface.js';

/** Kinds that can be selected as a destination without starting their action. */
export function isMapDestination(kind: InteractableKind): boolean {
  return (
    kind === InteractableKind.GatheringNode ||
    kind === InteractableKind.CraftingStation ||
    kind === InteractableKind.QuestBoard ||
    kind === InteractableKind.CombatEncounter ||
    kind === InteractableKind.ClueSite ||
    kind === InteractableKind.ZonePortal
  );
}

const MAP_MARKER_COLOURS: Readonly<Partial<Record<InteractableKind, string>>> = {
  [InteractableKind.GatheringNode]: '#6fc3b1',
  [InteractableKind.CraftingStation]: '#d8c3a0',
  [InteractableKind.QuestBoard]: '#f1e6c8',
  [InteractableKind.CombatEncounter]: '#e05a45',
  [InteractableKind.ClueSite]: '#e4b95f',
  [InteractableKind.ZonePortal]: '#8fd0ff',
};

export function mapDestinationType(kind: InteractableKind): string {
  switch (kind) {
    case InteractableKind.GatheringNode:
      return 'Gathering';
    case InteractableKind.CraftingStation:
      return 'Crafting';
    case InteractableKind.QuestBoard:
      return 'Quest board';
    case InteractableKind.CombatEncounter:
      return 'Combat';
    case InteractableKind.ClueSite:
      return 'Tideglass clue';
    case InteractableKind.ZonePortal:
      return 'Route';
    default:
      return 'Destination';
  }
}

export function isScenicMapDestination(waypoint: Pick<Waypoint, 'label' | 'tags'>): boolean {
  return waypoint.label !== undefined && waypoint.tags?.includes('destination') === true;
}

/** Wayfinding only. Selecting a destination walks the real path; work still
 * starts at the resource or station, through the normal contextual action. */
export function WorldMap({
  onNavigate,
  onNavigateWaypoint,
  onClose,
  selectedDestinationId,
}: {
  onNavigate: (id: string) => void;
  onNavigateWaypoint: (id: string) => void;
  onClose: () => void;
  selectedDestinationId: string | null;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const zoneId = useAppStore((state) => state.currentZoneId);
  const player = useAppStore((state) => state.playerPosition);
  const zone = zoneById(zoneId as ZoneId);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  if (!zone) return null;
  const places = zone.interactables.filter((item) => isMapDestination(item.kind));
  const scenicPlaces = zone.waypoints.filter(isScenicMapDestination);
  const width = zone.bounds.maxX - zone.bounds.minX;
  const height = zone.bounds.maxZ - zone.bounds.minZ;
  const x = (value: number) => ((value - zone.bounds.minX) / width) * 280 + 10;
  const y = (value: number) => ((value - zone.bounds.minZ) / height) * 180 + 10;
  const hasClimb = zone.waypoints.some((waypoint) =>
    waypoint.links.some((id) => {
      const target = zone.waypoints.find((node) => node.id === id);
      return (
        target !== undefined && hasElevationChange(zone.terrain, waypoint.position, target.position)
      );
    }),
  );
  return (
    <dialog ref={dialog} className="panel world-map" onCancel={onClose} aria-labelledby="map-title">
      <div className="world-map__head">
        <h2 id="map-title">Local map</h2>
        <button type="button" onClick={onClose} aria-label="Close map">
          Close
        </button>
      </div>
      <p className="world-map__region">{zone.name}</p>
      <p>Choose a destination to walk there.</p>
      <svg
        viewBox="0 0 300 200"
        role="img"
        aria-label="Local routes, landmarks, and player position"
        style={{ backgroundColor: mapSurfaceColour(zone.id) }}
      >
        <g className="world-map__north" aria-hidden="true">
          <path d="M 282 12 L 288 26 L 282 22 L 276 26 Z" />
          <text x="282" y="38" textAnchor="middle">
            N
          </text>
        </g>
        {zone.waypoints.flatMap((waypoint) =>
          waypoint.links
            .filter((id) => id > waypoint.id)
            .map((id) => {
              const target = zone.waypoints.find((node) => node.id === id)!;
              const climbs = hasElevationChange(zone.terrain, waypoint.position, target.position);
              return (
                <line
                  key={`${waypoint.id}:${id}`}
                  x1={x(waypoint.position.x)}
                  y1={y(waypoint.position.z)}
                  x2={x(target.position.x)}
                  y2={y(target.position.z)}
                  stroke={mapRouteColour(zone.id)}
                  strokeWidth="2"
                  strokeDasharray={climbs ? '5 3' : undefined}
                />
              );
            }),
        )}
        {zone.waypoints
          .filter((waypoint) => waypoint.label !== undefined)
          .map((waypoint) => (
            <text
              key={waypoint.id}
              className="world-map__landmark"
              x={x(waypoint.position.x)}
              y={y(waypoint.position.z) - 7}
              textAnchor="middle"
            >
              {waypoint.label}
            </text>
          ))}
        {places.map((place, index) => (
          <g key={place.id}>
            <circle
              cx={x(place.position.x)}
              cy={y(place.position.z)}
              r="9"
              fill={MAP_MARKER_COLOURS[place.kind] ?? '#e7a23d'}
              stroke={place.id === selectedDestinationId ? '#fff6e6' : undefined}
              strokeWidth={place.id === selectedDestinationId ? '2.5' : undefined}
            />
            <text
              x={x(place.position.x)}
              y={y(place.position.z) + 4}
              textAnchor="middle"
              fontSize="12"
              fill="#17130f"
            >
              {index + 1}
            </text>
          </g>
        ))}
        {scenicPlaces.map((place) => (
          <circle
            key={place.id}
            cx={x(place.position.x)}
            cy={y(place.position.z)}
            r="5"
            fill="#f0c58d"
            stroke={place.id === selectedDestinationId ? '#fff6e6' : '#5a3825'}
            strokeWidth={place.id === selectedDestinationId ? '2.5' : '1.5'}
          />
        ))}
        <g transform={`rotate(${(player.facing * 180) / Math.PI} ${x(player.x)} ${y(player.z)})`}>
          <path
            d={`M ${x(player.x)} ${y(player.z) - 7} L ${x(player.x) + 4.5} ${y(player.z) + 4} L ${x(player.x) - 4.5} ${y(player.z) + 4} Z`}
            fill="#fff6e6"
            stroke="#17130f"
            strokeWidth="1.5"
          />
        </g>
      </svg>
      {hasClimb && <p className="world-map__legend">Dashed paths climb or descend.</p>}
      <div className="world-map__places">
        {places.map((place, index) => (
          <button
            key={place.id}
            type="button"
            aria-pressed={place.id === selectedDestinationId}
            onClick={() => {
              onNavigate(place.id);
              onClose();
            }}
          >
            <span aria-hidden="true">{index + 1}</span>
            <strong>{place.label}</strong>
            <small>{mapDestinationType(place.kind)}</small>
          </button>
        ))}
        {scenicPlaces.map((place, index) => (
          <button
            key={place.id}
            type="button"
            aria-pressed={place.id === selectedDestinationId}
            onClick={() => {
              onNavigateWaypoint(place.id);
              onClose();
            }}
          >
            <span aria-hidden="true">{places.length + index + 1}</span>
            <strong>{place.label}</strong>
            <small>Scenic landmark</small>
          </button>
        ))}
      </div>
    </dialog>
  );
}
