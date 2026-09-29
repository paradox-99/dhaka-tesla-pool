import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { AppError } from "../errors/AppError.js";
import type { Role } from "../generated/prisma/client.js";

interface AccessTokenPayload {
  sub: string;
  role: Role;
}

function isAccessTokenPayload(payload: unknown): payload is AccessTokenPayload {
  if (typeof payload !== "object" || payload === null) return false;
  const candidate = payload as Record<string, unknown>;
  return typeof candidate.sub === "string" && typeof candidate.role === "string";
}

export const authenticate: RequestHandler = (req, _res, next) => {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    next(new AppError(401, "UNAUTHORIZED", "Missing or invalid authorization header"));
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (!isAccessTokenPayload(payload)) {
      next(new AppError(401, "UNAUTHORIZED", "Invalid token"));
      return;
    }
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new AppError(401, "UNAUTHORIZED", "Invalid or expired token"));
  }
};
