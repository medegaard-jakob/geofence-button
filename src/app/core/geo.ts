/** A [latitude, longitude] pair in decimal degrees. */
export type LatLng = [number, number];

export interface PolygonZone {
  id: string;
  name: string;
  kind: 'polygon';
  points: LatLng[];
}

export interface CircleZone {
  id: string;
  name: string;
  kind: 'circle';
  center: LatLng;
  radius: number; // metres
}

export type Zone = PolygonZone | CircleZone;

const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LNG_EQUATOR = 111_320;

/**
 * Projects lat/lng onto a flat x/y plane (metres) centred on `origin`.
 * Accurate to well under a metre for zones a few kilometres across,
 * which is far better than GPS itself.
 */
function toLocal(p: LatLng, origin: LatLng): [number, number] {
  const cos = Math.cos((origin[0] * Math.PI) / 180);
  return [(p[1] - origin[1]) * M_PER_DEG_LNG_EQUATOR * cos, (p[0] - origin[0]) * M_PER_DEG_LAT];
}

export function distanceMeters(a: LatLng, b: LatLng): number {
  const [x, y] = toLocal(b, a);
  return Math.hypot(x, y);
}

function pointInPolygon(pts: [number, number][]): boolean {
  // Ray casting from (0,0), the point being tested.
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > 0 !== yj > 0 && 0 < ((xj - xi) * -yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distanceToSegment(a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / len2));
  return Math.hypot(a[0] + t * dx, a[1] + t * dy);
}

/**
 * Signed distance in metres from `p` to the zone boundary:
 * positive = inside (that far from the edge), negative = outside.
 */
export function signedDistanceToZone(p: LatLng, zone: Zone): number {
  if (zone.kind === 'circle') return zone.radius - distanceMeters(zone.center, p);
  if (zone.points.length < 3) return -Infinity;
  const local = zone.points.map((q) => toLocal(q, p));
  let edge = Infinity;
  for (let i = 0, j = local.length - 1; i < local.length; j = i++) {
    edge = Math.min(edge, distanceToSegment(local[j], local[i]));
  }
  return pointInPolygon(local) ? edge : -edge;
}

export function zoneCenter(zone: Zone): LatLng {
  if (zone.kind === 'circle') return zone.center;
  const n = zone.points.length;
  return [
    zone.points.reduce((s, q) => s + q[0], 0) / n,
    zone.points.reduce((s, q) => s + q[1], 0) / n,
  ];
}
