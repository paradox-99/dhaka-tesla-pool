import { Router } from "express";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import {
  cancelRideSchema,
  createRideSchema,
  listRidesSchema,
  type CancelRideInput,
  type CreateRideInput,
  type ListRidesInput,
} from "./rides.schemas.js";
import * as ridesService from "./rides.service.js";

export const ridesRouter = Router();
ridesRouter.use(authenticate, requireRole("PASSENGER"));

ridesRouter.post("/", validate(createRideSchema), async (req, res) => {
  const ride = await ridesService.createRide(req.user!.id, req.validated!.body as CreateRideInput);
  res.status(201).json(ride);
});

ridesRouter.get("/", validate(listRidesSchema, "query"), async (req, res) => {
  const result = await ridesService.listRides(req.user!.id, req.validated!.query as ListRidesInput);
  res.status(200).json(result);
});

ridesRouter.get("/active", async (req, res) => {
  const ride = await ridesService.getActiveRide(req.user!.id);
  res.status(200).json(ride);
});

ridesRouter.get("/:id", async (req, res) => {
  const ride = await ridesService.getRide(req.user!.id, req.params.id as string);
  res.status(200).json(ride);
});

ridesRouter.post("/:id/cancel", validate(cancelRideSchema), async (req, res) => {
  const ride = await ridesService.cancelRide(req.user!.id, req.params.id as string, req.validated!.body as CancelRideInput);
  res.status(200).json(ride);
});