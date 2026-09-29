import type { RequestHandler } from "express";
import type { ZodType } from "zod";

type Source = "body" | "query" | "params";

/**
 * Parses req[source] with the given schema and stores the result on
 * req.validated instead of overwriting req[source] directly, since
 * Express 5 makes req.query a read-only getter.
 */
export function validate(schema: ZodType, source: Source = "body"): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.validated = { ...req.validated, [source]: result.data };
    next();
  };
}
