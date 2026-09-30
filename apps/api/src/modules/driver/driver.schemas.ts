import { z } from "zod";

export const driverStatusSchema = z.object({ isOnline: z.boolean() });
export type DriverStatusInput = z.infer<typeof driverStatusSchema>;

export const cancelPoolSchema = z.object({ reason: z.string().trim().max(250).optional() });
export type CancelPoolInput = z.infer<typeof cancelPoolSchema>;