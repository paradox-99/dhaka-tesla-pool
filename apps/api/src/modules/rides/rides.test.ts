import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";

const app = createApp();
let bananiId: number;
let mohakhaliId: number;
let gulshan1Id: number;

async function register(name: string) {
  const password = `${name}@12345`;
  const response = await request(app).post("/api/auth/register").send({
    name,
    email: `${name.toLowerCase()}-${randomUUID()}@teslapool.dev`,
    password,
  });
  expect(response.status).toBe(201);
  return response.body.token as string;
}

beforeAll(async () => {
  const zones = await Promise.all([
    prisma.zone.upsert({ where: { name: "Banani" }, update: { x: 2, y: 4 }, create: { name: "Banani", x: 2, y: 4 } }),
    prisma.zone.upsert({ where: { name: "Mohakhali" }, update: { x: 2, y: 2 }, create: { name: "Mohakhali", x: 2, y: 2 } }),
    prisma.zone.upsert({ where: { name: "Gulshan 1" }, update: { x: 4, y: 3 }, create: { name: "Gulshan 1", x: 4, y: 3 } }),
  ]);
  bananiId = zones[0].id;
  mohakhaliId = zones[1].id;
  gulshan1Id = zones[2].id;
});

describe("passenger ride requests", () => {
  it("creates a solo-priced ride and records the request event", async () => {
    const token = await register("Nusrat");
    const response = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${token}`)
      .send({ pickupZoneId: bananiId, dropoffZoneId: mohakhaliId, seats: 1, paymentMethod: "TESLAPAY" });

    expect(response.status).toBe(201);
    expect(response.body.distanceKm).toBe(2);
    expect(response.body.estimatedFarePaisa).toBe(7000);
    expect(response.body.status).toBe("REQUESTED");

    const detail = await request(app)
      .get(`/api/rides/${response.body.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(detail.status).toBe(200);
    expect(detail.body.events).toHaveLength(1);
    expect(detail.body.events[0].type).toBe("RIDE_REQUESTED");
  });

  it("maps the active-ride constraint to ACTIVE_RIDE_EXISTS", async () => {
    const token = await register("Rafiq");
    const payload = { pickupZoneId: bananiId, dropoffZoneId: gulshan1Id, seats: 1, paymentMethod: "CASH" };
    const first = await request(app).post("/api/rides").set("Authorization", `Bearer ${token}`).send(payload);
    const second = await request(app).post("/api/rides").set("Authorization", `Bearer ${token}`).send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("ACTIVE_RIDE_EXISTS");
  });

  it("rejects equal zones and hides another passenger's ride", async () => {
    const ownerToken = await register("Shirin");
    const otherToken = await register("Karim");
    const invalid = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ pickupZoneId: bananiId, dropoffZoneId: bananiId, seats: 1, paymentMethod: "CASH" });
    expect(invalid.status).toBe(400);

    const created = await request(app)
      .post("/api/rides")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ pickupZoneId: bananiId, dropoffZoneId: mohakhaliId, seats: 1, paymentMethod: "CASH" });
    const hidden = await request(app)
      .get(`/api/rides/${created.body.id}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(hidden.status).toBe(404);
  });

  it("cancels a requested ride and allows a replacement request", async () => {
    const token = await register("NusratReplacement");
    const payload = { pickupZoneId: bananiId, dropoffZoneId: mohakhaliId, seats: 2, paymentMethod: "CASH" };
    const created = await request(app).post("/api/rides").set("Authorization", `Bearer ${token}`).send(payload);
    const cancelled = await request(app)
      .post(`/api/rides/${created.body.id}/cancel`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "Plans changed" });
    const replacement = await request(app).post("/api/rides").set("Authorization", `Bearer ${token}`).send(payload);

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("CANCELLED");
    expect(cancelled.body.cancelReason).toBe("Plans changed");
    expect(replacement.status).toBe(201);
  });
});