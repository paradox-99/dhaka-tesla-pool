import { describe, it, expect, vi } from "vitest";
import type { Request, Response } from "express";
import { requireRole } from "./requireRole.js";
import { AppError } from "../errors/AppError.js";

function mockReq(user?: { id: string; role: "PASSENGER" | "DRIVER" }) {
  return { user } as unknown as Request;
}

describe("requireRole", () => {
  it("rejects a passenger calling a driver-only route with 403", () => {
    const middleware = requireRole("DRIVER");
    const next = vi.fn();

    middleware(mockReq({ id: "u1", role: "PASSENGER" }), {} as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0]?.[0];
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(403);
    expect((err as AppError).code).toBe("FORBIDDEN");
  });

  it("calls next() with no error when the role matches", () => {
    const middleware = requireRole("DRIVER");
    const next = vi.fn();

    middleware(mockReq({ id: "u1", role: "DRIVER" }), {} as Response, next);

    expect(next).toHaveBeenCalledWith();
  });

  it("rejects an unauthenticated request with 401", () => {
    const middleware = requireRole("DRIVER");
    const next = vi.fn();

    middleware(mockReq(undefined), {} as Response, next);

    const err = next.mock.calls[0]?.[0];
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(401);
  });
});
