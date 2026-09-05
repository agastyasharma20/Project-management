import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPrincipal } from "@/lib/auth/session";
import { can, isCollegeWide } from "@/lib/auth/rbac";
import { teamScopeWhere } from "@/lib/services/teams";

/**
 * Global search. Results are always filtered through the caller's team scope —
 * a mentor searching a Team ID from another department gets nothing back.
 */
export async function GET(request: Request) {
  const principal = await getPrincipal();
  if (!principal) return NextResponse.json([], { status: 401 });

  const term = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (term.length < 2) return NextResponse.json([]);

  const scope = teamScopeWhere(principal);
  const hits: { kind: string; label: string; sub: string; href: string }[] = [];

  const teams = await db.team.findMany({
    where: {
      AND: [
        scope,
        {
          OR: [
            { teamId: { contains: term } },
            { projectTitle: { contains: term } },
            { members: { some: { student: { enrollmentNo: { contains: term } } } } },
            { members: { some: { student: { user: { name: { contains: term } } } } } },
          ],
        },
      ],
    },
    select: {
      id: true,
      teamId: true,
      projectTitle: true,
      department: { select: { code: true } },
      mentor: { select: { name: true } },
    },
    take: 8,
  });
  for (const team of teams) {
    hits.push({
      kind: "team",
      label: team.teamId ?? team.projectTitle,
      sub: `${team.projectTitle} · ${team.department.code} · ${team.mentor?.name ?? "No mentor"}`,
      href: `/teams/${team.id}`,
    });
  }

  if (can(principal, "user.read")) {
    const departmentFilter = isCollegeWide(principal) ? {} : { departmentId: { in: principal.departmentIds } };
    const students = await db.studentProfile.findMany({
      where: {
        AND: [
          departmentFilter,
          { OR: [{ enrollmentNo: { contains: term } }, { user: { name: { contains: term } } }] },
        ],
      },
      select: { id: true, enrollmentNo: true, user: { select: { name: true } }, department: { select: { code: true } } },
      take: 5,
    });
    for (const s of students) {
      hits.push({
        kind: "student",
        label: s.user.name,
        sub: `${s.enrollmentNo} · ${s.department.code}`,
        href: `/users?q=${encodeURIComponent(s.enrollmentNo)}`,
      });
    }

    const faculty = await db.facultyProfile.findMany({
      where: {
        AND: [
          departmentFilter,
          { OR: [{ employeeCode: { contains: term } }, { user: { name: { contains: term } } }] },
        ],
      },
      select: { id: true, employeeCode: true, user: { select: { id: true, name: true } }, department: { select: { code: true } } },
      take: 5,
    });
    for (const f of faculty) {
      hits.push({
        kind: "faculty",
        label: f.user.name,
        sub: `${f.employeeCode} · ${f.department.code}`,
        href: `/users?q=${encodeURIComponent(f.user.name)}`,
      });
    }
  }

  return NextResponse.json(hits.slice(0, 15));
}
