import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const ZONES = [
  { name: "Uttara", x: 2, y: 12 },
  { name: "Bashundhara", x: 6, y: 6 },
  { name: "Mirpur", x: -4, y: 4 },
  { name: "Banani", x: 2, y: 4 },
  { name: "Gulshan 2", x: 4, y: 4 },
  { name: "Gulshan 1", x: 4, y: 3 },
  { name: "Mohakhali", x: 2, y: 2 },
  { name: "Tejgaon", x: 3, y: 1 },
  { name: "Farmgate", x: 1, y: 0 },
  { name: "Dhanmondi", x: 0, y: -3 },
];

const BASE_FARE_PAISA = 3000;
const PER_KM_RATE_PAISA = 2000;
const POOL_DISCOUNT_PCT = 20;

function soloFarePaisa(seats: number, distanceKm: number) {
  return seats * (BASE_FARE_PAISA + PER_KM_RATE_PAISA * distanceKm);
}

function pooledFarePaisa(seats: number, distanceKm: number) {
  const subtotal = soloFarePaisa(seats, distanceKm);
  const discount = Math.floor((subtotal * POOL_DISCOUNT_PCT) / 100);
  return subtotal - discount;
}

async function hash(password: string) {
  return bcrypt.hash(password, 10);
}

async function main() {
  for (const zone of ZONES) {
    await prisma.zone.upsert({
      where: { name: zone.name },
      update: { x: zone.x, y: zone.y },
      create: zone,
    });
  }

  const banani = await prisma.zone.findUniqueOrThrow({ where: { name: "Banani" } });
  const mohakhali = await prisma.zone.findUniqueOrThrow({ where: { name: "Mohakhali" } });
  const gulshan1 = await prisma.zone.findUniqueOrThrow({ where: { name: "Gulshan 1" } });

  const jashim = await prisma.user.upsert({
    where: { email: "jashim@teslapool.dev" },
    update: {},
    create: {
      name: "Jashim",
      email: "jashim@teslapool.dev",
      passwordHash: await hash("Bullet@123"),
      role: "DRIVER",
      walletBalancePaisa: 0,
    },
  });

  await prisma.vehicle.upsert({
    where: { driverId: jashim.id },
    update: {},
    create: {
      driverId: jashim.id,
      name: "Bullet",
      plateNumber: "DHAKA-METRO-3W-1122",
      capacity: 3,
      isOnline: false,
    },
  });

  const karim = await prisma.user.upsert({
    where: { email: "karim@teslapool.dev" },
    update: {},
    create: {
      name: "Karim",
      email: "karim@teslapool.dev",
      passwordHash: await hash("Karim@123"),
      role: "DRIVER",
      walletBalancePaisa: 0,
    },
  });

  await prisma.vehicle.upsert({
    where: { driverId: karim.id },
    update: {},
    create: {
      driverId: karim.id,
      name: "Toofan",
      plateNumber: "DHAKA-METRO-3W-2244",
      capacity: 3,
      isOnline: false,
    },
  });

  const nusrat = await prisma.user.upsert({
    where: { email: "nusrat@teslapool.dev" },
    update: {},
    create: {
      name: "Nusrat",
      email: "nusrat@teslapool.dev",
      passwordHash: await hash("Nusrat@123"),
      role: "PASSENGER",
      walletBalancePaisa: 50000,
    },
  });

  const rafiq = await prisma.user.upsert({
    where: { email: "rafiq@teslapool.dev" },
    update: {},
    create: {
      name: "Rafiq",
      email: "rafiq@teslapool.dev",
      passwordHash: await hash("Rafiq@123"),
      role: "PASSENGER",
      walletBalancePaisa: 0,
    },
  });

  await prisma.user.upsert({
    where: { email: "shirin@teslapool.dev" },
    update: {},
    create: {
      name: "Shirin",
      email: "shirin@teslapool.dev",
      passwordHash: await hash("Shirin@123"),
      role: "PASSENGER",
      walletBalancePaisa: 20000,
    },
  });

  // One completed historical pool (Nusrat + Rafiq, yesterday) so history pages aren't empty.
  const existingHistoricalPool = await prisma.pool.findFirst({
    where: { driverId: jashim.id, status: "COMPLETED" },
  });

  if (!existingHistoricalPool) {
    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;
    const createdAt = new Date(now - dayMs - 20 * 60 * 1000);
    const arrivedAt = new Date(now - dayMs - 15 * 60 * 1000);
    const startedAt = new Date(now - dayMs - 10 * 60 * 1000);
    const completedAt = new Date(now - dayMs);

    const nusratDistanceKm = Math.abs(banani.x - mohakhali.x) + Math.abs(banani.y - mohakhali.y);
    const rafiqDistanceKm = Math.abs(banani.x - gulshan1.x) + Math.abs(banani.y - gulshan1.y);

    const nusratFinalFare = pooledFarePaisa(1, nusratDistanceKm);
    const rafiqFinalFare = pooledFarePaisa(1, rafiqDistanceKm);

    await prisma.$transaction(async (tx) => {
      const pool = await tx.pool.create({
        data: {
          driverId: jashim.id,
          vehicleId: (await tx.vehicle.findUniqueOrThrow({ where: { driverId: jashim.id } })).id,
          pickupZoneId: banani.id,
          capacity: 3,
          seatsOccupied: 2,
          status: "COMPLETED",
          createdAt,
          arrivedAt,
          startedAt,
          completedAt,
        },
      });

      const nusratRequest = await tx.rideRequest.create({
        data: {
          passengerId: nusrat.id,
          pickupZoneId: banani.id,
          dropoffZoneId: mohakhali.id,
          seats: 1,
          distanceKm: nusratDistanceKm,
          status: "COMPLETED",
          paymentMethod: "TESLAPAY",
          estimatedFarePaisa: soloFarePaisa(1, nusratDistanceKm),
          finalFarePaisa: nusratFinalFare,
          createdAt,
          updatedAt: completedAt,
          completedAt,
        },
      });

      const rafiqRequest = await tx.rideRequest.create({
        data: {
          passengerId: rafiq.id,
          pickupZoneId: banani.id,
          dropoffZoneId: gulshan1.id,
          seats: 1,
          distanceKm: rafiqDistanceKm,
          status: "COMPLETED",
          paymentMethod: "CASH",
          estimatedFarePaisa: soloFarePaisa(1, rafiqDistanceKm),
          finalFarePaisa: rafiqFinalFare,
          createdAt,
          updatedAt: completedAt,
          completedAt,
        },
      });

      await tx.poolMember.create({
        data: { poolId: pool.id, rideRequestId: nusratRequest.id, seats: 1, joinedAt: createdAt },
      });
      await tx.poolMember.create({
        data: { poolId: pool.id, rideRequestId: rafiqRequest.id, seats: 1, joinedAt: createdAt },
      });

      await tx.rideEvent.createMany({
        data: [
          {
            rideRequestId: nusratRequest.id,
            actorId: nusrat.id,
            type: "RIDE_REQUESTED",
            toStatus: "REQUESTED",
            createdAt,
          },
          {
            poolId: pool.id,
            actorId: jashim.id,
            type: "POOL_ACCEPTED",
            toStatus: "ACCEPTED",
            createdAt,
          },
          {
            poolId: pool.id,
            rideRequestId: nusratRequest.id,
            actorId: nusrat.id,
            type: "POOL_JOINED",
            fromStatus: "REQUESTED",
            toStatus: "MATCHED",
            createdAt,
          },
          {
            rideRequestId: rafiqRequest.id,
            actorId: rafiq.id,
            type: "RIDE_REQUESTED",
            toStatus: "REQUESTED",
            createdAt,
          },
          {
            poolId: pool.id,
            rideRequestId: rafiqRequest.id,
            actorId: rafiq.id,
            type: "POOL_JOINED",
            fromStatus: "REQUESTED",
            toStatus: "MATCHED",
            createdAt,
          },
          {
            poolId: pool.id,
            actorId: jashim.id,
            type: "POOL_DRIVER_ARRIVED",
            fromStatus: "ACCEPTED",
            toStatus: "DRIVER_ARRIVED",
            createdAt: arrivedAt,
          },
          {
            poolId: pool.id,
            actorId: jashim.id,
            type: "POOL_STARTED",
            fromStatus: "DRIVER_ARRIVED",
            toStatus: "STARTED",
            createdAt: startedAt,
          },
          {
            poolId: pool.id,
            actorId: jashim.id,
            type: "POOL_COMPLETED",
            fromStatus: "STARTED",
            toStatus: "COMPLETED",
            createdAt: completedAt,
          },
        ],
      });

      await tx.payment.create({
        data: {
          rideRequestId: nusratRequest.id,
          amountPaisa: nusratFinalFare,
          method: "TESLAPAY",
          status: "PAID",
          createdAt: completedAt,
        },
      });

      await tx.payment.create({
        data: {
          rideRequestId: rafiqRequest.id,
          amountPaisa: rafiqFinalFare,
          method: "CASH",
          status: "PAID",
          createdAt: completedAt,
        },
      });
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
