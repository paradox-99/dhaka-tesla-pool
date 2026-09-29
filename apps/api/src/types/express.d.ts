import type { Role } from "../generated/prisma/client.js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: Role };
      validated?: { body?: unknown; query?: unknown; params?: unknown };
    }
  }
}

export {};
