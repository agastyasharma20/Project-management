import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import type { Principal } from "@/lib/auth/rbac";
import type { Role } from "@/lib/domain/constants";

/**
 * Builds a self-contained academic environment: one department, one section,
 * one semester mapped to MINOR (via AcademicConfiguration, exactly like the
 * real semester → project-type rule), one project type, one academic year and
 * a campus-wide geofence. Every test file calls this once and gets a fully
 * isolated slice of data — ids are randomised so parallel `describe` blocks in
 * the same test run never collide even though they share one database file.
 */
// Semester.number is globally unique. A random draw collides often enough
// across a full test run (many files each building their own environment) to
// be flaky — a monotonic counter guarantees every call gets a fresh value.
let nextSemesterNumber = 9000;

export async function buildAcademicEnvironment() {
  const tag = randomUUID().slice(0, 8);

  const department = await db.department.create({
    data: { code: `T${tag.slice(0, 6)}`.toUpperCase(), name: `Test Department ${tag}` },
  });
  const section = await db.section.create({ data: { departmentId: department.id, name: "A" } });
  const semester = await db.semester.create({
    data: { number: nextSemesterNumber++, label: `Test Semester ${tag}` },
  });
  const minor = await db.projectType.create({ data: { code: `MINOR-${tag}`, name: "Minor Project" } });
  const major = await db.projectType.create({ data: { code: `MAJOR-${tag}`, name: "Major Project" } });
  const academicYear = await db.academicYear.create({
    data: {
      label: `Test Year ${tag}`,
      startsOn: new Date("2026-07-01"),
      endsOn: new Date("2027-06-30"),
    },
  });
  await db.academicConfiguration.create({
    data: {
      academicYearId: academicYear.id,
      semesterId: semester.id,
      projectTypeId: minor.id,
      expectedMeetings: 6,
    },
  });
  await db.geofenceConfig.create({
    data: {
      name: `Test Campus ${tag}`,
      departmentId: department.id,
      latitude: 22.719568,
      longitude: 75.857726,
      radiusM: 80,
      minAccuracyM: 50,
      goodAccuracyM: 20,
      warnAccuracyM: 50,
      enforce: true,
    },
  });

  return { tag, department, section, semester, minor, major, academicYear };
}

export interface MakeUserOptions {
  roles: { role: Role; departmentId?: string | null }[];
  asStudent?: { departmentId: string; sectionId?: string | null; semesterId?: string | null };
  asFaculty?: { departmentId: string };
}

/** Creates a User row (+ optional Student/Faculty profile) and its matching Principal. */
export async function makeUser(options: MakeUserOptions): Promise<Principal & { userId: string }> {
  const id = randomUUID();
  const user = await db.user.create({
    data: {
      name: `Test User ${id.slice(0, 8)}`,
      email: `${id}@test.local`,
      passwordHash: await hashPassword("Test@12345"),
      roles: { create: options.roles.map((r) => ({ role: r.role, departmentId: r.departmentId ?? null })) },
    },
  });

  let studentProfileId: string | null = null;
  if (options.asStudent) {
    const profile = await db.studentProfile.create({
      data: {
        userId: user.id,
        enrollmentNo: `ENR-${id.slice(0, 10).toUpperCase()}`,
        departmentId: options.asStudent.departmentId,
        sectionId: options.asStudent.sectionId ?? null,
        semesterId: options.asStudent.semesterId ?? null,
      },
    });
    studentProfileId = profile.id;
  }

  let facultyProfileId: string | null = null;
  if (options.asFaculty) {
    const profile = await db.facultyProfile.create({
      data: {
        userId: user.id,
        employeeCode: `EMP-${id.slice(0, 10).toUpperCase()}`,
        departmentId: options.asFaculty.departmentId,
      },
    });
    facultyProfileId = profile.id;
  }

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    roles: options.roles.map((r) => r.role),
    departmentIds: options.roles.filter((r) => r.departmentId).map((r) => r.departmentId as string),
    homeDepartmentId: options.asFaculty?.departmentId ?? options.asStudent?.departmentId ?? null,
    studentProfileId,
    facultyProfileId,
  };
}

/** A small, fully-registered team: lead + N-1 members, all in the given department/section/semester. */
export async function makeApprovedTeam(env: Awaited<ReturnType<typeof buildAcademicEnvironment>>, opts: {
  mentor: Awaited<ReturnType<typeof makeUser>>;
  memberCount?: number;
  teamCode?: string;
}) {
  const count = opts.memberCount ?? 3;
  const members = [];
  for (let i = 0; i < count; i++) {
    members.push(
      await makeUser({
        roles: [{ role: "STUDENT", departmentId: env.department.id }],
        asStudent: { departmentId: env.department.id, sectionId: env.section.id, semesterId: env.semester.id },
      }),
    );
  }

  const team = await db.team.create({
    data: {
      // Real Team IDs are always uppercase (PIEMR-<DEPT>-<NNN>) — match that
      // invariant here so lookups by Team ID (which uppercase the input,
      // exactly like the real approval flow) behave the same in tests.
      teamId: opts.teamCode ?? `TEST-${env.tag.toUpperCase()}-${Math.floor(Math.random() * 100000)}`,
      projectTitle: `Test Project ${env.tag}`,
      projectDescription: "A test project used only by the automated test suite.",
      departmentId: env.department.id,
      sectionId: env.section.id,
      semesterId: env.semester.id,
      projectTypeId: env.minor.id,
      academicYearId: env.academicYear.id,
      mentorUserId: opts.mentor.userId,
      leadStudentId: members[0].studentProfileId!,
      registrationStatus: "APPROVED",
      status: "ACTIVE",
      approvedAt: new Date(),
      members: {
        create: members.map((m, index) => ({
          studentId: m.studentProfileId!,
          isLead: index === 0,
          activeStudentKey: m.studentProfileId!,
        })),
      },
    },
  });

  return { team, members };
}
