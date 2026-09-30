import { describe, expect, it } from "vitest";
import { assertPoolTransition, assertRideTransition } from "./stateMachine.js";

describe("ride and pool state machines", () => {
  it("accepts the valid pool lifecycle", () => {
    expect(() => assertPoolTransition("ACCEPTED", "DRIVER_ARRIVED")).not.toThrow();
    expect(() => assertPoolTransition("DRIVER_ARRIVED", "STARTED")).not.toThrow();
    expect(() => assertPoolTransition("STARTED", "COMPLETED")).not.toThrow();
  });

  it("rejects skipping pool arrival and completing a cancelled pool", () => {
    expect(() => assertPoolTransition("ACCEPTED", "STARTED")).toThrowError(/INVALID_TRANSITION|cannot go/);
    expect(() => assertPoolTransition("CANCELLED", "COMPLETED")).toThrowError(/INVALID_TRANSITION|cannot go/);
  });

  it("allows a cancelled matched ride to return to the request queue", () => {
    expect(() => assertRideTransition("MATCHED", "REQUESTED")).not.toThrow();
    expect(() => assertRideTransition("REQUESTED", "IN_PROGRESS")).toThrowError(/INVALID_TRANSITION|cannot go/);
  });
});