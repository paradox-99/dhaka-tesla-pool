export const BASE_FARE_PAISA = 3000;
export const PER_KM_RATE_PAISA = 2000;
export const POOL_DISCOUNT_PERCENT = 20;

export interface FareInput {
  distanceKm: number;
  seats: number;
  pooled: boolean;
}

export interface FareBreakdown {
  subtotal: number;
  discount: number;
  total: number;
}

export function calculateFare({ distanceKm, seats, pooled }: FareInput): FareBreakdown {
  if (!Number.isInteger(distanceKm) || distanceKm < 0) {
    throw new RangeError("distanceKm must be a non-negative integer");
  }
  if (!Number.isInteger(seats) || seats < 1) {
    throw new RangeError("seats must be a positive integer");
  }

  const subtotal = seats * (BASE_FARE_PAISA + PER_KM_RATE_PAISA * distanceKm);
  const discount = pooled ? Math.floor((subtotal * POOL_DISCOUNT_PERCENT) / 100) : 0;

  return { subtotal, discount, total: subtotal - discount };
}