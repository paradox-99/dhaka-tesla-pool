import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { validate } from "../../middleware/validate.js";
import { authenticate } from "../../middleware/auth.js";
import { registerSchema, loginSchema, type RegisterInput, type LoginInput } from "./auth.schemas.js";
import * as authService from "./auth.service.js";

export const authRouter = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

authRouter.use(authLimiter);

authRouter.post("/register", validate(registerSchema), async (req, res) => {
  const result = await authService.register(req.validated!.body as RegisterInput);
  res.status(201).json(result);
});

authRouter.post("/login", validate(loginSchema), async (req, res) => {
  const result = await authService.login(req.validated!.body as LoginInput);
  res.status(200).json(result);
});

authRouter.get("/me", authenticate, async (req, res) => {
  const me = await authService.getMe(req.user!.id);
  res.status(200).json(me);
});
