# Dhaka Tesla Pool — Copilot instructions

Ride-pooling MVP for the RoBenDevs internship task: passengers request rides
between fixed Dhaka zones, get auto-matched into a driver's Tesla pool when
compatible, and the driver runs the trip through a lifecycle. See
`docs/architecture.md` and `docs/erd.md` for diagrams — read those before
generating schema or API code.

Path-specific conventions live in `.github/instructions/api.instructions.md`
and `.github/instructions/web.instructions.md`. Read the one that matches
the file you're editing in addition to this file.

## Ground rules

1. Never commit feature work directly to `master`. Create a `feature/<name>`
   branch, commit there, then merge back with `--no-ff` (`git merge --no-ff
   feature/<name> -m "merge: feature/<name>"`) so the branch history is kept.
   Push both the feature branch and `master` to `origin`, not just one.
2. The default branch is **`master`**, not `main`.
3. Commit as you go, one logical change per commit, using
   `<type>(<scope>): <description>` (e.g. `feat(auth): add jwt middleware and
   role guard`). Don't invent a different convention mid-project.
4. Keep the cast everywhere in seed data, fixtures, and examples: **Jashim**
   (driver), **Bullet** (his 3-seat Tesla), **Nusrat**, **Rafiq**, **Shirin**
   (passengers), and optionally **Karim** (2nd driver) / **Toofan** (his
   Tesla). Never generic placeholders like `user1`.
5. Data integrity comes before UI polish. Capacity and state-machine rules
   must be correct and tested before styling matters.
6. Explicit, documented scope cuts for this MVP: no real maps (fixed zones on
   an integer grid instead), no WebSockets (SWR polling instead), no
   ratings, no real payment gateway (simulated `TESLAPAY` wallet + cash
   fallback), no refresh tokens (single JWT, 1 day expiry).

## Tech stack (already chosen, don't swap without asking)

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router) + TypeScript + Tailwind CSS |
| Data fetching | SWR with `refreshInterval` for polling active ride/pool status |
| Backend | Express + TypeScript, ESM (`"type": "module"`, `NodeNext` resolution) |
| Database | PostgreSQL 16 (local: Docker Compose, see `docker-compose.yml`) |
| ORM | Prisma 7, pinned — see `apps/api/.github`-relevant note in the api instructions about the driver-adapter requirement |
| Validation | zod |
| Auth | JWT (Bearer) + bcrypt, stateless |
| Logging | pino + pino-http |
| Tests | Vitest + Supertest, against a real Postgres (not mocks) — the seat-capacity concurrency test in particular must hit a real DB |

Money is always an integer number of **paisa** (`Int`), never a float. Display
with `(paisa / 100).toFixed(2)` prefixed by `৳`.

## Repository structure

```
apps/
  api/    Express + Prisma — see api.instructions.md
  web/    Next.js App Router — see web.instructions.md
docs/
  architecture.md   Mermaid system diagram
  erd.md            Mermaid ER diagram + constraint notes
docker-compose.yml  Postgres (+ api/web once Phase 8 is done)
```

Two independent `package.json`s under `apps/`, no monorepo tooling
(Turborepo/workspaces) — keep Docker builds and explanations simple.

## Domain rules (implement exactly this; these are the assumptions to defend in review)

**Zones** are a fixed reference table on an integer km grid (see `zones` in
`docs/erd.md`). Distance is Manhattan: `distanceKm(a, b) = |a.x - b.x| + |a.y - b.y|`.

**Matching rule** — a ride request is compatible with an open pool when ALL hold:
1. Pool status is `ACCEPTED` (no new joins after the driver arrives).
2. Same pickup zone as the pool.
3. The request's dropoff is within 3 km (Manhattan) of **every** current
   member's dropoff.
4. `pool.seatsOccupied + request.seats <= pool.capacity`.

When several pools are compatible, prefer the one with most seats occupied
(fill Teslas), then the oldest.

**Who matches (hybrid):** on ride request, first try to auto-join a
compatible open pool (request becomes `MATCHED` immediately); if none fits,
it stays `REQUESTED` and waits for a driver to accept it (creating a new
pool, or adding to their current one if compatible and there's room).

**Fare model**, everything in integer paisa:
```
BASE_FARE = 3000, PER_KM_RATE = 2000, POOL_DISCOUNT = 20% (only when pool has >= 2 active members)
subtotal      = seats * (BASE_FARE + PER_KM_RATE * distanceKm)
poolDiscount  = pooled ? floor(subtotal * 20 / 100) : 0
passengerFare = subtotal - poolDiscount
```
Worked example to match in tests: Nusrat (Banani→Mohakhali, 2km, 1 seat,
pooled) = ৳56.00 (5600 paisa). Rafiq (Banani→Gulshan 1, 3km, 1 seat, pooled)
= ৳72.00 (7200 paisa). Fares are recalculated for all active members
whenever someone joins/leaves (before `STARTED`), then locked into
`finalFarePaisa` at `STARTED` so nobody's price changes mid-ride.

**Two separate lifecycles** (don't merge them — a passenger cancelling must
not affect other members of the same pool):
```
Pool:        ACCEPTED → DRIVER_ARRIVED → STARTED → COMPLETED
             ACCEPTED | DRIVER_ARRIVED → CANCELLED
RideRequest: REQUESTED → MATCHED → IN_PROGRESS → COMPLETED
             REQUESTED | MATCHED → CANCELLED
             MATCHED → REQUESTED   (only when the driver cancels the pool)
```
Coupling: pool `STARTED` locks fares and moves active members to
`IN_PROGRESS`; pool `COMPLETED` moves members to `COMPLETED` and creates
`payments` rows; pool `CANCELLED` sets members' `leftAt` and their requests
go back to `REQUESTED`; a passenger cancelling while `MATCHED` decrements
`seatsOccupied`, recalculates remaining fares, and cancels the pool if it
becomes empty. A passenger can cancel only while `REQUESTED`/`MATCHED`; a
driver can cancel a pool only before `STARTED`; a driver can't go offline
with an active pool. Implement transition tables as
`domain/stateMachine.ts` (`assertPoolTransition`, `assertRideTransition`)
that throw a 409 `AppError` on an invalid transition — don't scatter ad hoc
if-checks across services.

**Concurrency (last-seat race):** use an atomic conditional `UPDATE` inside
`prisma.$transaction`, backed by the DB CHECK constraint as defense in
depth — do not use `SELECT` then check then `UPDATE` as separate steps:
```ts
const claimed = await tx.$executeRaw`
  UPDATE pools SET seats_occupied = seats_occupied + ${seats}
  WHERE id = ${poolId}::uuid AND status = 'ACCEPTED'
    AND seats_occupied + ${seats} <= capacity`;
if (claimed === 0) throw new AppError(409, 'POOL_FULL', 'No seats left in this Tesla');
```
The `ride_requests`/`pools`/`pool_members` partial unique indexes already in
the schema (see migrations) prevent double-booking even if application code
has a bug — never remove them to "simplify" a query.

## API design (already scaffolded further in api.instructions.md)

REST, JSON, everything under `/api`. Uniform error shape:
```json
{ "error": { "code": "POOL_FULL", "message": "No seats left in this Tesla", "details": null } }
```
Status codes: `400` validation, `401` no/invalid token, `403` wrong role,
`404` not found or not yours (never leak existence of another user's
resource), `409` state/capacity conflict, `429` rate limit, `500` unexpected
(log it, return a generic message).

**Privacy rule:** a passenger never sees another passenger's fare or
destination — only "Shared with N other passenger(s)". The driver sees
every member's name, seats, zones and fare.

Business logic lives in `services/*.service.ts` and pure `domain/*.ts`
functions; routes only validate (zod), check auth/role, and call the
service. Every state change runs inside a transaction and writes a
`ride_events` row for audit history.

## Current progress (don't redo, don't skip ahead of what's asked)

- ✅ **Phase 1** (`feature/project-setup`, merged): repo scaffolding, `apps/api`
  (Express health endpoint) and `apps/web` (Next.js) scaffolds,
  `docker-compose.yml` with Postgres.
- ✅ **Phase 2** (`feature/database-schema`, merged): full Prisma schema, the
  two migrations (`init` + `integrity_constraints`), the idempotent seed
  script (`apps/api/prisma/seed.ts`).
- ✅ **Phase 3** (`feature/passenger-auth`, merged): register/login/me, JWT
  middleware (`middleware/auth.ts`), role guard (`middleware/requireRole.ts`),
  rate limiting on `/api/auth/*`, plus the general error-handling
  infrastructure (`AppError`, central error handler, `validate()`,
  zod-validated `config/env.ts`) and a dedicated `dhaka_tesla_pool_test`
  Postgres database for integration tests (`.env.test`, `vitest.setup.ts`).
- ✅ **Phase 4** `feature/fare-model`: zone distance, fare calculation,
  matching compatibility, `GET /api/zones`, `GET /api/fares/estimate`, and
  unit tests against the worked fare/distance examples above.
- ✅ **Phase 5** `feature/ride-requests` then `feature/tesla-pooling`: create/
  list/cancel ride requests, active ride privacy summary, auto-join matching,
  atomic seat claim, fare recalculation, and a real-Postgres concurrency test
  proving two simultaneous last-seat claims can't overbook.
- ✅ **Phase 6** `feature/driver-flow`: online/offline, request feed, accept
  (create/join pool), arrive/start/complete/cancel via the state machine,
  fare locking, and cash/TeslaPay payments on completion.
- ⬜ **Phase 7** `feature/passenger-ui`, `feature/driver-ui`: the Next.js
  pages listed in `docs/architecture.md` — auth pages, passenger request +
  live status + history, driver dashboard + history. Every data view needs
  loading/error/empty states.
- ⬜ **Phase 8** `feature/docker-setup`: multi-stage Dockerfiles for
  `apps/api` and `apps/web`, full `docker-compose.yml` (db + api + web with
  health checks). Cut `pre-release` after this merges.
- ⬜ **Phase 9** deployment on `pre-release` (Neon + Render + Vercel or
  documented equivalent).
- ⬜ **Phase 10** README + diagrams + screenshots.
- ⬜ **Phase 12** tag `release/v1.0.0`, merge `pre-release` fixes back to
  `master`.

When asked to work on a phase, create its feature branch from `master` (or
from `pre-release` for phases 9–10), implement only what that phase's bullet
above and this file describe, write the tests it calls for, then merge back
`--no-ff` and push both branches. Don't jump ahead to a later phase's work
inside an earlier branch.
