import type { RequestHandler } from "express";
import { AppError } from "../errors/AppError.js";
import type { Role } from "../generated/prisma/client.js";

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) {
      next(new AppError(401, "UNAUTHORIZED", "Missing or invalid authorization header"));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new AppError(403, "FORBIDDEN", "You don't have access to this resource"));
      return;
    }
    next();
  };
}
