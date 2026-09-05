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
npm run db:push               # create the SQLite schema
npm run db:seed               # demo data: 10 departments, 118 teams, 670 meetings
npm run dev                   # http://localhost:3000
```

Seeded accounts all use the password in `SEED_PASSWORD` (default `Piemr@2026`)
and the `@seed.piemr.edu.in` domain, so demo data is never mistaken for real:

| Role | Email |
| --- | --- |
| Super Admin | `superadmin@seed.piemr.edu.in` |
| Director | `director@seed.piemr.edu.in` |
| Admin | `admin@seed.piemr.edu.in` |
| HOD + mentor (CSE) | `hod.cse@seed.piemr.edu.in` |
| Faculty mentor / judge | `faculty1.cse@seed.piemr.edu.in` |
| Student | `student1@seed.piemr.edu.in` |

Useful scripts: `npm run typecheck`, `npm run build`, `npm run db:reset`.

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
  with every submission preserved, and controlled marks release.
- **Project intelligence**: a configurable weighted health score and a
  transparent rules-based risk engine (no ML is used or claimed), with drill-down
  from college to student and CSV/Excel exports.
- **Role-based access control** enforced server-side on every action, with an
  append-only audit trail.

Full architecture, ER model, RBAC matrix, screen map and known limitations:
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## One deliberate access decision

The audit log is **not** exposed to `SUPER_ADMIN`, per the deployment
requirement for this institution. Audit entries continue to be written for every
Super Admin action; only the read surface is withheld, so oversight sits with the
Director, Admin and HOD rather than the platform operator. Everything else is
open to Super Admin, with one integrity exception documented in the architecture:
recording official meeting evidence is bound to the team's assigned mentor or
department HOD, because the artifact asserts that person's presence.
