import { Prisma } from "../../generated/prisma/client.js";
import { calculateFare } from "../../domain/fare.js";
import { distanceKm } from "../../domain/zones.js";
import { AppError } from "../../errors/AppError.js";
import { prisma } from "../../lib/prisma.js";
import type { CancelRideInput, CreateRideInput, ListRidesInput } from "./rides.schemas.js";
import { autoMatchRide, recalculatePoolFares } from "./pooling.service.js";

const rideSelect = {
  id: true,
  pickupZone: { select: { id: true, name: true, x: true, y: true } },
  dropoffZone: { select: { id: true, name: true, x: true, y: true } },
  seats: true,
  distanceKm: true,
  status: true,
  paymentMethod: true,
  estimatedFarePaisa: true,
  finalFarePaisa: true,
  cancelReason: true,
  createdAt: true,
  updatedAt: true,
  cancelledAt: true,
  completedAt: true,
} as const;

type SelectedRide = Prisma.RideRequestGetPayload<{ select: typeof rideSelect }>;

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function toRide(ride: SelectedRide) {
  return ride;
}

export async function createRide(passengerId: string, input: CreateRideInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const zones = await tx.zone.findMany({
        where: { id: { in: [input.pickupZoneId, input.dropoffZoneId] } },
        select: { id: true, x: true, y: true },
      });
      const pickup = zones.find((zone) => zone.id === input.pickupZoneId);
      const dropoff = zones.find((zone) => zone.id === input.dropoffZoneId);

      if (!pickup || !dropoff) {
        throw new AppError(404, "ZONE_NOT_FOUND", "Pickup or dropoff zone was not found");
      }

      const rideDistanceKm = distanceKm(pickup, dropoff);
      const estimatedFarePaisa = calculateFare({
        distanceKm: rideDistanceKm,
        seats: input.seats,
        pooled: false,
      }).total;
      let ride = await tx.rideRequest.create({
        data: {
          passengerId,
          pickupZoneId: input.pickupZoneId,
          dropoffZoneId: input.dropoffZoneId,
          seats: input.seats,
          distanceKm: rideDistanceKm,
          paymentMethod: input.paymentMethod,
          estimatedFarePaisa,
        },
        select: rideSelect,
      });
      await tx.rideEvent.create({
        data: {
          rideRequestId: ride.id,
          actorId: passengerId,
          type: "RIDE_REQUESTED",
          toStatus: "REQUESTED",
        },
      });
      await autoMatchRide(tx, {
        id: ride.id,
        passengerId,
        pickupZoneId: input.pickupZoneId,
        dropoff: dropoff,
        seats: input.seats,
      });
      ride = await tx.rideRequest.findUniqueOrThrow({ where: { id: ride.id }, select: rideSelect });
      return toRide(ride);
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new AppError(409, "ACTIVE_RIDE_EXISTS", "You already have an active ride request");
    }
    throw err;
  }
}

export async function listRides(passengerId: string, { page, limit }: ListRidesInput) {
  const skip = (page - 1) * limit;
  const [rides, total] = await prisma.$transaction([
    prisma.rideRequest.findMany({
      where: { passengerId },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      select: rideSelect,
    }),
    prisma.rideRequest.count({ where: { passengerId } }),
  ]);

  return { rides: rides.map(toRide), pagination: { page, limit, total } };
}

export async function getRide(passengerId: string, rideId: string) {
  const ride = await prisma.rideRequest.findFirst({
    where: { id: rideId, passengerId },
    select: {
      ...rideSelect,
      events: {
        orderBy: { createdAt: "asc" },
        select: { id: true, type: true, fromStatus: true, toStatus: true, metadata: true, createdAt: true },
      },
    },
  });
  if (!ride) {
    throw new AppError(404, "NOT_FOUND", "Ride request not found");
  }
  return ride;
}

export async function getActiveRide(passengerId: string) {
  const ride = await prisma.rideRequest.findFirst({
    where: { passengerId, status: { in: ["REQUESTED", "MATCHED", "IN_PROGRESS"] } },
    orderBy: { createdAt: "desc" },
    select: {
      ...rideSelect,
      memberships: {
        where: { leftAt: null },
        select: {
          pool: {
            select: {
              status: true,
              driver: { select: { name: true } },
              vehicle: { select: { name: true } },
              members: { where: { leftAt: null }, select: { id: true } },
            },
          },
        },
      },
    },
  });
  if (!ride) return null;

  const pool = ride.memberships[0]?.pool;
  return {
    ...ride,
    pool: pool
      ? {
          status: pool.status,
          driver: pool.driver,
          vehicle: pool.vehicle,
          coRiderCount: Math.max(0, pool.members.length - 1),
          myFarePaisa: ride.finalFarePaisa ?? ride.estimatedFarePaisa,
        }
      : null,
  };
}

export async function cancelRide(passengerId: string, rideId: string, input: CancelRideInput) {
  return prisma.$transaction(async (tx) => {
    const ride = await tx.rideRequest.findFirst({
      where: { id: rideId, passengerId },
      select: { id: true, status: true, memberships: { where: { leftAt: null }, select: { id: true, poolId: true, seats: true, pool: { select: { status: true } } } } },
    });
    if (!ride) {
      throw new AppError(404, "NOT_FOUND", "Ride request not found");
    }
    if (ride.status !== "REQUESTED" && ride.status !== "MATCHED") {
      throw new AppError(409, "INVALID_RIDE_STATE", `Ride cannot be cancelled while ${ride.status}`);
    }

    const membership = ride.memberships[0];
    if (membership) {
      if (membership.pool.status !== "ACCEPTED" && membership.pool.status !== "DRIVER_ARRIVED") {
        throw new AppError(409, "INVALID_RIDE_STATE", "Ride cannot be cancelled after the trip has started");
      }
      await tx.poolMember.update({ where: { id: membership.id }, data: { leftAt: new Date() } });
      await tx.$executeRaw`
        UPDATE pools
        SET seats_occupied = seats_occupied - ${membership.seats}
        WHERE id = ${membership.poolId}::uuid
      `;
      const remaining = await tx.poolMember.count({ where: { poolId: membership.poolId, leftAt: null } });
      if (remaining === 0) {
        await tx.pool.update({ where: { id: membership.poolId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
        await tx.rideEvent.create({
          data: { poolId: membership.poolId, actorId: passengerId, type: "POOL_CANCELLED", fromStatus: membership.pool.status, toStatus: "CANCELLED" },
        });
      } else {
        await recalculatePoolFares(tx, membership.poolId);
      }
    }

    const cancelledAt = new Date();
    const cancelled = await tx.rideRequest.update({
      where: { id: ride.id },
      data: { status: "CANCELLED", cancelReason: input.reason, cancelledAt },
      select: rideSelect,
    });
    await tx.rideEvent.create({
      data: {
        rideRequestId: ride.id,
        actorId: passengerId,
        type: "RIDE_CANCELLED",
        fromStatus: ride.status,
        toStatus: "CANCELLED",
        metadata: input.reason ? { reason: input.reason } : undefined,
      },
    });
    return toRide(cancelled);
  });
}