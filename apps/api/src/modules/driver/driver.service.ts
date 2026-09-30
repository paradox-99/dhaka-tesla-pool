import { Prisma, type PoolStatus, type RideStatus } from "../../generated/prisma/client.js";
import { assertPoolTransition, assertRideTransition } from "../../domain/stateMachine.js";
import { calculateFare } from "../../domain/fare.js";
import { isCompatible } from "../../domain/matching.js";
import { AppError } from "../../errors/AppError.js";
import { prisma } from "../../lib/prisma.js";
import { claimSeat, recalculatePoolFares } from "../rides/pooling.service.js";
import type { CancelPoolInput, DriverStatusInput } from "./driver.schemas.js";

const driverPoolInclude = {
  driver: { select: { id: true, name: true } },
  vehicle: { select: { id: true, name: true, plateNumber: true, capacity: true, isOnline: true } },
  pickupZone: { select: { id: true, name: true, x: true, y: true } },
  members: {
    where: { leftAt: null },
    orderBy: { joinedAt: "asc" },
    include: {
      rideRequest: {
        include: {
          passenger: { select: { id: true, name: true } },
          pickupZone: { select: { id: true, name: true } },
          dropoffZone: { select: { id: true, name: true, x: true, y: true } },
        },
      },
    },
  },
} as const;

type DriverPool = Prisma.PoolGetPayload<{ include: typeof driverPoolInclude }>;
type DbClient = typeof prisma | Prisma.TransactionClient;

function toDriverPool(pool: DriverPool) {
  return {
    id: pool.id,
    status: pool.status,
    capacity: pool.capacity,
    seatsOccupied: pool.seatsOccupied,
    createdAt: pool.createdAt,
    arrivedAt: pool.arrivedAt,
    startedAt: pool.startedAt,
    completedAt: pool.completedAt,
    cancelledAt: pool.cancelledAt,
    driver: pool.driver,
    vehicle: pool.vehicle,
    pickupZone: pool.pickupZone,
    members: pool.members.map((member) => ({
      id: member.id,
      seats: member.seats,
      joinedAt: member.joinedAt,
      passenger: member.rideRequest.passenger,
      pickupZone: member.rideRequest.pickupZone,
      dropoffZone: member.rideRequest.dropoffZone,
      status: member.rideRequest.status,
      farePaisa: member.rideRequest.finalFarePaisa ?? member.rideRequest.estimatedFarePaisa,
      paymentMethod: member.rideRequest.paymentMethod,
    })),
  };
}

async function getVehicleForDriver(driverId: string, tx: DbClient = prisma) {
  const vehicle = await tx.vehicle.findUnique({ where: { driverId } });
  if (!vehicle) throw new AppError(404, "NOT_FOUND", "Driver vehicle not found");
  return vehicle;
}

async function requireOnlineVehicle(driverId: string, tx: DbClient = prisma) {
  const vehicle = await getVehicleForDriver(driverId, tx);
  if (!vehicle.isOnline) throw new AppError(409, "DRIVER_OFFLINE", "Driver must be online for this action");
  return vehicle;
}

async function getPoolForDriver(poolId: string, driverId: string, tx: DbClient = prisma) {
  const pool = await tx.pool.findFirst({ where: { id: poolId, driverId }, include: driverPoolInclude });
  if (!pool) throw new AppError(404, "NOT_FOUND", "Pool not found");
  return pool;
}

async function getCurrentPoolForDriver(driverId: string, tx: DbClient = prisma) {
  return tx.pool.findFirst({
    where: { driverId, status: { in: ["ACCEPTED", "DRIVER_ARRIVED", "STARTED"] } },
    include: driverPoolInclude,
  });
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function setDriverStatus(driverId: string, input: DriverStatusInput) {
  const vehicle = await getVehicleForDriver(driverId);
  if (!input.isOnline) {
    const activePool = await prisma.pool.findFirst({ where: { driverId, status: { in: ["ACCEPTED", "DRIVER_ARRIVED", "STARTED"] } } });
    if (activePool) throw new AppError(409, "ACTIVE_POOL_EXISTS", "Complete or cancel the active pool before going offline");
  }
  return prisma.vehicle.update({ where: { id: vehicle.id }, data: { isOnline: input.isOnline } });
}

export async function listRequests(driverId: string) {
  const vehicle = await requireOnlineVehicle(driverId);
  const pool = await getCurrentPoolForDriver(driverId);
  if (pool && pool.status !== "ACCEPTED") return [];

  const requests = await prisma.rideRequest.findMany({
    where: { status: "REQUESTED", ...(pool ? { pickupZoneId: pool.pickupZoneId } : {}) },
    orderBy: { createdAt: "asc" },
    include: {
      passenger: { select: { id: true, name: true } },
      pickupZone: { select: { id: true, name: true, x: true, y: true } },
      dropoffZone: { select: { id: true, name: true, x: true, y: true } },
    },
  });

  return requests.filter((request) => {
    if (!pool) return request.seats <= vehicle.capacity;
    return isCompatible(
      { pickupZoneId: request.pickupZoneId, dropoff: request.dropoffZone, seats: request.seats },
      pool,
      pool.members.map((member) => member.rideRequest.dropoffZone),
    );
  }).map((request) => ({
    id: request.id,
    passenger: request.passenger,
    pickupZone: request.pickupZone,
    dropoffZone: request.dropoffZone,
    seats: request.seats,
    distanceKm: request.distanceKm,
    estimatedFarePaisa: request.estimatedFarePaisa,
    paymentMethod: request.paymentMethod,
    createdAt: request.createdAt,
  }));
}

export async function acceptRequest(driverId: string, rideId: string) {
  try {
    await prisma.$transaction(async (tx) => {
      const vehicle = await requireOnlineVehicle(driverId, tx);
      const ride = await tx.rideRequest.findFirst({
        where: { id: rideId, status: "REQUESTED" },
        include: { dropoffZone: { select: { x: true, y: true } } },
      });
      if (!ride) throw new AppError(404, "NOT_FOUND", "Ride request not found");

      const currentPool = await getCurrentPoolForDriver(driverId, tx);
      if (currentPool && currentPool.status !== "ACCEPTED") {
        throw new AppError(409, "POOL_NOT_OPEN", "The current pool is no longer accepting passengers");
      }

      let poolId: string;
      if (currentPool) {
        const compatible = isCompatible(
          { pickupZoneId: ride.pickupZoneId, dropoff: ride.dropoffZone, seats: ride.seats },
          currentPool,
          currentPool.members.map((member) => member.rideRequest.dropoffZone),
        );
        if (!compatible) throw new AppError(409, "NOT_COMPATIBLE", "This ride does not fit the current pool");
        await claimSeat(tx, currentPool.id, ride.seats);
        poolId = currentPool.id;
      } else {
        if (ride.seats > vehicle.capacity) throw new AppError(409, "POOL_FULL", "No seats left in this Tesla");
        const pool = await tx.pool.create({
          data: { driverId, vehicleId: vehicle.id, pickupZoneId: ride.pickupZoneId, capacity: vehicle.capacity, seatsOccupied: ride.seats },
        });
        poolId = pool.id;
        await tx.rideEvent.create({ data: { poolId, actorId: driverId, type: "POOL_ACCEPTED", toStatus: "ACCEPTED" } });
      }

      await tx.poolMember.create({ data: { poolId, rideRequestId: ride.id, seats: ride.seats } });
      await tx.rideRequest.update({ where: { id: ride.id }, data: { status: "MATCHED" } });
      await recalculatePoolFares(tx, poolId);
      await tx.rideEvent.create({ data: { poolId, rideRequestId: ride.id, actorId: driverId, type: "POOL_JOINED", fromStatus: "REQUESTED", toStatus: "MATCHED" } });
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) throw new AppError(409, "REQUEST_ALREADY_MATCHED", "This ride request was already accepted");
    throw err;
  }
  return getCurrentPool(driverId);
}

export async function getCurrentPool(driverId: string) {
  const pool = await getCurrentPoolForDriver(driverId);
  return pool ? toDriverPool(pool) : null;
}

export async function startArriving(driverId: string, poolId: string) {
  return transitionPool(driverId, poolId, "DRIVER_ARRIVED");
}

export async function startTrip(driverId: string, poolId: string) {
  await prisma.$transaction(async (tx) => {
    const pool = await getPoolForDriver(poolId, driverId, tx);
    assertPoolTransition(pool.status, "STARTED");
    const members = await tx.poolMember.findMany({ where: { poolId, leftAt: null }, include: { rideRequest: true } });
    const pooled = members.length >= 2;
    for (const member of members) {
      assertRideTransition(member.rideRequest.status, "IN_PROGRESS");
      const fare = calculateFare({ distanceKm: member.rideRequest.distanceKm, seats: member.rideRequest.seats, pooled });
      await tx.rideRequest.update({ where: { id: member.rideRequestId }, data: { status: "IN_PROGRESS", finalFarePaisa: fare.total } });
      await tx.rideEvent.create({ data: { poolId, rideRequestId: member.rideRequestId, actorId: driverId, type: "RIDE_IN_PROGRESS", fromStatus: member.rideRequest.status, toStatus: "IN_PROGRESS" } });
    }
    await tx.pool.update({ where: { id: poolId }, data: { status: "STARTED", startedAt: new Date() } });
    await tx.rideEvent.create({ data: { poolId, actorId: driverId, type: "POOL_STARTED", fromStatus: pool.status, toStatus: "STARTED" } });
  });
  return getCurrentPool(driverId);
}

async function transitionPool(driverId: string, poolId: string, to: PoolStatus) {
  await prisma.$transaction(async (tx) => {
    const pool = await getPoolForDriver(poolId, driverId, tx);
    assertPoolTransition(pool.status, to);
    await tx.pool.update({ where: { id: poolId }, data: { status: to, arrivedAt: to === "DRIVER_ARRIVED" ? new Date() : undefined } });
    await tx.rideEvent.create({ data: { poolId, actorId: driverId, type: `POOL_${to}`, fromStatus: pool.status, toStatus: to } });
  });
  return getCurrentPool(driverId);
}

export async function completeTrip(driverId: string, poolId: string) {
  await prisma.$transaction(async (tx) => {
    const pool = await getPoolForDriver(poolId, driverId, tx);
    assertPoolTransition(pool.status, "COMPLETED");
    const members = await tx.poolMember.findMany({ where: { poolId, leftAt: null }, include: { rideRequest: true } });
    for (const member of members) {
      assertRideTransition(member.rideRequest.status, "COMPLETED");
      const amountPaisa = member.rideRequest.finalFarePaisa ?? member.rideRequest.estimatedFarePaisa;
      let paymentStatus: "PAID" | "FAILED" = "PAID";
      if (member.rideRequest.paymentMethod === "TESLAPAY") {
        const charged = await tx.$executeRaw`
          UPDATE users SET wallet_balance_paisa = wallet_balance_paisa - ${amountPaisa}
          WHERE id = ${member.rideRequest.passengerId}::uuid AND wallet_balance_paisa >= ${amountPaisa}
        `;
        paymentStatus = charged === 1 ? "PAID" : "FAILED";
      }
      await tx.rideRequest.update({ where: { id: member.rideRequestId }, data: { status: "COMPLETED", completedAt: new Date() } });
      await tx.payment.create({ data: { rideRequestId: member.rideRequestId, amountPaisa, method: member.rideRequest.paymentMethod, status: paymentStatus } });
      await tx.rideEvent.create({ data: { poolId, rideRequestId: member.rideRequestId, actorId: driverId, type: "RIDE_COMPLETED", fromStatus: member.rideRequest.status, toStatus: "COMPLETED", metadata: { paymentStatus } } });
    }
    await tx.pool.update({ where: { id: poolId }, data: { status: "COMPLETED", completedAt: new Date() } });
    await tx.rideEvent.create({ data: { poolId, actorId: driverId, type: "POOL_COMPLETED", fromStatus: pool.status, toStatus: "COMPLETED" } });
  });
  return toDriverPool(await getPoolForDriver(poolId, driverId));
}

export async function cancelPool(driverId: string, poolId: string, input: CancelPoolInput) {
  await prisma.$transaction(async (tx) => {
    const pool = await getPoolForDriver(poolId, driverId, tx);
    assertPoolTransition(pool.status, "CANCELLED");
    const members = await tx.poolMember.findMany({ where: { poolId, leftAt: null }, include: { rideRequest: true } });
    for (const member of members) {
      assertRideTransition(member.rideRequest.status, "REQUESTED");
      await tx.poolMember.update({ where: { id: member.id }, data: { leftAt: new Date() } });
      await tx.rideRequest.update({ where: { id: member.rideRequestId }, data: { status: "REQUESTED" } });
      await tx.rideEvent.create({ data: { poolId, rideRequestId: member.rideRequestId, actorId: driverId, type: "RIDE_RETURNED_TO_QUEUE", fromStatus: member.rideRequest.status, toStatus: "REQUESTED" } });
    }
    await tx.pool.update({ where: { id: poolId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await tx.rideEvent.create({ data: { poolId, actorId: driverId, type: "POOL_CANCELLED", fromStatus: pool.status, toStatus: "CANCELLED", metadata: input.reason ? { reason: input.reason } : undefined } });
  });
  return toDriverPool(await getPoolForDriver(poolId, driverId));
}

export async function listPoolHistory(driverId: string) {
  const pools = await prisma.pool.findMany({ where: { driverId, status: { in: ["COMPLETED", "CANCELLED"] } }, orderBy: { createdAt: "desc" }, include: driverPoolInclude });
  return pools.map(toDriverPool);
}