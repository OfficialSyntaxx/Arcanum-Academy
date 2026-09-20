import type { ZoneId } from '@alderfell/shared';

const MAP_STYLES: Readonly<Record<string, { readonly surface: string; readonly route: string }>> = {
  'zone.courtyard': { surface: '#294a34', route: '#d8c38c' },
  'zone.forest': { surface: '#263f2b', route: '#d7c989' },
  'zone.mountains': { surface: '#474e49', route: '#ebe0bf' },
  'zone.snow': { surface: '#71848f', route: '#263b4c' },
  'zone.saltwake_ruins': { surface: '#294a34', route: '#d8c38c' },
  'zone.cinderhollow': { surface: '#332126', route: '#f0c58d' },
  'zone.ashen_overlook': { surface: '#403037', route: '#f0c58d' },
};

/** Region-tinted map paper, independent from renderer materials and assets. */
export function mapSurfaceColour(zoneId: ZoneId): string {
  return (MAP_STYLES[zoneId] ?? MAP_STYLES['zone.courtyard']!).surface;
}

/** Route colour paired with the regional map paper for touch-readable contrast. */
export function mapRouteColour(zoneId: ZoneId): string {
  return (MAP_STYLES[zoneId] ?? MAP_STYLES['zone.courtyard']!).route;
}
