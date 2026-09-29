import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { Prisma } from "../generated/prisma/client.js";
import { AppError } from "../errors/AppError.js";
import { logger } from "../lib/logger.js";

function isPostgresCheckViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "23514";
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details ?? null } });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid request", details: err.flatten() },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    res.status(409).json({
      error: { code: "CONFLICT", message: "Resource already exists", details: null },
    });
    return;
  }

  if (isPostgresCheckViolation(err)) {
    res.status(409).json({
      error: { code: "CONSTRAINT_VIOLATION", message: "Operation violates a data constraint", details: null },
    });
    return;
  }

  logger.error({ err }, "unhandled error");
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong", details: null } });
};
