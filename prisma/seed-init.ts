/**
 * Real-deployment initialiser — the opposite of prisma/seed.ts.
 *
 * prisma/seed.ts fabricates ~450 demo accounts and 100+ fake project teams so
 * the platform has something to click through in development. This script is
 * for the moment a college actually adopts the platform: it creates only the
 * structural configuration every deployment needs to function — departments,
 * semesters, project types, one current academic year, the semester→project
 * type mapping, resource categories — and exactly one real Super Admin
 * account. No students, no faculty, no teams, no meetings, no marks.
 *
 * Everything else (real departments' actual names if different, sections,
 * additional academic years, faculty, students, team registrations) is added
 * afterwards through the application itself — Configuration, Users, and the
 * team registration flow — by people who actually know that data, not by a
 * script guessing it.
 *
 * Usage:
 *   ADMIN_NAME="Your Name" \
 *   ADMIN_EMAIL="you@example.edu" \
 *   ADMIN_PASSWORD="a-strong-password" \
 *   npm run db:init
 *
 * Safe to run only once: like prisma/seed.ts, it refuses on a database that
 * already has users, unless SEED_FORCE=1 is set.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const DEPARTMENTS = [
  { code: "CSE", name: "Computer Science & Engineering" },
  { code: "AIDS", name: "Artificial Intelligence & Data Science" },
  { code: "IOT", name: "Internet of Things" },
  { code: "ARE", name: "Automation & Robotics Engineering" },
  { code: "ME", name: "Mechanical Engineering" },
  { code: "CE", name: "Civil Engineering" },
  { code: "CP", name: "Computer Programming" },
  { code: "EE", name: "Electrical Engineering" },
  { code: "EC", name: "Electronics & Communication" },
  { code: "OTHER", name: "Other" },
];

const RESOURCE_CATEGORIES: [string, string, string][] = [
  ["GITHUB", "GitHub", "LINK"],
  ["DRIVE", "Google Drive", "LINK"],
  ["LIVE_DEMO", "Live Demo", "LINK"],
  ["PRESENTATION", "Presentation", "BOTH"],
  ["ARCHITECTURE", "Architecture", "BOTH"],
  ["REPORT", "Report", "BOTH"],
  ["DOCUMENTATION", "Documentation", "BOTH"],
  ["SOURCE_CODE", "Source Code", "BOTH"],
  ["OTHER", "Other", "BOTH"],
];

function currentAcademicYear(now = new Date()): { label: string; startsOn: Date; endsOn: Date } {
  // Indian academic year runs roughly July–June. Before July, we're still in
  // the year that started the previous July.
  const startYear = now.getMonth() >= 6 /* July = index 6 */ ? now.getFullYear() : now.getFullYear() - 1;
  return {
    label: `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`,
    startsOn: new Date(`${startYear}-07-01`),
    endsOn: new Date(`${startYear + 1}-06-30`),
  };
}

async function main() {
  const existingUsers = await db.user.count();
  if (existingUsers > 0 && process.env.SEED_FORCE !== "1") {
    console.log(
      `Database already has ${existingUsers} user(s). This looks like it's already initialised (or still ` +
        `holds demo data from "npm run db:seed"). Set SEED_FORCE=1 to run anyway, or start from an empty ` +
        `database if you want a genuinely clean install.`,
    );
    return;
  }

  const name = process.env.ADMIN_NAME?.trim();
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!name || !email || !password) {
    console.error(
      "Set ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD before running this script, e.g.:\n\n" +
        '  ADMIN_NAME="Your Name" ADMIN_EMAIL="you@example.edu" ' +
        'ADMIN_PASSWORD="a-strong-password" npm run db:init\n',
    );
    process.exitCode = 1;
    return;
  }
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    console.error("ADMIN_PASSWORD must be at least 8 characters and contain a letter and a number.");
    process.exitCode = 1;
    return;
  }

  console.log("Initialising a clean deployment (no demo data)...");

  for (const [index, dept] of DEPARTMENTS.entries()) {
    await db.department.upsert({
      where: { code: dept.code },
      update: {},
      create: { code: dept.code, name: dept.name, sortOrder: index },
    });
  }

  const semesters = [];
  for (let n = 1; n <= 8; n++) {
    semesters.push(
      await db.semester.upsert({
        where: { number: n },
        update: {},
        create: { number: n, label: `Semester ${n}`, sortOrder: n },
      }),
    );
  }

  const minor = await db.projectType.upsert({
    where: { code: "MINOR" },
    update: {},
    create: { code: "MINOR", name: "Minor Project" },
  });
  const major = await db.projectType.upsert({
    where: { code: "MAJOR" },
    update: {},
    create: { code: "MAJOR", name: "Major Project" },
  });

  const { label, startsOn, endsOn } = currentAcademicYear();
  const academicYear = await db.academicYear.upsert({
    where: { label },
    update: { isCurrent: true },
    create: { label, startsOn, endsOn, isCurrent: true },
  });

  // The documented default mapping (Sem 5/6 -> Minor, Sem 7/8 -> Major).
  // Fully editable afterwards from Configuration › Academic structure.
  const mapping: Record<number, string> = { 5: minor.id, 6: minor.id, 7: major.id, 8: major.id };
  for (const semester of semesters) {
    const projectTypeId = mapping[semester.number];
    if (!projectTypeId) continue;
    await db.academicConfiguration.upsert({
      where: { academicYearId_semesterId: { academicYearId: academicYear.id, semesterId: semester.id } },
      update: {},
      create: {
        academicYearId: academicYear.id,
        semesterId: semester.id,
        projectTypeId,
        expectedMeetings: semester.number >= 7 ? 14 : 12,
      },
    });
  }

  for (const [index, [code, catName, kind]] of RESOURCE_CATEGORIES.entries()) {
    await db.resourceCategory.upsert({
      where: { code },
      update: {},
      create: { code, name: catName, kind, sortOrder: index },
    });
  }

  const admin = await db.user.create({
    data: {
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      mustReset: true,
      roles: { create: [{ role: "SUPER_ADMIN" }] },
    },
  });

  console.log("\nDone. Created:");
  console.log(`  - ${DEPARTMENTS.length} departments, 8 semesters, Minor/Major project types`);
  console.log(`  - Academic year ${label} with the default semester→project-type mapping`);
  console.log(`  - ${RESOURCE_CATEGORIES.length} resource categories`);
  console.log(`  - One Super Admin: ${admin.email}`);
  console.log(
    "\nThe campus geofence is not configured yet — set the real campus coordinates in " +
      "Configuration › Geofence before mentors start recording meetings.",
  );
  console.log(
    "Sign in and use Configuration, Users, and the team registration flow to add your college's real " +
      "departments (if different), sections, faculty, students and teams.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
