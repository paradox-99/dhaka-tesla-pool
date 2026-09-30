import { Router } from "express";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import { cancelPoolSchema, driverStatusSchema, type CancelPoolInput, type DriverStatusInput } from "./driver.schemas.js";
import * as driverService from "./driver.service.js";

export const driverRouter = Router();
driverRouter.use(authenticate, requireRole("DRIVER"));

driverRouter.patch("/status", validate(driverStatusSchema), async (req, res) => {
  const vehicle = await driverService.setDriverStatus(req.user!.id, req.validated!.body as DriverStatusInput);
  res.status(200).json(vehicle);
});

driverRouter.get("/requests", async (req, res) => {
  res.status(200).json({ requests: await driverService.listRequests(req.user!.id) });
});

driverRouter.post("/requests/:id/accept", async (req, res) => {
  res.status(200).json(await driverService.acceptRequest(req.user!.id, req.params.id as string));
});

driverRouter.get("/pools/current", async (req, res) => {
  res.status(200).json(await driverService.getCurrentPool(req.user!.id));
});

driverRouter.get("/pools", async (req, res) => {
  res.status(200).json({ pools: await driverService.listPoolHistory(req.user!.id) });
});

driverRouter.post("/pools/:id/arrive", async (req, res) => {
  res.status(200).json(await driverService.startArriving(req.user!.id, req.params.id as string));
});

driverRouter.post("/pools/:id/start", async (req, res) => {
  res.status(200).json(await driverService.startTrip(req.user!.id, req.params.id as string));
});

driverRouter.post("/pools/:id/complete", async (req, res) => {
  res.status(200).json(await driverService.completeTrip(req.user!.id, req.params.id as string));
});

driverRouter.post("/pools/:id/cancel", validate(cancelPoolSchema), async (req, res) => {
  res.status(200).json(await driverService.cancelPool(req.user!.id, req.params.id as string, req.validated!.body as CancelPoolInput));
});