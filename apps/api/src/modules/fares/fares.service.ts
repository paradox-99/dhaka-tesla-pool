import { AppError } from "../../errors/AppError.js";
import { calculateFare } from "../../domain/fare.js";
import { distanceKm } from "../../domain/zones.js";
import { prisma } from "../../lib/prisma.js";
import type { EstimateFareInput } from "./fares.schemas.js";

export async function estimateFare({ pickupZoneId, dropoffZoneId, seats }: EstimateFareInput) {
  const zones = await prisma.zone.findMany({
    where: { id: { in: [pickupZoneId, dropoffZoneId] } },
    select: { id: true, x: true, y: true },
  });
  const pickup = zones.find((zone) => zone.id === pickupZoneId);
  const dropoff = zones.find((zone) => zone.id === dropoffZoneId);

  if (!pickup || !dropoff) {
    throw new AppError(404, "ZONE_NOT_FOUND", "Pickup or dropoff zone was not found");
  }

  const distance = distanceKm(pickup, dropoff);
  const solo = calculateFare({ distanceKm: distance, seats, pooled: false });
  const pooled = calculateFare({ distanceKm: distance, seats, pooled: true });

  return {
    distanceKm: distance,
    soloFarePaisa: solo.total,
    pooledFarePaisa: pooled.total,
  };
}