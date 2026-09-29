import { z } from "zod";

export const createRideSchema = z.object({
  pickupZoneId: z.coerce.number().int().positive(),
  dropoffZoneId: z.coerce.number().int().positive(),
  seats: z.coerce.number().int().min(1).max(3),
  paymentMethod: z.enum(["CASH", "TESLAPAY"]),
}).refine((value) => value.pickupZoneId !== value.dropoffZoneId, {
  message: "Pickup and dropoff zones must be different",
  path: ["dropoffZoneId"],
});
export type CreateRideInput = z.infer<typeof createRideSchema>;

export const listRidesSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListRidesInput = z.infer<typeof listRidesSchema>;

export const cancelRideSchema = z.object({
  reason: z.string().trim().max(250).optional(),
});
export type CancelRideInput = z.infer<typeof cancelRideSchema>;