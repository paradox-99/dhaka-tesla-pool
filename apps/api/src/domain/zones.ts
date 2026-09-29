export interface ZoneCoordinate {
  x: number;
  y: number;
}

export function distanceKm(from: ZoneCoordinate, to: ZoneCoordinate): number {
  return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}