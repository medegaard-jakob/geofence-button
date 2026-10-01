import * as L from 'leaflet';
import { LatLng, Zone } from './geo';

export const DEFAULT_CENTER: LatLng = [55.6761, 12.5683];

/** An OpenStreetMap-backed Leaflet map. No API key needed. */
export function createMap(el: HTMLElement, center: LatLng, zoom = 17): L.Map {
  const map = L.map(el, { zoomControl: true }).setView(center, zoom);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 20,
    maxNativeZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  // The map often mounts before the flex layout settles.
  setTimeout(() => map.invalidateSize(), 0);
  return map;
}

export function zoneLayer(zone: Zone, color: string): L.Layer {
  const style = { color, weight: 2, fillOpacity: 0.15 };
  return zone.kind === 'circle'
    ? L.circle(zone.center, { ...style, radius: zone.radius })
    : L.polygon(zone.points, style);
}

export function fitZones(map: L.Map, zones: Zone[]): boolean {
  const pts: LatLng[] = zones.flatMap((z) =>
    z.kind === 'polygon' ? z.points : boundsOfCircle(z.center, z.radius),
  );
  if (!pts.length) return false;
  map.fitBounds(L.latLngBounds(pts), { padding: [24, 24], maxZoom: 19 });
  return true;
}

function boundsOfCircle(c: LatLng, r: number): LatLng[] {
  const dLat = r / 110_540;
  const dLng = r / (111_320 * Math.cos((c[0] * Math.PI) / 180));
  return [
    [c[0] - dLat, c[1] - dLng],
    [c[0] + dLat, c[1] + dLng],
  ];
}
