import { Router } from "express";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/requireRole.js";
import { validate } from "../../middleware/validate.js";
import { estimateFareSchema, type EstimateFareInput } from "./fares.schemas.js";
import * as faresService from "./fares.service.js";

export const faresRouter = Router();

faresRouter.get(
  "/estimate",
  authenticate,
  requireRole("PASSENGER"),
  validate(estimateFareSchema, "query"),
  async (req, res) => {
    const estimate = await faresService.estimateFare(req.validated!.query as EstimateFareInput);
    res.status(200).json(estimate);
  },
);