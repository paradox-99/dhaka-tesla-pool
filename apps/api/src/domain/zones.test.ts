import { describe, expect, it } from "vitest";
import { distanceKm } from "./zones.js";

const banani = { x: 2, y: 4 };
const mohakhali = { x: 2, y: 2 };
const gulshan1 = { x: 4, y: 3 };
const dhanmondi = { x: 0, y: -3 };
const uttara = { x: 2, y: 12 };

describe("distanceKm", () => {
  it("uses Manhattan distance", () => {
    expect(distanceKm(banani, mohakhali)).toBe(2);
  });

  it("is symmetric", () => {
    expect(distanceKm(mohakhali, gulshan1)).toBe(distanceKm(gulshan1, mohakhali));
  });

  it("captures the documented distant route", () => {
    expect(distanceKm(dhanmondi, uttara)).toBe(17);
  });
});