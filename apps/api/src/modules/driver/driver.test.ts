import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";

const app = createApp();
let bananiId: number;
let uttaraId: number;
let mohakhaliId: number;

async function createDriver(name: string) {
  const driver = await prisma.user.create({
    data: { name, email: `${randomUUID()}@teslapool.dev`, passwordHash: "test", role: "DRIVER" },
  });
  const vehicle = await prisma.vehicle.create({
    data: { driverId: driver.id, name: "Bullet", plateNumber: `DHAKA-${randomUUID()}`, capacity: 3 },
  });
  return {
    id: driver.id,
    token: jwt.sign({ sub: driver.id, role: "DRIVER" }, env.JWT_SECRET, { expiresIn: "1d" }),
    vehicleId: vehicle.id,
  };
}

async function createPassenger(name: string, walletBalancePaisa = 0) {
  const passenger = await prisma.user.create({
    data: { name, email: `${randomUUID()}@teslapool.dev`, passwordHash: "test", role: "PASSENGER", walletBalancePaisa },
  });
  return {
    id: passenger.id,
    token: jwt.sign({ sub: passenger.id, role: "PASSENGER" }, env.JWT_SECRET, { expiresIn: "1d" }),
  };
}

beforeAll(async () => {
  const zones = await Promise.all([
    prisma.zone.upsert({ where: { name: "Banani" }, update: { x: 2, y: 4 }, create: { name: "Banani", x: 2, y: 4 } }),
    prisma.zone.upsert({ where: { name: "Uttara" }, update: { x: 2, y: 12 }, create: { name: "Uttara", x: 2, y: 12 } }),
    prisma.zone.upsert({ where: { name: "Mohakhali" }, update: { x: 2, y: 2 }, create: { name: "Mohakhali", x: 2, y: 2 } }),
  ]);
  bananiId = zones[0].id;
  uttaraId = zones[1].id;
  mohakhaliId = zones[2].id;
  await prisma.pool.updateMany({ where: { pickupZoneId: uttaraId, status: "ACCEPTED" }, data: { status: "CANCELLED", cancelledAt: new Date() } });
});

describe("driver flow", () => {
  it("runs a TeslaPay ride through completion and locks the fare", async () => {
    const driver = await createDriver("Jashim");
    const passenger = await createPassenger("Nusrat", 30000);

    const online = await request(app).patch("/api/driver/status").set("Authorization", `Bearer ${driver.token}`).send({ isOnline: true });
    expect(online.status).toBe(200);
    const ride = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${passenger.token}`)
      .send({ pickupZoneId: uttaraId, dropoffZoneId: mohakhaliId, seats: 1, paymentMethod: "TESLAPAY" });
    expect(ride.status).toBe(201);

    const feed = await request(app).get("/api/driver/requests").set("Authorization", `Bearer ${driver.token}`);
    expect(feed.status).toBe(200);
    expect(feed.body.requests.some((request: { id: string }) => request.id === ride.body.id)).toBe(true);

    const accepted = await request(app).post(`/api/driver/requests/${ride.body.id}/accept`).set("Authorization", `Bearer ${driver.token}`);
    expect(accepted.status).toBe(200);
    expect(accepted.body.status).toBe("ACCEPTED");
    expect(accepted.body.seatsOccupied).toBe(1);

    const arrived = await request(app).post(`/api/driver/pools/${accepted.body.id}/arrive`).set("Authorization", `Bearer ${driver.token}`);
    expect(arrived.body.status).toBe("DRIVER_ARRIVED");
    const started = await request(app).post(`/api/driver/pools/${accepted.body.id}/start`).set("Authorization", `Bearer ${driver.token}`);
    expect(started.body.status).toBe("STARTED");
    expect(started.body.members[0].farePaisa).toBe(23000);

    const completed = await request(app).post(`/api/driver/pools/${accepted.body.id}/complete`).set("Authorization", `Bearer ${driver.token}`);
    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe("COMPLETED");
    const storedRide = await prisma.rideRequest.findUniqueOrThrow({ where: { id: ride.body.id } });
    const payment = await prisma.payment.findUniqueOrThrow({ where: { rideRequestId: ride.body.id } });
    const storedPassenger = await prisma.user.findUniqueOrThrow({ where: { id: passenger.id } });
    expect(storedRide.status).toBe("COMPLETED");
    expect(storedRide.finalFarePaisa).toBe(23000);
    expect(payment.status).toBe("PAID");
    expect(storedPassenger.walletBalancePaisa).toBe(7000);
  });

  it("enforces driver ownership and refuses invalid lifecycle actions", async () => {
    const owner = await createDriver("JashimOwner");
    const otherDriver = await createDriver("Karim");
    const passenger = await createPassenger("Rafiq");
    await request(app).patch("/api/driver/status").set("Authorization", `Bearer ${owner.token}`).send({ isOnline: true });
    const ride = await request(app).post("/api/rides").set("Authorization", `Bearer ${passenger.token}`).send({ pickupZoneId: uttaraId, dropoffZoneId: mohakhaliId, seats: 1, paymentMethod: "CASH" });
    const accepted = await request(app).post(`/api/driver/requests/${ride.body.id}/accept`).set("Authorization", `Bearer ${owner.token}`);
    const offline = await request(app).patch("/api/driver/status").set("Authorization", `Bearer ${owner.token}`).send({ isOnline: false });
    const forbidden = await request(app).post(`/api/driver/pools/${accepted.body.id}/arrive`).set("Authorization", `Bearer ${otherDriver.token}`);
    const skipped = await request(app).post(`/api/driver/pools/${accepted.body.id}/start`).set("Authorization", `Bearer ${owner.token}`);
    expect(forbidden.status).toBe(404);
    expect(offline.status).toBe(409);
    expect(offline.body.error.code).toBe("ACTIVE_POOL_EXISTS");
    expect(skipped.status).toBe(409);
    expect(skipped.body.error.code).toBe("INVALID_TRANSITION");
  });
});