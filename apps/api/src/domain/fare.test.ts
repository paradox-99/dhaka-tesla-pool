import { describe, expect, it } from "vitest";
import { calculateFare } from "./fare.js";

describe("calculateFare", () => {
  it("calculates Nusrat's pooled fare", () => {
    expect(calculateFare({ distanceKm: 2, seats: 1, pooled: true })).toEqual({
      subtotal: 7000,
      discount: 1400,
      total: 5600,
    });
  });

  it("calculates Rafiq's pooled fare", () => {
    expect(calculateFare({ distanceKm: 3, seats: 1, pooled: true }).total).toBe(7200);
  });

  it("calculates solo and multi-seat fares", () => {
    expect(calculateFare({ distanceKm: 2, seats: 1, pooled: false }).total).toBe(7000);
    expect(calculateFare({ distanceKm: 2, seats: 2, pooled: true }).total).toBe(11200);
  });

  it("floors the pooled discount in paisa", () => {
    expect(calculateFare({ distanceKm: 1, seats: 1, pooled: true })).toEqual({
      subtotal: 5000,
      discount: 1000,
      total: 4000,
    });
  });
});