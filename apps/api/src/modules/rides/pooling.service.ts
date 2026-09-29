import { Prisma } from "../../generated/prisma/client.js";
import { calculateFare } from "../../domain/fare.js";
import { isCompatible, type MatchRequest } from "../../domain/matching.js";
import { AppError } from "../../errors/AppError.js";

type Transaction = Prisma.TransactionClient;

export async function claimSeat(tx: Transaction, poolId: string, seats: number) {
  const claimed = await tx.$executeRaw`
    UPDATE pools
    SET seats_occupied = seats_occupied + ${seats}
    WHERE id = ${poolId}::uuid
      AND status = 'ACCEPTED'
      AND seats_occupied + ${seats} <= capacity
  `;
  if (claimed === 0) {
    throw new AppError(409, "POOL_FULL", "No seats left in this Tesla");
  }
}

export async function recalculatePoolFares(tx: Transaction, poolId: string) {
  const members = await tx.poolMember.findMany({
    where: { poolId, leftAt: null },
    select: { rideRequest: { select: { id: true, seats: true, distanceKm: true } } },
  });
  const pooled = members.length >= 2;

  for (const member of members) {
    const fare = calculateFare({
      distanceKm: member.rideRequest.distanceKm,
      seats: member.rideRequest.seats,
      pooled,
    });
    await tx.rideRequest.update({
      where: { id: member.rideRequest.id },
      data: { estimatedFarePaisa: fare.total },
    });
  }
}

export async function autoMatchRide(
  tx: Transaction,
  ride: { id: string; passengerId: string; pickupZoneId: number; dropoff: { x: number; y: number }; seats: number },
) {
  const pools = await tx.pool.findMany({
    where: { status: "ACCEPTED", pickupZoneId: ride.pickupZoneId },
    orderBy: [{ seatsOccupied: "desc" }, { createdAt: "asc" }],
    include: {
      members: {
        where: { leftAt: null },
        include: { rideRequest: { select: { dropoffZone: { select: { x: true, y: true } } } } },
      },
    },
  });
  const request: MatchRequest = {
    pickupZoneId: ride.pickupZoneId,
    dropoff: ride.dropoff,
    seats: ride.seats,
  };

  for (const pool of pools) {
    const compatible = isCompatible(
      request,
      pool,
      pool.members.map((member) => member.rideRequest.dropoffZone),
    );
    if (!compatible) continue;

    try {
      await claimSeat(tx, pool.id, ride.seats);
    } catch (err) {
      if (err instanceof AppError && err.code === "POOL_FULL") continue;
      throw err;
    }

    await tx.poolMember.create({
      data: { poolId: pool.id, rideRequestId: ride.id, seats: ride.seats },
    });
    await tx.rideRequest.update({ where: { id: ride.id }, data: { status: "MATCHED" } });
    await recalculatePoolFares(tx, pool.id);
    await tx.rideEvent.create({
      data: {
        rideRequestId: ride.id,
        poolId: pool.id,
        actorId: ride.passengerId,
        type: "POOL_JOINED",
        fromStatus: "REQUESTED",
        toStatus: "MATCHED",
      },
    });
    return pool.id;
  }

  return null;
}