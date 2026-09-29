import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { registerSchema, loginSchema, type RegisterInput, type LoginInput } from "./auth.schemas.js";
import * as authService from "./auth.service.js";

export const authRouter = Router();

authRouter.post("/register", validate(registerSchema), async (req, res) => {
  const result = await authService.register(req.validated!.body as RegisterInput);
  res.status(201).json(result);
});

authRouter.post("/login", validate(loginSchema), async (req, res) => {
  const result = await authService.login(req.validated!.body as LoginInput);
  res.status(200).json(result);
});
