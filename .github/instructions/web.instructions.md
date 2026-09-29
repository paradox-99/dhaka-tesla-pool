---
applyTo: "apps/web/**"
---

# apps/web conventions

Next.js App Router + TypeScript + Tailwind CSS, scaffolded with
`create-next-app` (no `src/` dir — routes live directly under `app/`). SWR
is installed for data fetching and polling; there is no WebSocket server,
so "live" status is always SWR `refreshInterval` polling.

Next.js auto-generates `AGENTS.md`/`CLAUDE.md` in this app on `next dev` —
leave them as-is, they're informational only and get regenerated.

## Structure to build out (per BUILD_GUIDE Phase 7 — not all of this exists yet)

- `lib/api.ts`: a single `apiFetch(path, options)` helper that attaches the
  `Authorization: Bearer <token>` header, parses the backend's
  `{ error: { code, message, details } }` shape on failure, and throws a
  typed error the UI can branch on. Every request goes through this, no ad
  hoc `fetch` calls scattered in components.
- `lib/auth.tsx`: an `AuthContext` holding the JWT (in `localStorage`) and
  the current user; `login`/`logout`; redirect by role (`PASSENGER` →
  `/passenger`, `DRIVER` → `/driver`) right after login.
- Routes: `(auth)/login`, `(auth)/register`, `passenger` (request form when
  no active ride, live ride card when there is one), `passenger/history`,
  `driver` (online toggle, current pool card, requests feed),
  `driver/history`.

## UI rules

- Every view that fetches data needs three explicit states: **loading**
  (skeleton or spinner), **error** (message + retry action), **empty**
  (a specific, on-brand message — e.g. "No rides yet. Your first Bullet
  ride awaits." — never a bare blank screen).
- Disable submit buttons while a request is in flight; show the backend's
  `409` message verbatim where it's user-meaningful (e.g. "Seat already
  taken") rather than a generic "something went wrong".
- Money is always rendered via a `formatTaka(paisa)` helper producing
  `৳56.00` — never format currency inline with ad hoc string
  concatenation.
- Passenger views must respect the backend's privacy rule: never render
  another passenger's name/fare/destination, only counts (e.g. "Shared
  with 1 other passenger"). The driver dashboard is the only place that
  shows other riders' details, because the driver-facing endpoints are the
  only ones that return them.
- Poll `/api/rides/active` (passenger) roughly every 3s and
  `/api/driver/requests` (driver) roughly every 5s with SWR
  `refreshInterval` — match whichever interval BUILD_GUIDE / the API
  instructions specify for that endpoint, don't invent new ones.

## Before committing in this app

Run, and make sure both are clean: `npm run build` and `npm run lint`.
