import { Router } from "express";
import * as zonesService from "./zones.service.js";

export const zonesRouter = Router();

zonesRouter.get("/", async (_req, res) => {
  const zones = await zonesService.listZones();
  res.status(200).json({ zones });
});