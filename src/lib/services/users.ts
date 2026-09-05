import { db } from "@/lib/db";
import type { Role } from "@/lib/domain/constants";
import type { Principal } from "@/lib/auth/rbac";
import { AuthorizationError, assertCan, assertDepartment, isCollegeWide } from "@/lib/auth/rbac";
import { hashPassword, passwordProblems } from "@/lib/auth/password";
import { DomainError } from "@/lib/services/teams";
import { recordAudit } from "@/lib/services/audit";

/** Only college-wide administrators may mint college-wide roles. */
const ELEVATED: Role[] = ["SUPER_ADMIN", "DIRECTOR", "ADMIN"];

export interface CreateUserInput {
  name: string;
  email: string;
  phone?: string | null;
  password: string;
  roles: Role[];
  departmentId?: string | null;
  // Student
  enrollmentNo?: string;
  sectionId?: string | null;
  semesterId?: string | null;
  // Faculty
  employeeCode?: string;
  designation?: string | null;
}

export async function createUser(principal: Principal, input: CreateUserInput) {
  assertCan(principal, "user.write");

  if (input.roles.some((r) => ELEVATED.includes(r)) && !isCollegeWide(principal)) {
    throw new AuthorizationError("Only college-wide administrators can grant Admin, Director or Super Admin roles.");
  }
  if (input.departmentId) assertDepartment(principal, input.departmentId);
  if (!isCollegeWide(principal) && !input.departmentId) {
    throw new DomainError("Select a department for this user.");
  }

  const problems = passwordProblems(input.password);
  if (problems.length) throw new DomainError(`Password must contain ${problems.join(", ")}.`);

  const email = input.email.trim().toLowerCase();
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new DomainError(`${email} is already registered.`);
  }

  const needsStudent = input.roles.includes("STUDENT");
  const needsFaculty = input.roles.some((r) => r === "FACULTY_MENTOR" || r === "HOD" || r === "JUDGE");

  if (needsStudent && !input.enrollmentNo) throw new DomainError("Enrollment number is required for students.");
  if (needsStudent && !input.departmentId) throw new DomainError("Students must belong to a department.");
  if (needsFaculty && !input.departmentId) throw new DomainError("Faculty must belong to a department.");

  const user = await db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name: input.name.trim(),
        email,
        phone: input.phone?.trim() || null,
        passwordHash: await hashPassword(input.password),
        roles: {
          create: input.roles.map((role) => ({
            role,
            departmentId: ELEVATED.includes(role) ? null : input.departmentId ?? null,
          })),
        },
      },
    });

    if (needsStudent) {
      await tx.studentProfile.create({
        data: {
          userId: created.id,
          enrollmentNo: input.enrollmentNo!.trim().toUpperCase(),
          departmentId: input.departmentId!,
          sectionId: input.sectionId ?? null,
          semesterId: input.semesterId ?? null,
        },
      });
    }
    if (needsFaculty) {
      await tx.facultyProfile.create({
        data: {
          userId: created.id,
          employeeCode: (input.employeeCode?.trim() || `EMP-${created.id.slice(-6).toUpperCase()}`),
          departmentId: input.departmentId!,
          designation: input.designation?.trim() || null,
        },
      });
    }
    return created;
  });

  await recordAudit(principal, {
    action: "USER_CREATED",
    entity: "User",
    entityId: user.id,
    summary: `Created ${user.email} with roles ${input.roles.join(", ")}`,
  });
  return user;
}

/** Grants an extra role to an existing account (e.g. making a faculty member a Judge). */
export async function grantRole(
  principal: Principal,
  userId: string,
  role: Role,
  departmentId: string | null,
) {
  assertCan(principal, "user.role.write");
  if (ELEVATED.includes(role) && !isCollegeWide(principal)) {
    throw new AuthorizationError("Only college-wide administrators can grant that role.");
  }
  if (departmentId) assertDepartment(principal, departmentId);

  const existing = await db.userRole.findFirst({ where: { userId, role, departmentId } });
  if (existing) return existing;

  const created = await db.userRole.create({ data: { userId, role, departmentId } });
  await recordAudit(principal, {
    action: "USER_ROLE_GRANTED",
    entity: "User",
    entityId: userId,
    summary: `Granted ${role}`,
  });
  return created;
}

export async function revokeRole(principal: Principal, userRoleId: string) {
  assertCan(principal, "user.role.write");
  const grant = await db.userRole.findUniqueOrThrow({ where: { id: userRoleId } });
  if (ELEVATED.includes(grant.role as Role) && !isCollegeWide(principal)) {
    throw new AuthorizationError("Only college-wide administrators can revoke that role.");
  }
  if (grant.role === "SUPER_ADMIN") {
    const remaining = await db.userRole.count({ where: { role: "SUPER_ADMIN" } });
    if (remaining <= 1) throw new DomainError("The last Super Admin cannot be removed.");
  }
  await db.userRole.delete({ where: { id: userRoleId } });
  await recordAudit(principal, {
    action: "USER_ROLE_REVOKED",
    entity: "User",
    entityId: grant.userId,
    summary: `Revoked ${grant.role}`,
  });
}

export async function setUserActive(principal: Principal, userId: string, isActive: boolean) {
  assertCan(principal, "user.write");
  const user = await db.user.update({ where: { id: userId }, data: { isActive } });
  if (!isActive) {
    await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  await recordAudit(principal, {
    action: isActive ? "USER_ENABLED" : "USER_DISABLED",
    entity: "User",
    entityId: userId,
    summary: `${isActive ? "Enabled" : "Disabled"} ${user.email}`,
  });
  return user;
}

export async function resetPassword(principal: Principal, userId: string, password: string) {
  assertCan(principal, "user.write");
  const problems = passwordProblems(password);
  if (problems.length) throw new DomainError(`Password must contain ${problems.join(", ")}.`);
  await db.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(password), mustReset: true },
  });
  await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await recordAudit(principal, {
    action: "USER_PASSWORD_RESET",
    entity: "User",
    entityId: userId,
    summary: "Password reset by administrator",
  });
}
