# PIEMR Project Intelligence & Management Platform — Architecture

Prestige Institute of Engineering Management & Research, Indore.
Replaces the Excel-based Minor/Major project process with a single academic
project lifecycle, evidence, attendance, presentation and analytics platform.

---

## 1. System architecture

```
┌────────────────────────────────────────────────────────────────────┐
│ Browser (mobile-first for mentor / student / judge)                │
│  · React 19 client components only where interaction demands it    │
│  · getUserMedia camera capture · Geolocation API · Recharts        │
└───────────────▲──────────────────────────────┬─────────────────────┘
                │ RSC payload / Server Actions │ multipart evidence
┌───────────────┴──────────────────────────────▼─────────────────────┐
│ Next.js 15 App Router (Node runtime)                               │
│                                                                    │
│  app/(auth)   public: login, team-lead registration                │
│  app/(app)    authenticated shell: nav filtered by permissions     │
│  app/api      file delivery, reports, search, logout               │
│                                                                    │
│  ── every server action / route handler starts with                │
│     requirePrincipal() → assertCan(...) ──────────────────────────│
└───────────────┬────────────────────────────────────────────────────┘
                │ (UI never imports Prisma directly)
┌───────────────▼────────────────────────────────────────────────────┐
│ Service layer — src/lib/services                                   │
│  teams · meetings · evaluation · analytics · users · settings      │
│  notifications · audit · reports                                   │
│  Business rules, transactions and invariants live here.            │
└───────────────┬────────────────────────────────────────────────────┘
                │
┌───────────────▼───────────┐  ┌──────────────────┐  ┌──────────────┐
│ Prisma ORM → SQLite       │  │ StorageService   │  │ Watermark    │
│ (PostgreSQL-ready schema) │  │ LOCAL → S3/…     │  │ sharp + SVG  │
└───────────────────────────┘  └──────────────────┘  └──────────────┘
```

### Layering rules

| Layer | May import | Must not |
| --- | --- | --- |
| `app/**` pages & components | services, `lib/auth`, `lib/utils`, UI kit | `lib/db` for writes, business rules |
| `lib/services/**` | `lib/db`, `lib/auth`, `lib/storage`, `lib/geo` | React, `next/navigation` |
| `lib/db.ts` | Prisma only | anything above it |

The consequence: **switching SQLite → PostgreSQL is a `provider` change in
`prisma/schema.prisma` plus a new `DATABASE_URL`.** No enum types, no raw SQL,
no SQLite-specific functions are used anywhere.

---

## 2. Entity relationship model

```
                    ┌────────────┐        ┌──────────────┐
                    │   User     │1──────*│   UserRole   │*──────1 Department
                    └─────┬──────┘        └──────────────┘   (null = college-wide)
              1:1 │            │ 1:1
        ┌─────────▼──┐   ┌─────▼─────────┐
        │StudentProf.│   │FacultyProfile │
        └─────┬──────┘   └──────┬────────┘
              │ *               │ mentor (1)
        ┌─────▼──────┐          │
        │ TeamMember │*────────1▼────────────┐
        └────────────┘        │    Team      │
                              └──┬──┬──┬──┬──┘
        Department ─────────────┘  │  │  └──────── AcademicYear
        Section ───────────────────┘  └─────────── Semester, ProjectType
                                 │
      ┌──────────────┬───────────┼──────────────┬──────────────────┐
      ▼              ▼           ▼              ▼                  ▼
  Meeting     ProjectResource  TimelineEvent  PresentationTeam   TeamIdSequence
      │              │                          │
      ├─ MeetingEvidence (1:1, immutable)       ├─ JudgeSubmission ─ JudgeMark
      ├─ MeetingAttendance (snapshot per member)│      ▲                 ▲
      └─ MeetingApproval (history)              │  JudgeAssignment  MarkingCriterion
                                     Presentation ── MarkingScheme ─┘

  Cross-cutting: AcademicConfiguration · GeofenceConfig · Setting ·
                 Notification · AuditLog · Session · ResourceCategory
```

### Key relationships and why they are shaped this way

| Relationship | Rationale |
| --- | --- |
| `User 1—* UserRole` | One account carries HOD + Faculty Mentor + Judge. No duplicate logins. |
| `UserRole.departmentId` | HOD/Mentor grants are department-scoped; Admin/Director/Super Admin are not. |
| `TeamMember.activeStudentKey` (unique, nullable) | Database-level guarantee that a student holds at most one *active* membership. Set to the student id while active, `NULL` after removal. |
| `Team.teamId` unique, nullable | The Team ID does not exist until approval. Nullable + unique expresses exactly that. |
| `TeamIdSequence(department, year)` | Per-department counter incremented inside the approval transaction; the unique index on `Team.teamId` is the final guard against duplicates. |
| `MeetingAttendance` name/enroll snapshots | Historical attendance must not change when a student profile is later edited. |
| `MeetingEvidence` 1:1 with two storage keys | Original capture *and* stamped evidence are both retained as audit artifacts. |
| `JudgeSubmission` unique `(presentationTeam, judge)` | Multiple judges per team, each submission preserved; aggregates are computed on read, never written over the originals. |
| `AcademicConfiguration` | Semester → project type and expected meeting count are data, not `if (semester >= 5)`. |
| `Setting(key, departmentId)` | College default plus optional department override for every tunable rule. |

---

## 3. RBAC matrix

Permissions are declared once in `src/lib/auth/rbac.ts`. The sidebar, the pages
and the services all read the same matrix; the server check is authoritative.

| Permission group | SUPER_ADMIN | DIRECTOR | ADMIN | HOD (own dept) | FACULTY_MENTOR | JUDGE | STUDENT |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| Academic configuration read/write | ✓ | ✓ | ✓ | ✓ | – | – | – |
| Geofence configuration | ✓ | ✓ | ✓ | ✓ (dept) | – | – | – |
| Analytics thresholds / health weights | ✓ | ✓ | ✓ | – | – | – | – |
| User create / edit / disable | ✓ | ✓ | ✓ | ✓ (dept) | – | – | – |
| Grant elevated roles (Admin+) | ✓ | ✓ | ✓ | – | – | – | – |
| Teams — read | all | all | all | dept | mentored | – | own |
| Teams — create (register) | – | – | – | – | – | – | ✓ (lead) |
| Teams — edit / archive / restore | ✓ | ✓ | ✓ | ✓ (dept) | – | – | – |
| Registration approval (issues Team ID) | ✓ | ✓ | ✓ | ✓ (dept) | ✓ (own teams) | – | – |
| Mentor assign / reassign | ✓ | ✓ | ✓ | ✓ (dept) | – | – | – |
| Meetings — read | all | all | all | dept | mentored | – | own |
| Meetings — record evidence | – ¹ | – ¹ | – ¹ | ✓ (dept) | ✓ (own teams) | – | – |
| Meetings — approve / reject | ✓ | ✓ | ✓ | ✓ (dept) | ✓ (configurable) | – | – |
| Resources — read / write | ✓ | ✓ | ✓ | ✓ | ✓ | – | ✓ (own team) |
| Presentations — read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (assigned) | ✓ (own) |
| Presentations — create / schedule | ✓ | ✓ | ✓ | ✓ (dept) | – | – | – |
| Judges — create / assign | ✓ | ✓ | ✓ | ✓ (dept) | – | – | – |
| Marking schemes | ✓ | ✓ | ✓ | ✓ | – | – | – |
| Marks — enter | ✓ | ✓ | ✓ | – | – | ✓ | – |
| Marks — read all | ✓ | ✓ | ✓ | ✓ (dept) | – | own only | published only |
| Marks — publish | ✓ | ✓ | ✓ | ✓ (dept) | – | – | – |
| Analytics | college | college | college | dept | mentees | – | – |
| Reports | ✓ | ✓ | ✓ | ✓ (dept) | ✓ (mentees) | – | – |
| **Audit log — read** | **✗ ²** | ✓ | ✓ | ✓ | – | – | – |

¹ Recording official evidence is bound to the team's assigned mentor (or the
department HOD) by design — the evidence is a statement that *that person* was
present. Administrators can reassign the mentor, approve, reject and read every
record, but the platform will not let an account that was not at the meeting
create the artifact. This follows the stated priority order: data integrity
above blanket access.

² **Deliberate deployment decision for this institution:** the audit log is not
exposed to `SUPER_ADMIN`. Audit *entries continue to be written* for every
Super Admin action; only the read surface is withheld, so institutional
oversight sits with the Director, Admin and HOD rather than the platform
operator. This is enforced in `ROLE_PERMISSIONS` and reflected in the sidebar.

**Scope resolution** (`departmentScope`, `teamScopeWhere`): college-wide roles
get an unrestricted `where`; an HOD is limited to `departmentId IN (their
departments)`; a mentor to `mentorUserId = self`; a student to teams they are
an active member of. A principal with no matching scope matches *nothing*, never
everything.

---

## 4. Authentication architecture

- Password hashing: bcrypt, cost 12; strength enforced at every write path.
- Session: 32 random bytes; the **SHA-256 hash** is stored in `Session`, and the
  cookie carries `token.HMAC(token, AUTH_SECRET)` so a tampered cookie is
  rejected before any database hit.
- Cookie: `httpOnly`, `sameSite=lax`, `secure` in production, TTL configurable.
- Revocation: disabling a user or resetting their password revokes live sessions.
- Rate limiting: per-account and per-IP fixed windows on sign-in and public
  registration; per-user cap on evidence submission.
- CSRF: Server Actions carry Next.js's built-in action-id protection and the
  session cookie is `SameSite=Lax`; the only non-action mutation endpoint is
  `POST /api/auth/logout`.
- `getPrincipal()` is `React.cache`-memoised, so a render with dozens of
  permission checks costs one query.

---

## 5. GPS / geofence architecture

```
Mentor opens capture
   │
   ├─ navigator.geolocation.getCurrentPosition (high accuracy, no cache)
   │        ↓
   ├─ evaluateGeofence(fix, rules)   ← same pure function, client side, for UX
   │        ↓  shows: GPS ✓ · accuracy band · distance from campus
   └─ submit → server action
             ↓
        getGeofence(departmentId)      ← rules in force *now*, dept override
             ↓
        evaluateGeofence(fix, rules)   ← re-evaluated; client verdict discarded
             ↓  allowed?  no → refuse with the exact reason
        haversineMeters(...)           ← proper great-circle distance
```

Stored per submission: latitude, longitude, accuracy, distance from anchor, the
radius in force at that moment, the accuracy band, the device capture time, the
**server** receive time, and the device string. A device clock more than 15
minutes from the server clock is discarded in favour of the server clock.

Configurable per college and per department: anchor latitude/longitude, allowed
radius, the accuracy above which a submission is refused, and the good/warning
accuracy bands. Nothing is hardcoded — the 80 m default lives in a seeded
`GeofenceConfig` row, not in code.

---

## 6. Photo evidence architecture

```
Camera (getUserMedia, facingMode: environment)
   │  canvas.toBlob → JPEG          ← no gallery picker on the primary path
   ▼
Server action: type/size validation (JPEG/PNG/WebP ≤ 8 MB)
   ▼
stampEvidence(original, facts)      ← facts come from the DB + validated fix
   │   teamId, mentor name .......... from Team / User rows
   │   lat, long, accuracy .......... from the server-validated fix
   │   address ...................... the campus anchor name when inside the
   │                                  fence; never client-supplied text
   │   date / time .................. trusted capture timestamp (Asia/Kolkata)
   ▼
StorageService.put ×2  →  original key + stamped key
   ▼
MeetingEvidence row (no update path exists anywhere in the service layer)
```

Both images are retained. `/api/files/[...key]` resolves the owning record and
re-applies the caller's team scope before streaming bytes, so a storage key
leaked from one department cannot be replayed by another.

Fallback: where `getUserMedia` is unavailable the UI falls back to
`<input type="file" accept="image/*" capture="environment">`, which opens the
camera on mobile. This limitation is stated in the UI rather than hidden.

---

## 7. Analytics architecture

One function, `computeTeamMetrics(where)`, is the single source of truth. Every
dashboard, table, export and risk flag reads from it, so no two screens can
disagree.

Per team it derives: meetings held vs. expected (from `AcademicConfiguration`),
days since the last meeting, attendance % from attendance snapshots,
presentation % from *submitted* judge evaluations, resource completeness, a
configurable weighted health score, and the list of matched risk rules.

```
Health = Σ(component% × weight) / Σ(weights)
components: meeting activity · attendance · presentation · progress · repository
default weights: 20 / 20 / 25 / 20 / 15   (configurable, must total 100)
bands: 90+ Excellent · 75–89 Healthy · 50–74 Needs Attention · <50 At Risk
```

Risk detection is a transparent rules engine — **no machine learning is used or
claimed**. Default rules: no meeting for N days, attendance below X%, more than
N rejected submissions, presentation below Y%, missing repository links. Every
threshold is editable in Configuration › Analytics.

Roll-ups (`rollup(metrics, keyOf)`) give the drill-down chain:

```
College → Department → Semester → Section → Faculty → Team → Student
```

---

## 8. Storage architecture

`StorageService` (`src/lib/storage/index.ts`) is an interface with a `LOCAL`
driver today. The database stores only opaque keys plus metadata (bytes, mime
type) — never a filesystem path — so an S3/Cloudinary/Supabase driver is a new
class plus `STORAGE_DRIVER=…`, with no schema or call-site changes. Keys are
sanitised and resolved against the storage root, so a crafted key cannot escape.

---

## 9. Folder structure

```
prisma/
  schema.prisma           data model (the only SQLite-specific line)
  seed.ts                 demo data, clearly marked
src/
  app/
    (auth)/login          sign-in
    (auth)/register       public team-lead registration
    (app)/                authenticated shell (sidebar filtered by permission)
      dashboard/          role-specific dashboards
      teams/[id]          project workspace (overview…timeline, manage)
      registrations/      approval queue + decision
      meetings/           list, evidence detail, mobile capture flow
      attendance/         overview + per-student
      presentations/      events, detail, results
      schemes/ judges/    evaluation configuration
      users/ configuration/ audit/ analytics/ reports/
      judge/              judge portal (Team ID → evaluate)
      my-team/            student surfaces
    api/
      files/[...key]      authorised file delivery
      reports/[kind]      CSV / XLSX generation
      search              scoped global search
  components/             UI kit, app shell, charts, filters
  lib/
    auth/                 rbac, session, password, page guard
    domain/               shared vocabularies
    services/             business logic (see §1)
    evidence/watermark.ts stamping pipeline
    geo.ts storage/ utils.ts rate-limit.ts env.ts db.ts
docs/                     this document
```

---

## 10. Screen map

| Role | Page | Purpose | Main components | Actions | Permission |
| --- | --- | --- | --- | --- | --- |
| All | `/login` | Sign in | Split hero, form | Sign in | public |
| Student (lead) | `/register` | Register a team | Multi-section form | Submit registration | public |
| Admin/Director/Super/HOD | `/dashboard` | College or department overview | KPI grid, department bars, trend line, at-risk table, upcoming events | Drill into team | `analytics.read.*` |
| Faculty | `/dashboard` | Mentoring workload | KPIs, pending approvals, my teams, schedules | Record meeting, review registration | `team.read.mentored` |
| Student | `/dashboard` | My project | KPIs, recent meetings, team card, next presentation | Open workspace | `team.read.own` |
| Judge | `/dashboard` | Evaluation queue | KPIs, assigned events, previous evaluations | Open evaluation | `marks.enter` |
| Admin/HOD/Faculty | `/teams` | All projects in scope | Filter bar, dense table, pagination | Filter, search, open | `team.read.*` |
| All (scoped) | `/teams/[id]` | Project workspace | Tabs: overview, team, meetings, attendance, presentations, resources, marks, timeline, manage | Edit, reassign mentor, add/remove member, add resource, archive | scope + `team.write` |
| Approvers | `/registrations`, `/registrations/[id]` | Approval queue | Status tabs, detail, decision panel | Approve (issues Team ID), request correction | `team.approve` |
| Mentor/HOD | `/meetings/record`, `/meetings/record/[id]` | **Mobile evidence capture** | Step indicator, GPS panel, camera, attendance checklist, one-line discussion, preview | Capture, submit | `meeting.record` |
| Scoped | `/meetings`, `/meetings/[id]` | Meeting register and evidence | Filters, table, stamped photo, capture record, attendance snapshot, approval history | Approve / reject / request resubmission | `meeting.read.*`, `meeting.approve` |
| Analysts | `/attendance`, `/attendance/students` | Attendance rollups | Trend, department bars, section/semester/mentor tables | Filter, export CSV/Excel | `analytics.read.*` |
| Analysts | `/analytics` | Project intelligence | Department comparison, health distribution, risk table | Filter, at-risk-only, export | `analytics.read.*` |
| Admin/HOD | `/presentations`, `/presentations/[id]` | Events and scheduling | Event table, create form, teams, judges, criterion chart, admin panel | Create, auto-schedule teams, assign judges, set marks visibility | `presentation.*` |
| Admin/HOD | `/presentations/results` | Cross-event results | Distribution chart, per-event tables | Review aggregates | `marks.read.all` |
| Admin/HOD | `/schemes` | Marking schemes | Scheme cards, builder with live total | Create scheme, add/remove criteria | `scheme.write` |
| Admin/HOD | `/judges` | Judge capability | Judge table, grant form | Grant Judge role to faculty | `judge.manage` |
| Admin/HOD | `/users` | Directory | Filters, table, inline actions, create form | Create, disable, reset password | `user.read` / `user.write` |
| Admin/HOD | `/configuration` | All academic and platform rules | Departments, sections, years, semester→type map, geofence, meeting rules, analytics weights | Save configuration | `config.write` |
| Director/Admin/HOD | `/audit` | Append-only action history | Search, table | Search | `audit.read` |
| Judge | `/judge`, `/judge/[code]` | Evaluate by Team ID | Team ID entry, project view, marks form with running total | Save draft, submit marks | `marks.enter` |
| Student | `/my-team`, `/my-team/meetings`, `/my-team/marks` | Student surfaces | Workspace redirect, meeting list with own attendance, published marks | View | `team.read.own` |
| All | `/notifications`, `/account` | Alerts and profile | List, permission list, password form | Mark read, change password | authenticated |

Every page implements loading (RSC streaming), empty, error (`error.tsx`),
not-found (`not-found.tsx`), permission-denied (`guard()`), validation-error and
confirmation states.

---

## 11. Core workflows

**Registration → Team ID**

```
Team lead submits → SUBMITTED (no Team ID)
    ├─ Mentor or HOD approves → transaction:
    │     TeamIdSequence(dept, year) += 1
    │     Team.teamId = PIEMR-<DEPT>-<NNN>   (unique index enforces this)
    │     status ACTIVE · timeline event · notifications
    └─ Rejected with reason → lead corrects → resubmits
```

**Official meeting evidence** — see §5 and §6. Ends in an approval state machine:
`PENDING_APPROVAL → APPROVED | REJECTED | RESUBMISSION_REQUIRED`, with every
decision kept in `MeetingApproval`. Approver roles are configurable.

**Evaluation** — Admin creates an event, attaches a scheme, auto-schedules the
eligible teams, assigns judges. A judge enters a Team ID, sees only permitted
project information, saves a draft, then submits (locked; an administrator can
reopen). Marks reach students only when visibility becomes `PUBLISHED`.

---

## 12. Development phases

| Phase | Scope | State |
| --- | --- | --- |
| 1 Foundation | Auth, RBAC, users, departments, sections, semesters, years, project types, academic configuration | Delivered |
| 2 Projects | Registration, approval, Team ID generation, team management, mentor assignment | Delivered |
| 3 Evidence | Mobile capture, GPS, geofence, watermarking, attendance, discussion, approval workflow | Delivered |
| 4 Workspace | Resources with categories and version history, timeline | Delivered (link resources; file uploads use the same StorageService and are the next increment) |
| 5 Presentations | Events, scheduling, judges, dynamic schemes, judge portal, multi-judge marks, release control | Delivered |
| 6 Analytics | Dashboards, attendance/meeting/presentation analytics, health score, risk engine, reports | Delivered (CSV + Excel; PDF via print-optimised pages) |

---

## 13. Testing

Three layers, each proving something the layer below cannot — pure logic
unit-tested, business rules integration-tested against a real (throwaway)
database, and RBAC/auth proven end-to-end over real HTTP with a real browser.
136 unit/integration tests and 29 end-to-end tests, all self-contained and
runnable with `npm test` / `npm run test:e2e`. Full strategy, what each test
file proves, and the one thing deliberately left to manual QA (real camera
capture) are in [`docs/TESTING.md`](TESTING.md).

---

## 14. Known limitations, stated plainly

- **Reverse geocoding** is not wired to an external service. The stamped address
  is the configured campus anchor name when the fix is inside the fence, and is
  otherwise omitted. Coordinates are always stamped. Adding a geocoder means one
  server-side call in `submitMeeting` — the field already exists.
- **PDF export** is produced by printing the print-optimised pages (`@media
  print` hides the chrome). CSV and XLSX are generated server-side.
- **Resource file uploads** currently store links; the `ProjectResource` model,
  `StorageService` and validation for files are in place for the upload path.
- **Rate limiting** is in-process — correct for a single-node college
  deployment, and the call sites are unchanged when a shared store is added.
- Seeded meetings carry no evidence images (no camera during seeding); real
  submissions always do.
