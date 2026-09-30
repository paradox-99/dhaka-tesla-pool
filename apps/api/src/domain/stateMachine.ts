import type { PoolStatus, RideStatus } from "../generated/prisma/client.js";
import { AppError } from "../errors/AppError.js";

export const POOL_TRANSITIONS: Record<PoolStatus, PoolStatus[]> = {
  ACCEPTED: ["DRIVER_ARRIVED", "CANCELLED"],
  DRIVER_ARRIVED: ["STARTED", "CANCELLED"],
  STARTED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export const RIDE_TRANSITIONS: Record<RideStatus, RideStatus[]> = {
  REQUESTED: ["MATCHED", "CANCELLED"],
  MATCHED: ["IN_PROGRESS", "REQUESTED", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function assertPoolTransition(from: PoolStatus, to: PoolStatus) {
  if (!POOL_TRANSITIONS[from].includes(to)) {
    throw new AppError(409, "INVALID_TRANSITION", `Pool cannot go from ${from} to ${to}`);
  }
}

export function assertRideTransition(from: RideStatus, to: RideStatus) {
  if (!RIDE_TRANSITIONS[from].includes(to)) {
    throw new AppError(409, "INVALID_TRANSITION", `Ride cannot go from ${from} to ${to}`);
  }
}