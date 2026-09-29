import { describe, expect, it } from "vitest";
import { isCompatible } from "./matching.js";

const pool = { status: "ACCEPTED", pickupZoneId: 1, capacity: 3, seatsOccupied: 1 };
const request = { pickupZoneId: 1, dropoff: { x: 2, y: 2 }, seats: 1 };

describe("isCompatible", () => {
  it("accepts Mohakhali and Gulshan 1 routes", () => {
    expect(isCompatible(request, pool, [{ x: 4, y: 3 }])).toBe(true);
  });

  it("rejects distant dropoffs", () => {
    expect(isCompatible(request, pool, [{ x: 2, y: 12 }])).toBe(false);
  });

  it("rejects the wrong lifecycle, pickup, and capacity", () => {
    expect(isCompatible(request, { ...pool, status: "DRIVER_ARRIVED" }, [{ x: 4, y: 3 }])).toBe(false);
    expect(isCompatible({ ...request, pickupZoneId: 2 }, pool, [{ x: 4, y: 3 }])).toBe(false);
    expect(isCompatible({ ...request, seats: 3 }, pool, [{ x: 4, y: 3 }])).toBe(false);
  });
});