---
applyTo: "apps/api/**"
---

# apps/api conventions

Express + TypeScript, ESM throughout (`"type": "module"` in `package.json`,
`tsconfig.json` uses `target: ES2022`, `module`/`moduleResolution:
NodeNext`, `strict: true`). Because of `NodeNext`, every relative import
needs an explicit `.js` extension even though the source file is
`.ts` — e.g. `import { createApp } from "./app.js";`.

## App structure (already in place, extend it, don't restructure it)

- `src/app.ts` exports `createApp()` (an Express app factory) and `logger`.
  `src/server.ts` is the only file that calls `.listen()`. Tests call
  `createApp()` directly with Supertest instead of starting a real server —
  keep following this pattern for every new route.
- `src/routes/health.ts` shows the pattern: a `Router()` per resource,
  mounted in `app.ts`.
- New business logic belongs in `src/domain/*.ts` (pure functions, no DB —
  easy to unit test) and `src/modules/<name>/*.service.ts` (DB/Prisma
  calls), not inline in route handlers. Routes only validate input (zod),
  check `req.user`/role, call the service, and shape the response.
- Import the shared Prisma client from `src/lib/prisma.ts` — never
  instantiate a second `PrismaClient` elsewhere.

## Prisma 7 specifics (learned the hard way — don't relitigate these)

- Prisma is pinned to **7.10.0** deliberately (`npm`'s `latest` dist-tag can
  point at an RC build for this package — always check `npm view prisma
  dist-tags` before bumping it, don't just `npm install prisma@latest`).
- The config file is `apps/api/prisma7.config.ts` (Prisma 7's own naming,
  not the conventional `prisma.config.ts` — this is correct, don't rename
  it). Migrations path and the seed command
  (`migrations.seed: "tsx prisma/seed.ts"`) are configured there, not in
  `package.json#prisma`.
- The generated client (`generator client { provider = "prisma-client" }`)
  outputs to `src/generated/prisma`, which is gitignored
  (`**/src/generated/` in the root `.gitignore` — note the leading `**/`,
  a bare `src/generated/` only matches at the repo root and silently
  misses `apps/api/src/generated/`). Run `npx prisma generate` after
  pulling schema changes; never hand-edit anything under `generated/`.
- **Prisma 7 requires an explicit driver adapter** — `new PrismaClient()`
  with no arguments throws `PrismaClientInitializationError` at runtime.
  Always go through `@prisma/adapter-pg` via `src/lib/prisma.ts`:
  ```ts
  import { PrismaPg } from "@prisma/adapter-pg";
  import { PrismaClient } from "../generated/prisma/client.js";
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  export const prisma = new PrismaClient({ adapter });
  ```
  Any one-off script (like `prisma/seed.ts`) that instantiates its own
  client needs the same adapter wiring — copy the pattern, don't call the
  bare constructor.
- Constraints Prisma's schema language can't express (range/relational
  CHECKs, partial `WHERE`-scoped unique indexes) go in a `migrate dev
  --create-only` migration with hand-written SQL, not in `schema.prisma`.
  See `prisma/migrations/*_integrity_constraints/migration.sql` for the
  existing pattern — add to it the same way for any new constraint, don't
  work around it in application code alone.

## Errors, validation, auth

- Validate every request body/query with zod in a `*.schemas.ts` file next
  to the route; reject with `400` on failure.
- Throw `AppError(status, code, message)` for expected failures (409
  conflicts, 404 not-found-or-not-yours, etc.); let a central error
  middleware turn it into the `{ error: { code, message, details } }` shape
  and turn a Postgres unique-violation (`P2002`) or CHECK-violation
  (`23514`) into a `409`.
- `middleware/auth.ts` verifies the Bearer JWT and sets `req.user`;
  `requireRole('DRIVER' | 'PASSENGER')` guards role-specific routes. Never
  trust a role or id from the request body — always from the verified JWT.
- Passwords: bcrypt, cost factor 10, never logged or returned in any
  response.

## Testing

- Vitest + Supertest, calling `createApp()` directly (no running server).
- Anything touching seat-capacity/concurrency must run against the real
  local Postgres (`docker compose up -d postgres`), never a mock — that's
  the whole point of the test (see the concurrency test called for in
  Phase 5).
- `npm run test` = `vitest run`. Add fixtures/factories under `apps/api/
  src/**/*.test.ts` colocated with the code they test, matching
  `health.test.ts`'s existing placement next to `health.ts`.

## Before committing in this app

Run, and make sure all pass: `npx tsc --noEmit`, `npm test`, and (if a
migration changed) `npx prisma migrate dev` locally against the Docker
Postgres plus a re-run of `npx tsx prisma/seed.ts` to confirm the seed is
still idempotent.
