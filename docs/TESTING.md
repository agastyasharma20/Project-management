# Testing strategy

This platform is tested in three layers, each proving something the layer
below it cannot:

```
┌─────────────────────────────────────────────────────────────────┐
│  E2E (Playwright)         tests/e2e/          npm run test:e2e   │
│  Real browser, real HTTP, real (throwaway) database, real cookies│
│  Proves: the route is actually wired to the permission, the login│
│  form actually redirects, the geolocation API actually reaches   │
│  the geofence check on the page.                                 │
├─────────────────────────────────────────────────────────────────┤
│  Integration (Vitest)     tests/integration/  npm run test       │
│  Real Prisma client, real (throwaway) SQLite file, no HTTP,      │
│  no browser. Calls the service layer exactly as route handlers   │
│  and server actions do.                                          │
│  Proves: the business rules — Team ID sequencing, the geofence   │
│  re-check on submit, attendance snapshot immutability, judge mark│
│  aggregation — hold against a real database, including SQLite's  │
│  actual unique-constraint and transaction behaviour.              │
├─────────────────────────────────────────────────────────────────┤
│  Unit (Vitest)            tests/unit/         npm run test       │
│  Pure functions and self-contained modules — no database.        │
│  Proves: geofence maths, RBAC permission derivation, password    │
│  hashing, CSV/XLSX formatting, the evidence watermark pipeline.   │
└─────────────────────────────────────────────────────────────────┘
```

The rule of thumb used throughout: **if a test's confidence depends on the
database's real constraint behaviour (a unique index, a transaction,
cross-table effects), it is an integration test against a real SQLite file —
never a mock of Prisma.** Prisma's query API is large enough that a hand-rolled
mock silently drifts from reality; a temporary real database costs a few
hundred milliseconds and cannot drift.

## Running the suite

```bash
npm test                # unit + integration (Vitest), one throwaway SQLite db
npm run test:watch      # the same, in watch mode
npm run test:coverage   # the same, with a coverage report (src/lib/**)
npm run test:e2e        # Playwright, against a real dev server + seeded db
```

`npm test` and `npm run test:e2e` are fully self-contained: they provision
their own database files under `tests/.tmp/` and `tests/e2e/.tmp/`
respectively, seed what they need, and never touch your local `dev.db`. You
can run them with no setup beyond `npm install`.

## Layer 1 — Unit tests (`tests/unit/`)

No database, no Next.js runtime. Each file targets one module in `src/lib/`:

| File | Proves |
| --- | --- |
| `geo.test.ts` | Haversine distance is symmetric and matches the known ~111.2 km/degree; `evaluateGeofence` allows/refuses correctly on distance *and* accuracy independently, and that accuracy is checked even when the mentor is physically standing inside the fence — the failure mode a naive implementation gets wrong. |
| `rbac.test.ts` | The permission matrix unions correctly across multi-role accounts; **pins the deliberate `SUPER_ADMIN` audit-log exclusion** so a future refactor can't silently hand the platform operator audit visibility without a test failing; department scoping never leaks across HODs. |
| `password.test.ts` | Hashing round-trips, never stores plaintext, and `verifyPassword` fails closed (returns `false`, never throws) on a malformed hash. |
| `reports.test.ts` | CSV quoting/escaping is correct for commas, quotes and embedded newlines (a naive `split("\n")` over-counts rows here — the test catches that specific bug class); XLSX output is a real, parseable zip. |
| `utils.test.ts` / domain constants | Formatting helpers render `—` rather than `NaN%` or `0%` for missing data; health-band boundaries are inclusive on the documented side. |
| `watermark.test.ts` | The evidence stamp renders a valid JPEG at a bounded working width, handles a `null` address without fabricating one, and does not corrupt output when facts contain XML-special characters (defence in depth, even though facts are always server-derived). |
| `storage.test.ts` | The local storage driver round-trips bytes exactly, and a key containing `../` segments cannot escape the storage root — verified by actually attempting it, not by reading the sanitiser code and reasoning about it. |

## Layer 2 — Integration tests (`tests/integration/`)

Each file exercises one service module in `src/lib/services/` against a real,
freshly-created SQLite database (see **How the test database works** below).
`tests/integration/fixtures.ts` provides `buildAcademicEnvironment()`,
`makeUser()` and `makeApprovedTeam()` — minimal, randomised, real rows, never
a mocked shape.

| File | Proves |
| --- | --- |
| `teams.test.ts` | Registration enforces max team size and mentor-department matching against real rows; approval issues **sequential, non-colliding Team IDs** from the per-department/year counter; only the assigned mentor/HOD/college-wide role may approve; `teamScopeWhere` — run as an actual Prisma `where` clause — returns exactly the right teams for a student, a mentor, an unscoped bystander (zero, never everything), and a college-wide admin. |
| `meetings.test.ts` | A meeting **outside the geofence is refused server-side and no row is created**; poor GPS accuracy is refused even when physically on campus; attendance can only be marked for registered members; the attendance name snapshot is provably immutable — the test renames the student's profile *after* submission and asserts the stored snapshot didn't change; every approval decision is preserved in history, never overwritten. |
| `evaluation.test.ts` | A judge cannot exceed a criterion's max or submit a negative mark; an unassigned judge is refused; a submitted evaluation is locked until reopened; **multiple judges' marks are preserved individually** — the test asserts both judges' distinct totals survive in the database, not just the aggregate; `presentationResults` computes average/highest/lowest/median correctly against crafted totals; marks visibility changes require permission and publishing notifies students. |
| `analytics.test.ts` | `computeTeamMetrics` — the single function every dashboard and export reads — is checked against hand-computed expected values for attendance percentage, the health-score weighted formula, and each individual risk rule (no meeting yet, low attendance, missing repository links), using **settings actually written through `setSetting`**, not hardcoded defaults, to prove the configuration path is live. |
| `users.test.ts` | An HOD cannot grant `ADMIN`/`DIRECTOR`/`SUPER_ADMIN`; the last remaining Super Admin cannot be removed; disabling a user or resetting their password **actually revokes their sessions** in the database. |
| `audit-invariants.test.ts` | Two things, deliberately mixed in one file: (1) a **static source-code guard** — see below — and (2) that `recordAudit` actually writes queryable rows, including for an unauthenticated (`null`) actor. |

### The audit/evidence "append-only" guard

`audit-invariants.test.ts` includes tests that don't call any function at
all — they read every `.ts`/`.tsx` file under `src/` and assert that no line
calls `db.auditLog.update(...)`, `db.meetingEvidence.update(...)`, or
`db.meetingAttendance.update(...)`.

This is intentional, and different in kind from the rest of the suite: a
runtime test proves today's code is correct; this guard prevents *tomorrow's*
code from quietly breaking an institutional-trust invariant (audit entries are
permanent; captured evidence and attendance snapshots cannot be edited by any
role, including Super Admin) the first time someone adds a "fix a typo in the
audit log" feature. It fails at the point the dangerous line is written, in
CI, rather than months later when someone notices the audit trail has holes.

## Layer 3 — End-to-end tests (`tests/e2e/`)

Playwright drives a real, dedicated Next.js dev server (`tests/e2e/serve.mjs`
provisions and seeds `tests/e2e/.tmp/e2e.db` before Playwright's `webServer`
starts it) with a real headless Chromium.

| File | Proves |
| --- | --- |
| `login.spec.ts` | The actual login form: valid credentials redirect to `/dashboard`; a wrong password and an unknown email produce the **identical** message (no account enumeration); an unauthenticated visit to a protected route redirects to `/login`; signing out actually invalidates the session. |
| `rbac-access.spec.ts` | The RBAC matrix **over real HTTP** with real signed cookies — automates what was previously checked by hand with `curl` during development. Explicitly proves the audit-log/Super-Admin decision at the HTTP layer: Super Admin gets "Permission denied" on `/audit` and the link is absent from their sidebar; Director/Admin/HOD can open it and see the link. Also proves `/api/search` is scoped per caller and rejects unauthenticated requests. |
| `meeting-capture-geofence.spec.ts` | The mobile evidence-capture page against a **real `navigator.geolocation`**, mocked to specific coordinates via Playwright's `context.setGeolocation` — not by stubbing application code. Proves the page reads the actual browser API, runs it through the real client-side geofence check, and gates the "Continue to camera" step on the result; and that a team the caller isn't the mentor/HOD of resolves to not-found, never someone else's data. |

**Why this suite stops before the camera.** Chromium can simulate a fake
video device (`--use-fake-device-for-media-stream`), but the part of the
capture flow that is unique to this application — the location gate — is
fully covered without it. `getUserMedia` → `canvas.toBlob` is standard,
browser-vendor-tested behaviour; adding a fake-camera project to
`playwright.config.ts` is a natural next increment if the capture-and-submit
path itself needs end-to-end coverage (see **Manual QA checklist** below for
what that leaves uncovered today).

### How the test database works

**Integration tests** (`tests/global-setup.ts`): runs once before the whole
Vitest run, in the main process — before any worker exists. It deletes and
recreates `tests/.tmp/`, runs `prisma db push` (no `--force-reset`: the
database file doesn't exist yet, so there's nothing to reset) against a fresh
file, and writes the env vars every worker needs to `tests/.tmp/env.json`.
`tests/setup-env.ts` reads that file in every test file and also mocks
`next/headers` (which requires a real Next.js request context the service
layer doesn't have when called directly in a test — see the comment in that
file). The whole suite runs in one process against one SQLite file
(`pool: "forks"`, `singleFork: true`, `isolate: false`) rather than sharding
across workers — SQLite is single-writer, and one process matches how the
real app behaves (one Prisma client) far more closely than N parallel
processes would.

**E2E tests** (`tests/e2e/serve.mjs`): the same idea, one level up — deletes
and recreates `tests/e2e/.tmp/`, runs `prisma db push`, seeds it with
`prisma/seed.ts` (`SEED_PASSWORD=E2e@12345`), then starts `next dev -p 3100`.
Playwright's `webServer` config runs this script and waits for `/login` to
respond before starting tests.

`tests/e2e/helpers/auth.ts` mints a valid session cookie **directly against
that database** — hashing a random token with SHA-256 for storage and
HMAC-signing it for the cookie, exactly mirroring `src/lib/auth/session.ts` —
so every RBAC test can jump straight to a role-specific page instead of
re-driving the login form. This is a deliberate choice, not a shortcut around
auth: `login.spec.ts` is where the login form itself is proven; every other
spec file assumes login works and tests what happens *after*.

### A note on Prisma's own safety guard

Never pass `--force-reset` to `prisma db push`/`migrate` from an agent
context — Prisma detects it and refuses, printing an explicit warning that
this is a destructive, irreversible action requiring a human's informed
consent (see Prisma's own message text if you trigger it). Both test database
scripts in this repo avoid it entirely: they delete the directory and
recreate it first, so the database file never exists when `db push` runs and
there is nothing to "reset". If you ever see that guard fire, do not work
around it — it exists to stop exactly this kind of unattended, irreversible
action from running against a database an agent can't verify is disposable.

## What is deliberately not automated, and why

- **Real camera capture.** `getUserMedia` → `canvas.toBlob` → upload is
  standard browser behaviour; the application-specific risk (wrong
  coordinates, evidence editable, geofence bypassable) is fully covered by
  the integration tests (server-side re-validation) and the e2e geolocation
  tests (client-side gating). A fake-camera Playwright project is a
  reasonable future addition if the full capture-to-submit path needs
  coverage, not a gap in what matters today.
- **Visual/pixel content of the stamped evidence image.** `watermark.test.ts`
  proves the pipeline produces a valid image at the right dimensions without
  throwing on adversarial input; it does not OCR the burned-in text. The
  facts burned in are unit-testable at the data level (they're plain
  arguments to `stampEvidence`) and are exercised by `meetings.test.ts`,
  which asserts the *stored* evidence row's fields.
- **Load/concurrency testing** (many mentors submitting simultaneously,
  concurrent Team ID approvals under real contention). The Team ID sequence
  is protected by a unique database constraint (see `Team.teamId` in
  `prisma/schema.prisma`) regardless of application-level races; a dedicated
  concurrency test would need a database that isn't single-writer SQLite to
  be meaningful, which lines up with the documented Postgres migration path.

### Manual QA checklist (until covered by an automated fake-camera suite)

Run this on an actual mobile device over HTTPS before each release that
touches the capture flow:

1. Open **Record Meeting** as a faculty mentor on a phone.
2. Confirm the GPS step shows accuracy and a clear inside/outside verdict
   before any camera permission prompt appears.
3. Confirm the camera opens the **rear** camera by default and that there is
   no way to pick a gallery image on the primary path.
4. Capture a photo, confirm **Retake** discards it and reopens the camera.
5. Confirm attendance defaults to all members present and can be unchecked.
6. Confirm the discussion field enforces the character limit visibly.
7. Submit, then open the meeting's evidence page as an approver and confirm
   the stamped image shows the correct Team ID, coordinates, address (or its
   absence), date and time — and that the original, unstamped capture is
   also viewable.

## Adding a new test

- A new **business rule** in a service function → an integration test in the
  matching `tests/integration/*.test.ts`, using the fixtures in
  `fixtures.ts`. Don't mock Prisma; let it hit the real test database.
- A new **pure helper** (formatting, math, a validator) → a unit test next to
  the others in `tests/unit/`.
- A new **page-level permission** or a new role's access to an existing page
  → a case in `tests/e2e/rbac-access.spec.ts` following the existing
  `signInAs` pattern.
- A new **audit-sensitive model** (something that must never be edited or
  deleted once written) → add its forbidden call patterns to
  `audit-invariants.test.ts` alongside the existing ones.
