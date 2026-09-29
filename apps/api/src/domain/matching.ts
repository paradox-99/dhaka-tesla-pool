import { distanceKm, type ZoneCoordinate } from "./zones.js";

export interface MatchRequest {
  pickupZoneId: number;
  dropoff: ZoneCoordinate;
  seats: number;
}

export interface MatchPool {
  status: string;
  pickupZoneId: number;
  capacity: number;
  seatsOccupied: number;
}

export function isCompatible(
  request: MatchRequest,
  pool: MatchPool,
  memberDropoffs: ZoneCoordinate[],
): boolean {
  return (
    pool.status === "ACCEPTED" &&
    request.pickupZoneId === pool.pickupZoneId &&
    pool.seatsOccupied + request.seats <= pool.capacity &&
    memberDropoffs.every((memberDropoff) => distanceKm(request.dropoff, memberDropoff) <= 3)
  );
}