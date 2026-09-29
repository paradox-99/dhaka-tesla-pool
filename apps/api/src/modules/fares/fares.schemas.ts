import { z } from "zod";

export const estimateFareSchema = z
  .object({
    pickupZoneId: z.coerce.number().int().positive(),
    dropoffZoneId: z.coerce.number().int().positive(),
    seats: z.coerce.number().int().min(1).max(3),
  })
  .refine((value) => value.pickupZoneId !== value.dropoffZoneId, {
    message: "Pickup and dropoff zones must be different",
    path: ["dropoffZoneId"],
  });

export type EstimateFareInput = z.infer<typeof estimateFareSchema>;