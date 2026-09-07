# PIEMR Project Intelligence & Management Platform

A project lifecycle, evidence, attendance, presentation and analytics platform
for Prestige Institute of Engineering Management & Research, Indore — built to
replace the Excel-based Minor/Major project process across the whole college,
not only CSE.

It answers, in seconds: what projects are running, who is mentoring them,
whether teams are actually meeting, where and when the evidence was captured,
who attended, which teams are falling behind, when each presentation is, who
judged it, and how each department is performing.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript strict · Tailwind CSS 4 ·
Prisma → SQLite (PostgreSQL-ready) · sharp · ExcelJS · Recharts.

## Getting started

```bash
npm install
cp .env.example .env          # set AUTH_SECRET before any real deployment
npx prisma generate
npx prisma db push            # create the SQLite schema
```

Then pick **one** of the two paths below — never both on the same database.

### Real deployment (recommended) — no fake data

Creates only the real structural configuration (departments, semesters,
project types, the current academic year, resource categories) and exactly
one real Super Admin account. No demo people, no demo teams.

```bash
ADMIN_NAME="Your Name" \
ADMIN_EMAIL="you@example.edu" \
ADMIN_PASSWORD="a-strong-password" \
npm run db:init

npm run dev                   # http://localhost:3000
```

Use your own real name, institutional email and a strong password here — pass
them as environment variables like this, never commit them to a file that
gets pushed to source control.

Sign in as that Super Admin, then add your college's real faculty and
students under **Users**, adjust department/semester/geofence rules under
**Configuration**, and have team leads register their real projects at
`/register`. That's the whole onboarding path — no other script is needed.

### Demo / local development — fake, clearly-marked data

For trying out the UI or running it locally against something already
populated: 10 departments, ~450 fake users, 118 fake teams, 670 fake
meetings. Every seeded name, email (`@seed.piemr.edu.in`) and project title
(`[Demo] ...`) is unmistakably not real.

```bash
npm run db:seed
npm run dev
```

| Role | Email |
| --- | --- |
| Super Admin | `superadmin@seed.piemr.edu.in` |
| Director | `director@seed.piemr.edu.in` |
| Admin | `admin@seed.piemr.edu.in` |
| HOD + mentor (CSE) | `hod.cse@seed.piemr.edu.in` |
| Faculty mentor / judge | `faculty1.cse@seed.piemr.edu.in` |
| Student | `student1@seed.piemr.edu.in` |

All seeded accounts share the password in `SEED_PASSWORD` (default
`Piemr@2026`).

**Switching from demo data to a real deployment:** stop the dev server,
delete `prisma/dev.db`, run `npx prisma db push` again, then run `db:init`
(above) instead of `db:seed`. There is no in-place "wipe" — a fresh database
file is the clean, unambiguous way to leave demo data behind entirely.

Useful scripts: `npm run typecheck`, `npm run build`, `npm run db:reset`
(rebuilds the schema and *re-seeds demo data* — dev-only, never run against a
real deployment's database).

## Testing

```bash
npm test              # 136 unit + integration tests (Vitest), own throwaway SQLite db
npm run test:coverage # the same, with coverage
npm run test:e2e      # 29 Playwright tests against a real dev server + seeded db
```

Both suites are fully self-contained — they provision, seed and tear down
their own database files and never touch `dev.db`. See
[`docs/TESTING.md`](docs/TESTING.md) for the layered strategy (unit →
integration against a real database → end-to-end over real HTTP with a real
browser), what each test file proves, and what's deliberately left to a
documented manual QA checklist instead (real camera capture).

## Deployment notes

- **HTTPS is required.** The camera and geolocation APIs the meeting-evidence
  workflow depends on are unavailable on insecure origins.
- Set `AUTH_SECRET` to 32+ random bytes and `COOKIE_SECURE=true`.
- Set the real campus anchor in **Configuration › Geofence** on day one; the
  seeded 80 m radius around PIEMR is a starting default, not a hardcoded rule.
- To move to PostgreSQL: change the `provider` in `prisma/schema.prisma` and
  point `DATABASE_URL` at the new database. No application code changes.
- To move file storage off the local disk: implement `StorageDriver` and set
  `STORAGE_DRIVER`. The database stores keys, never paths.

## What the platform does

- **Team registration** by the team lead only, capped at four students, with a
  database-level guarantee that a student belongs to one active team. A Team ID
  (`PIEMR-CSE-001`) is issued *only* on approval, from a per-department,
  per-year counter.
- **Official meeting evidence** captured on the mentor's device: live GPS,
  campus geofence check re-evaluated on the server, camera capture, attendance
  ticked from the registered members, one-line discussion, and a server-side
  watermark burned from trusted database values. Original and stamped images are
  both retained; the GPS and timestamps can never be typed in or edited.
- **Attendance analytics** at student, team, section, semester, department and
  college level, from immutable per-meeting snapshots.
- **Presentations** with configurable events, judges created as a capability on
  existing faculty accounts, dynamic marking schemes, multiple judges per team
  with every submission preserved, and controlled marks release. Marks are an
  institutional record: visible only to HOD/Admin/Director/Super Admin —
  never to students or faculty mentors, and judges can only enter marks, not
  read them back.
- **Project intelligence**: a configurable weighted health score and a
  transparent rules-based risk engine (no ML is used or claimed), with drill-down
  from college to student and CSV/Excel exports.
- **Role-based access control** enforced server-side on every action, with an
  append-only audit trail.

Full architecture, ER model, RBAC matrix, screen map and known limitations:
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Public homepage

`/` is a real, public marketing page (no sign-in required) explaining what
the platform is, its core capabilities and the roles it serves, with a subtle
animated backdrop on the hero and login screens (`prefers-reduced-motion`
disables it). Authenticated visitors see a "Go to Dashboard" link instead of
sign-in/register CTAs. Every public page carries a footer, populated from
`CREDIT_NAME_1`/`CREDIT_EMAIL_1`/`CREDIT_TITLE_1`/`CREDIT_NAME_2`/
`CREDIT_EMAIL_2`/`CREDIT_LINKEDIN_2` in your own `.env` (never committed —
none of these are hardcoded in source, and the footer shows a generic line
naming no one until you set them).

## One deliberate access decision

The audit log is **not** exposed to `SUPER_ADMIN`, per the deployment
requirement for this institution. Audit entries continue to be written for every
Super Admin action; only the read surface is withheld, so oversight sits with the
Director, Admin and HOD rather than the platform operator. Everything else is
open to Super Admin, with one integrity exception documented in the architecture:
recording official meeting evidence is bound to the team's assigned mentor or
department HOD, because the artifact asserts that person's presence.
