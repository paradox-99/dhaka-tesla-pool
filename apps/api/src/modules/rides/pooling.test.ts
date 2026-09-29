import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { calculateFare } from "../../domain/fare.js";
import { prisma } from "../../lib/prisma.js";

const app = createApp();
let bananiId: number;
let uttaraId: number;
let mohakhaliId: number;
let gulshan1Id: number;

async function register(name: string) {
  const response = await request(app).post("/api/auth/register").send({
    name,
    email: `${name.toLowerCase()}-${randomUUID()}@teslapool.dev`,
    password: `${name}@12345`,
  });
  expect(response.status).toBe(201);
  return { id: response.body.user.id as string, token: response.body.token as string };
}

async function createPoolWithMember(memberSeats: number) {
  const driver = await prisma.user.create({
    data: { name: "Jashim", email: `${randomUUID()}@teslapool.dev`, passwordHash: "test", role: "DRIVER" },
  });
  const vehicle = await prisma.vehicle.create({
    data: { driverId: driver.id, name: "Bullet", plateNumber: `DHAKA-${randomUUID()}`, capacity: 3 },
  });
  const pool = await prisma.pool.create({
    data: { driverId: driver.id, vehicleId: vehicle.id, pickupZoneId: uttaraId, capacity: 3, seatsOccupied: memberSeats },
  });
  const memberPassenger = await prisma.user.create({
    data: { name: "Nusrat", email: `${randomUUID()}@teslapool.dev`, passwordHash: "test", role: "PASSENGER" },
  });
  const memberRequest = await prisma.rideRequest.create({
    data: {
      passengerId: memberPassenger.id,
      pickupZoneId: uttaraId,
      dropoffZoneId: mohakhaliId,
      seats: memberSeats,
      distanceKm: 10,
      status: "MATCHED",
      estimatedFarePaisa: calculateFare({ distanceKm: 10, seats: memberSeats, pooled: false }).total,
    },
  });
  await prisma.poolMember.create({ data: { poolId: pool.id, rideRequestId: memberRequest.id, seats: memberSeats } });
  return pool.id;
}

beforeAll(async () => {
  const zones = await Promise.all([
    prisma.zone.upsert({ where: { name: "Banani" }, update: { x: 2, y: 4 }, create: { name: "Banani", x: 2, y: 4 } }),
    prisma.zone.upsert({ where: { name: "Uttara" }, update: { x: 2, y: 12 }, create: { name: "Uttara", x: 2, y: 12 } }),
    prisma.zone.upsert({ where: { name: "Mohakhali" }, update: { x: 2, y: 2 }, create: { name: "Mohakhali", x: 2, y: 2 } }),
    prisma.zone.upsert({ where: { name: "Gulshan 1" }, update: { x: 4, y: 3 }, create: { name: "Gulshan 1", x: 4, y: 3 } }),
  ]);
  bananiId = zones[0].id;
  uttaraId = zones[1].id;
  mohakhaliId = zones[2].id;
  gulshan1Id = zones[3].id;
  await prisma.pool.updateMany({ where: { pickupZoneId: uttaraId, status: "ACCEPTED" }, data: { status: "CANCELLED", cancelledAt: new Date() } });
});

describe("automatic Tesla pooling", () => {
  it("joins a compatible pool and recalculates both fares", async () => {
    const poolId = await createPoolWithMember(1);
    const passenger = await register("Rafiq");
    const response = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${passenger.token}`)
      .send({ pickupZoneId: uttaraId, dropoffZoneId: gulshan1Id, seats: 1, paymentMethod: "CASH" });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe("MATCHED");
    expect(response.body.estimatedFarePaisa).toBe(20000);

    const pool = await prisma.pool.findUniqueOrThrow({ where: { id: poolId } });
    const members = await prisma.poolMember.findMany({ where: { poolId, leftAt: null }, include: { rideRequest: true } });
    expect(pool.seatsOccupied).toBe(2);
    expect(members).toHaveLength(2);
    expect(members[0].rideRequest.estimatedFarePaisa).toBe(18400);
    await prisma.pool.update({ where: { id: poolId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  });

  it("allows exactly one concurrent claimant to take the last seat", async () => {
    const poolId = await createPoolWithMember(2);
    const passengers = await Promise.all([register("Nusrat"), register("Shirin")]);
    const payload = { pickupZoneId: uttaraId, dropoffZoneId: gulshan1Id, seats: 1, paymentMethod: "CASH" };
    const responses = await Promise.all(
      passengers.map((passenger) => request(app).post("/api/rides").set("Authorization", `Bearer ${passenger.token}`).send(payload)),
    );

    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(responses.filter((response) => response.body.status === "MATCHED")).toHaveLength(1);
    expect(responses.filter((response) => response.body.status === "REQUESTED")).toHaveLength(1);

    const pool = await prisma.pool.findUniqueOrThrow({ where: { id: poolId } });
    expect(pool.seatsOccupied).toBe(3);
  });

  it("releases seats and removes the pooled discount when a passenger cancels", async () => {
    const poolId = await createPoolWithMember(1);
    const passenger = await register("RafiqCancel");
    const created = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${passenger.token}`)
      .send({ pickupZoneId: uttaraId, dropoffZoneId: gulshan1Id, seats: 1, paymentMethod: "CASH" });
    expect(created.body.status).toBe("MATCHED");

    const cancelled = await request(app)
      .post(`/api/rides/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${passenger.token}`)
      .send({ reason: "No longer needed" });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("CANCELLED");

    const pool = await prisma.pool.findUniqueOrThrow({ where: { id: poolId } });
    const member = await prisma.poolMember.findFirstOrThrow({ where: { poolId, leftAt: null }, include: { rideRequest: true } });
    expect(pool.seatsOccupied).toBe(1);
    expect(member.rideRequest.estimatedFarePaisa).toBe(23000);
  });
});