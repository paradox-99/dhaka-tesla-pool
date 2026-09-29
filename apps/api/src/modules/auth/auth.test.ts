import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../../app.js";
import { prisma } from "../../lib/prisma.js";

const app = createApp();

describe("auth", () => {
  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  it("registers, logs in, and fetches /me", async () => {
    const registerRes = await request(app).post("/api/auth/register").send({
      name: "Nusrat",
      email: "nusrat.test@teslapool.dev",
      password: "Nusrat@123",
    });

    expect(registerRes.status).toBe(201);
    expect(registerRes.body.user.role).toBe("PASSENGER");
    expect(registerRes.body.user.passwordHash).toBeUndefined();
    expect(registerRes.body.token).toEqual(expect.any(String));

    const loginRes = await request(app).post("/api/auth/login").send({
      email: "nusrat.test@teslapool.dev",
      password: "Nusrat@123",
    });

    expect(loginRes.status).toBe(200);
    const token = loginRes.body.token as string;

    const meRes = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);

    expect(meRes.status).toBe(200);
    expect(meRes.body.email).toBe("nusrat.test@teslapool.dev");
    expect(meRes.body.passwordHash).toBeUndefined();
  });

  it("rejects registration with an already-used email", async () => {
    await request(app).post("/api/auth/register").send({
      name: "Rafiq",
      email: "rafiq.test@teslapool.dev",
      password: "Rafiq@123",
    });

    const res = await request(app).post("/api/auth/register").send({
      name: "Rafiq Again",
      email: "rafiq.test@teslapool.dev",
      password: "Rafiq@123",
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("rejects login with a wrong password", async () => {
    await request(app).post("/api/auth/register").send({
      name: "Shirin",
      email: "shirin.test@teslapool.dev",
      password: "Shirin@123",
    });

    const res = await request(app).post("/api/auth/login").send({
      email: "shirin.test@teslapool.dev",
      password: "wrong-password",
    });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects /me without a token", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects registration payloads that fail validation", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "",
      email: "not-an-email",
      password: "short",
    });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
