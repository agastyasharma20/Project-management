/**
 * Demo / development seed.
 *
 * Everything created here is clearly marked as seed data:
 *  - every generated account uses the @seed.piemr.edu.in mail domain
 *  - project titles are prefixed with "[Demo]"
 *  - the seed is idempotent-ish: it refuses to run twice unless SEED_FORCE=1
 *
 * No demo values are hardcoded into UI components — the application reads
 * everything from the database.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const SEED_DOMAIN = "seed.piemr.edu.in";
const PASSWORD = process.env.SEED_PASSWORD ?? "Piemr@2026";

const DEPARTMENTS = [
  { code: "CSE", name: "Computer Science & Engineering", sections: ["A", "B", "C"] },
  { code: "AIDS", name: "Artificial Intelligence & Data Science", sections: ["A", "B"] },
  { code: "IOT", name: "Internet of Things", sections: ["A"] },
  { code: "ARE", name: "Automation & Robotics Engineering", sections: ["A"] },
  { code: "ME", name: "Mechanical Engineering", sections: ["A", "B"] },
  { code: "CE", name: "Civil Engineering", sections: ["A"] },
  { code: "CP", name: "Computer Programming", sections: ["A"] },
  { code: "EE", name: "Electrical Engineering", sections: ["A"] },
  { code: "EC", name: "Electronics & Communication", sections: ["A"] },
  { code: "OTHER", name: "Other", sections: ["A"] },
];

const TITLES = [
  "AI Based Traffic Management System",
  "Campus Energy Monitoring Platform",
  "Smart Attendance with Face Recognition",
  "Crop Disease Detection using Vision",
  "Blockchain Certificate Verification",
  "Predictive Maintenance for Machinery",
  "Flood Early Warning Network",
  "Assistive Navigation for the Visually Impaired",
  "Automated Timetable Generator",
  "Water Quality Telemetry System",
  "Waste Segregation Robot",
  "Library Recommendation Engine",
  "Structural Health Monitoring Dashboard",
  "Solar Output Forecasting Tool",
  "Hostel Grievance Management System",
];

const DISCUSSIONS = [
  "Discussed database architecture and finalised API integration for authentication.",
  "Reviewed dataset preparation and split strategy for the training pipeline.",
  "Walked through the hardware wiring diagram and revised the sensor placement.",
  "Finalised the UI wireframes and assigned module ownership across the team.",
  "Reviewed literature survey findings and shortlisted the baseline approach.",
  "Debugged deployment issues and planned the load-testing schedule.",
  "Went through the interim report draft and corrected the methodology section.",
];

let rngState = 20260905;
/** Deterministic PRNG so repeated seeds produce comparable demo data. */
function rand(): number {
  rngState = (rngState * 1103515245 + 12345) % 2147483648;
  return rngState / 2147483648;
}
const pick = <T,>(items: T[]): T => items[Math.floor(rand() * items.length)];
const between = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));

async function main() {
  const existing = await db.user.count();
  if (existing > 0 && process.env.SEED_FORCE !== "1") {
    console.log(`Database already has ${existing} users. Set SEED_FORCE=1 to seed anyway.`);
    return;
  }

  console.log("Seeding demo data…");
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // --- Academic structure -------------------------------------------------
  const departments = [];
  for (const [index, dept] of DEPARTMENTS.entries()) {
    const department = await db.department.upsert({
      where: { code: dept.code },
      update: {},
      create: { code: dept.code, name: dept.name, sortOrder: index },
    });
    for (const [sIndex, name] of dept.sections.entries()) {
      await db.section.upsert({
        where: { departmentId_name: { departmentId: department.id, name } },
        update: {},
        create: { departmentId: department.id, name, sortOrder: sIndex },
      });
    }
    departments.push(department);
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

  const year = await db.academicYear.upsert({
    where: { label: "2026-27" },
    update: { isCurrent: true },
    create: {
      label: "2026-27",
      startsOn: new Date("2026-07-01"),
      endsOn: new Date("2027-06-30"),
      isCurrent: true,
    },
  });
  const previousYear = await db.academicYear.upsert({
    where: { label: "2025-26" },
    update: {},
    create: { label: "2025-26", startsOn: new Date("2025-07-01"), endsOn: new Date("2026-06-30") },
  });

  // Semester → project type mapping (configurable, not hardcoded in code).
  const mapping: Record<number, string> = { 5: minor.id, 6: minor.id, 7: major.id, 8: major.id };
  for (const semester of semesters) {
    const projectTypeId = mapping[semester.number];
    if (!projectTypeId) continue;
    for (const academicYear of [year, previousYear]) {
      await db.academicConfiguration.upsert({
        where: { academicYearId_semesterId: { academicYearId: academicYear.id, semesterId: semester.id } },
        update: {},
        create: {
          academicYearId: academicYear.id,
          semesterId: semester.id,
          projectTypeId,
          expectedMeetings: semester.number >= 7 ? 14 : 12,
          meetingFrequency: "WEEKLY",
          meetingIntervalDays: 7,
        },
      });
    }
  }

  for (const [index, category] of [
    ["GITHUB", "GitHub", "LINK"],
    ["DRIVE", "Google Drive", "LINK"],
    ["LIVE_DEMO", "Live Demo", "LINK"],
    ["PRESENTATION", "Presentation", "BOTH"],
    ["ARCHITECTURE", "Architecture", "BOTH"],
    ["REPORT", "Report", "BOTH"],
    ["DOCUMENTATION", "Documentation", "BOTH"],
    ["SOURCE_CODE", "Source Code", "BOTH"],
    ["OTHER", "Other", "BOTH"],
  ].entries()) {
    const [code, name, kind] = category as [string, string, string];
    await db.resourceCategory.upsert({
      where: { code },
      update: {},
      create: { code, name, kind, sortOrder: index },
    });
  }

  await db.geofenceConfig.create({
    data: {
      name: "PIEMR, Indore",
      departmentId: null,
      latitude: 22.719568,
      longitude: 75.857726,
      radiusM: 80,
      minAccuracyM: 50,
      goodAccuracyM: 20,
      warnAccuracyM: 50,
      enforce: true,
    },
  });

  // --- Platform accounts --------------------------------------------------
  const makeUser = async (
    name: string,
    email: string,
    roles: { role: string; departmentId?: string | null }[],
  ) =>
    db.user.create({
      data: {
        name,
        email,
        passwordHash,
        phone: `98${between(10000000, 99999999)}`,
        roles: { create: roles.map((r) => ({ role: r.role, departmentId: r.departmentId ?? null })) },
      },
    });

  await makeUser("Seed Super Admin", `superadmin@${SEED_DOMAIN}`, [{ role: "SUPER_ADMIN" }]);
  await makeUser("Seed Director", `director@${SEED_DOMAIN}`, [{ role: "DIRECTOR" }]);
  await makeUser("Seed Admin", `admin@${SEED_DOMAIN}`, [{ role: "ADMIN" }]);

  const facultyByDepartment = new Map<string, { userId: string; name: string }[]>();

  for (const department of departments) {
    const code = department.code.toLowerCase();

    // HOD — also a faculty mentor on the same account (no duplicate login).
    const hod = await makeUser(`Dr. ${department.code} HOD`, `hod.${code}@${SEED_DOMAIN}`, [
      { role: "HOD", departmentId: department.id },
      { role: "FACULTY_MENTOR", departmentId: department.id },
    ]);
    await db.facultyProfile.create({
      data: {
        userId: hod.id,
        employeeCode: `PIEMR-${department.code}-HOD`,
        departmentId: department.id,
        designation: "Head of Department",
      },
    });
    await db.department.update({ where: { id: department.id }, data: { hodUserId: hod.id } });

    const list = [{ userId: hod.id, name: hod.name }];
    const facultyCount = department.code === "CSE" ? 8 : department.code === "AIDS" ? 5 : 3;
    for (let i = 1; i <= facultyCount; i++) {
      const faculty = await makeUser(
        `Prof. ${department.code} Faculty ${i}`,
        `faculty${i}.${code}@${SEED_DOMAIN}`,
        [{ role: "FACULTY_MENTOR", departmentId: department.id }],
      );
      await db.facultyProfile.create({
        data: {
          userId: faculty.id,
          employeeCode: `PIEMR-${department.code}-F${String(i).padStart(3, "0")}`,
          departmentId: department.id,
          designation: i % 3 === 0 ? "Associate Professor" : "Assistant Professor",
        },
      });
      list.push({ userId: faculty.id, name: faculty.name });
    }
    facultyByDepartment.set(department.id, list);
  }

  // Two judges per department, added onto existing faculty accounts.
  for (const department of departments) {
    for (const faculty of (facultyByDepartment.get(department.id) ?? []).slice(0, 2)) {
      await db.userRole.create({
        data: { userId: faculty.userId, role: "JUDGE", departmentId: department.id },
      });
    }
  }

  // --- Teams --------------------------------------------------------------
  const teamPlan: { department: (typeof departments)[number]; count: number }[] = departments.map((d) => ({
    department: d,
    count: d.code === "CSE" ? 32 : d.code === "AIDS" ? 18 : d.code === "IOT" ? 12 : 8,
  }));

  let studentCounter = 0;
  let meetingCounter = 0;
  const createdTeams: { id: string; departmentId: string; semesterId: string; projectTypeId: string }[] = [];

  for (const plan of teamPlan) {
    const sections = await db.section.findMany({ where: { departmentId: plan.department.id } });
    const faculty = facultyByDepartment.get(plan.department.id) ?? [];
    const sequence = await db.teamIdSequence.create({
      data: { departmentId: plan.department.id, academicYearId: year.id, lastValue: 0 },
    });
    let seq = 0;

    for (let t = 0; t < plan.count; t++) {
      const semester = semesters[pick([4, 5, 6, 7])]; // semesters 5..8
      const projectTypeId = mapping[semester.number];
      const section = pick(sections);
      const mentor = pick(faculty);
      const size = between(3, 4);

      const memberProfiles = [];
      for (let m = 0; m < size; m++) {
        studentCounter += 1;
        const enrollmentNo = `0808${plan.department.code}22${String(studentCounter).padStart(4, "0")}`;
        const user = await makeUser(
          `${plan.department.code} Student ${studentCounter}`,
          `student${studentCounter}@${SEED_DOMAIN}`,
          [{ role: "STUDENT", departmentId: plan.department.id }],
        );
        memberProfiles.push(
          await db.studentProfile.create({
            data: {
              userId: user.id,
              enrollmentNo,
              departmentId: plan.department.id,
              sectionId: section.id,
              semesterId: semester.id,
            },
          }),
        );
      }

      // ~88% of registrations are approved; the rest exercise the pending and
      // rejected states so those screens have realistic content.
      const roll = rand();
      const approved = roll < 0.88;
      const rejected = !approved && roll < 0.94;
      seq += approved ? 1 : 0;

      const team = await db.team.create({
        data: {
          teamId: approved ? `PIEMR-${plan.department.code}-${String(seq).padStart(3, "0")}` : null,
          projectTitle: `[Demo] ${pick(TITLES)}`,
          projectDescription:
            "Seed project record used for demonstration. Replace with the real project abstract before going live.",
          departmentId: plan.department.id,
          sectionId: section.id,
          semesterId: semester.id,
          projectTypeId,
          academicYearId: year.id,
          mentorUserId: mentor.userId,
          leadStudentId: memberProfiles[0].id,
          registrationStatus: approved ? "APPROVED" : rejected ? "REJECTED" : "SUBMITTED",
          rejectionReason: rejected ? "Project scope is too broad — narrow it and resubmit." : null,
          approvedAt: approved ? new Date() : null,
          status: approved ? "ACTIVE" : "REGISTERED",
          members: {
            create: memberProfiles.map((p, index) => ({
              studentId: p.id,
              isLead: index === 0,
              activeStudentKey: p.id,
            })),
          },
          timeline: {
            create: { kind: "REGISTERED", title: "Project registered", detail: "Seed data" },
          },
        },
      });

      if (approved) {
        createdTeams.push({
          id: team.id,
          departmentId: plan.department.id,
          semesterId: semester.id,
          projectTypeId,
        });

        // Resources: most teams publish GitHub + Drive, some do not (so the
        // resource-completeness metric has real variance).
        const categories = await db.resourceCategory.findMany();
        const github = categories.find((c) => c.code === "GITHUB")!;
        const drive = categories.find((c) => c.code === "DRIVE")!;
        if (rand() > 0.15) {
          await db.projectResource.create({
            data: {
              teamId: team.id,
              categoryId: github.id,
              title: "Source repository",
              url: `https://github.com/piemr-demo/${team.teamId?.toLowerCase()}`,
              addedByUserId: memberProfiles[0].userId,
            },
          });
        }
        if (rand() > 0.35) {
          await db.projectResource.create({
            data: {
              teamId: team.id,
              categoryId: drive.id,
              title: "Project drive",
              url: `https://drive.google.com/drive/folders/${team.id.slice(0, 12)}`,
              addedByUserId: memberProfiles[0].userId,
            },
          });
        }

        // Meetings with attendance snapshots.
        const meetings = between(2, 11);
        for (let i = meetings; i >= 1; i--) {
          meetingCounter += 1;
          const heldAt = new Date(Date.now() - i * between(6, 10) * 86_400_000);
          const present = memberProfiles.filter(() => rand() > 0.18);
          const status = rand() > 0.08 ? "APPROVED" : "PENDING_APPROVAL";
          await db.meeting.create({
            data: {
              code: `MR-${String(meetingCounter).padStart(6, "0")}`,
              teamId: team.id,
              mentorUserId: mentor.userId,
              discussion: pick(DISCUSSIONS),
              heldAt,
              status,
              presentCount: present.length,
              memberCount: memberProfiles.length,
              attendance: {
                create: memberProfiles.map((p, idx) => ({
                  studentId: p.id,
                  present: present.includes(p),
                  nameSnapshot: `${plan.department.code} Student ${studentCounter - memberProfiles.length + idx + 1}`,
                  enrollSnapshot: p.enrollmentNo,
                })),
              },
            },
          });
        }
      }
    }

    await db.teamIdSequence.update({ where: { id: sequence.id }, data: { lastValue: seq } });
  }

  // --- Marking scheme + presentations ------------------------------------
  const scheme = await db.markingScheme.create({
    data: {
      name: "Standard Project Evaluation",
      totalMarks: 100,
      criteria: {
        create: [
          { label: "Problem Understanding", maxMarks: 10, sortOrder: 0 },
          { label: "Innovation", maxMarks: 10, sortOrder: 1 },
          { label: "Technical Implementation", maxMarks: 20, sortOrder: 2 },
          { label: "Architecture", maxMarks: 10, sortOrder: 3 },
          { label: "Presentation", maxMarks: 10, sortOrder: 4 },
          { label: "Q&A", maxMarks: 10, sortOrder: 5 },
          { label: "Progress", maxMarks: 20, sortOrder: 6 },
          { label: "Documentation", maxMarks: 10, sortOrder: 7 },
        ],
      },
    },
    include: { criteria: true },
  });

  const cse = departments.find((d) => d.code === "CSE")!;
  const cseJudges = await db.userRole.findMany({
    where: { role: "JUDGE", departmentId: cse.id },
    select: { userId: true },
  });

  for (const [index, label] of ["Presentation 1", "Presentation 2"].entries()) {
    const presentation = await db.presentation.create({
      data: {
        name: label,
        academicYearId: year.id,
        departmentId: cse.id,
        schemeId: scheme.id,
        scheduledOn: new Date(Date.now() - (index === 0 ? 30 : 5) * 86_400_000),
        startTime: "10:30",
        endTime: "16:00",
        venue: `Seminar Hall ${index + 1}`,
        status: "COMPLETED",
        marksVisibility: index === 0 ? "PUBLISHED" : "REVIEWED",
        judges: { create: cseJudges.map((j) => ({ judgeUserId: j.userId })) },
      },
    });

    const cseTeams = createdTeams.filter((t) => t.departmentId === cse.id).slice(0, 20);
    for (const [order, team] of cseTeams.entries()) {
      const slot = await db.presentationTeam.create({
        data: {
          presentationId: presentation.id,
          teamId: team.id,
          sortOrder: order,
          slotTime: `${10 + Math.floor(order / 4)}:${(order % 4) * 15 || "00"}`,
          venue: presentation.venue,
        },
      });

      for (const judge of cseJudges) {
        const marks = scheme.criteria.map((c) => ({
          criterionId: c.id,
          value: Math.max(1, Math.round(c.maxMarks * (0.55 + rand() * 0.42))),
        }));
        const total = marks.reduce((s, m) => s + m.value, 0);
        await db.judgeSubmission.create({
          data: {
            presentationTeamId: slot.id,
            judgeUserId: judge.userId,
            status: "SUBMITTED",
            totalMarks: total,
            maxMarks: scheme.totalMarks,
            submittedAt: presentation.scheduledOn,
            marks: { create: marks },
          },
        });
      }
    }
  }

  // Upcoming event so schedule screens are populated.
  await db.presentation.create({
    data: {
      name: "Presentation 3",
      academicYearId: year.id,
      departmentId: cse.id,
      schemeId: scheme.id,
      scheduledOn: new Date(Date.now() + 21 * 86_400_000),
      startTime: "10:30",
      venue: "Seminar Hall 2",
      status: "SCHEDULED",
      marksVisibility: "DRAFT",
      judges: { create: cseJudges.map((j) => ({ judgeUserId: j.userId })) },
    },
  });

  const counts = {
    users: await db.user.count(),
    teams: await db.team.count(),
    meetings: await db.meeting.count(),
    presentations: await db.presentation.count(),
  };
  console.log("Seed complete:", counts);
  console.log(`Every seeded account uses the password: ${PASSWORD}`);
  console.log(`Sign in as superadmin@${SEED_DOMAIN}, director@${SEED_DOMAIN}, admin@${SEED_DOMAIN},`);
  console.log(`hod.cse@${SEED_DOMAIN}, faculty1.cse@${SEED_DOMAIN} or student1@${SEED_DOMAIN}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
