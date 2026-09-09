import { useEffect, useRef } from 'react';
import { InteractableKind, zoneById, type ZoneId } from '@alderfell/shared';
import { useAppStore } from '../state/app-store.js';

/** Wayfinding only. Selecting a destination walks the real path; work still
 * starts at the resource or station, through the normal contextual action. */
export function WorldMap({
  onNavigate,
  onClose,
}: {
  onNavigate: (id: string) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const zoneId = useAppStore((state) => state.currentZoneId);
  const zone = zoneById(zoneId as ZoneId);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  if (!zone) return null;
  const places = zone.interactables.filter(
    (item) =>
      item.kind === InteractableKind.GatheringNode ||
      item.kind === InteractableKind.CraftingStation ||
      item.kind === InteractableKind.ZonePortal,
  );
  const width = zone.bounds.maxX - zone.bounds.minX;
  const height = zone.bounds.maxZ - zone.bounds.minZ;
  const x = (value: number) => ((value - zone.bounds.minX) / width) * 280 + 10;
  const y = (value: number) => ((value - zone.bounds.minZ) / height) * 180 + 10;
  return (
    <dialog ref={dialog} className="panel world-map" onCancel={onClose} aria-labelledby="map-title">
      <div className="world-map__head">
        <h2 id="map-title">Local map</h2>
        <button type="button" onClick={onClose} aria-label="Close map">
          Close
        </button>
      </div>
      <p>Choose a destination to walk there.</p>
      <svg viewBox="0 0 300 200" role="img" aria-label="Paths between local landmarks">
        {zone.waypoints.flatMap((waypoint) =>
          waypoint.links
            .filter((id) => id > waypoint.id)
            .map((id) => {
              const target = zone.waypoints.find((node) => node.id === id)!;
              return (
                <line
                  key={`${waypoint.id}:${id}`}
                  x1={x(waypoint.position.x)}
                  y1={y(waypoint.position.z)}
                  x2={x(target.position.x)}
                  y2={y(target.position.z)}
                  stroke="#b8a985"
                  strokeWidth="2"
                />
              );
            }),
        )}
        {places.map((place, index) => (
          <g key={place.id}>
            <circle cx={x(place.position.x)} cy={y(place.position.z)} r="9" fill="#e7a23d" />
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
      </svg>
      <div className="world-map__places">
        {places.map((place, index) => (
          <button
            key={place.id}
            type="button"
            onClick={() => {
              onNavigate(place.id);
              onClose();
            }}
          >
            <span aria-hidden="true">{index + 1}</span> {place.label}
          </button>
        ))}
      </div>
    </dialog>
  );
}
