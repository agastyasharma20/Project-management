import { describe, expect, it } from "vitest";
import {
  assertCan,
  assertDepartment,
  AuthorizationError,
  can,
  canAccessDepartment,
  canAny,
  departmentScope,
  isCollegeWide,
  permissionsFor,
  ROLE_PERMISSIONS,
  type Principal,
} from "@/lib/auth/rbac";
import { ROLES } from "@/lib/domain/constants";

function principal(overrides: Partial<Principal>): Principal {
  return {
    userId: "u1",
    name: "Test",
    email: "test@example.com",
    roles: [],
    departmentIds: [],
    homeDepartmentId: null,
    studentProfileId: null,
    facultyProfileId: null,
    ...overrides,
  };
}

describe("ROLE_PERMISSIONS", () => {
  it("defines a permission set for every declared role", () => {
    for (const role of ROLES) {
      expect(ROLE_PERMISSIONS[role]).toBeDefined();
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });

  it("grants every college-wide administrative permission to DIRECTOR and ADMIN", () => {
    const adminPerms = new Set(ROLE_PERMISSIONS.ADMIN);
    const directorPerms = new Set(ROLE_PERMISSIONS.DIRECTOR);
    for (const p of ROLE_PERMISSIONS.SUPER_ADMIN) {
      expect(adminPerms.has(p) || p === "audit.read").toBe(true);
      expect(directorPerms.has(p) || p === "audit.read").toBe(true);
    }
  });

  it("deliberately withholds audit.read from SUPER_ADMIN while granting it to DIRECTOR, ADMIN and HOD", () => {
    // This is a documented product decision (see docs/ARCHITECTURE.md §3), not
    // an oversight — pin it with a test so a future refactor can't silently
    // hand the platform operator audit visibility.
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).not.toContain("audit.read");
    expect(ROLE_PERMISSIONS.DIRECTOR).toContain("audit.read");
    expect(ROLE_PERMISSIONS.ADMIN).toContain("audit.read");
    expect(ROLE_PERMISSIONS.HOD).toContain("audit.read");
  });

  it("gives JUDGE only presentation read and mark entry — nothing administrative", () => {
    const judgePerms = new Set(ROLE_PERMISSIONS.JUDGE);
    expect(judgePerms.has("marks.enter")).toBe(true);
    expect(judgePerms.has("presentation.read")).toBe(true);
    expect(judgePerms.has("user.write")).toBe(false);
    expect(judgePerms.has("team.write")).toBe(false);
    expect(judgePerms.has("audit.read")).toBe(false);
  });

  it("gives STUDENT read-only + self-registration, never approval or write access to others' teams", () => {
    const studentPerms = new Set(ROLE_PERMISSIONS.STUDENT);
    expect(studentPerms.has("team.register")).toBe(true);
    expect(studentPerms.has("team.read.own")).toBe(true);
    expect(studentPerms.has("team.approve")).toBe(false);
    expect(studentPerms.has("meeting.record")).toBe(false);
  });
});

describe("permissionsFor / can / canAny", () => {
  it("unions permissions across multiple simultaneous roles on one account", () => {
    const perms = permissionsFor(["HOD", "FACULTY_MENTOR", "JUDGE"]);
    expect(perms.has("team.approve")).toBe(true); // from HOD
    expect(perms.has("meeting.record")).toBe(true); // from FACULTY_MENTOR
    expect(perms.has("marks.enter")).toBe(true); // from JUDGE
  });

  it("can() reflects the union, not just the first role", () => {
    const p = principal({ roles: ["STUDENT", "JUDGE"] });
    expect(can(p, "team.register")).toBe(true);
    expect(can(p, "marks.enter")).toBe(true);
    expect(can(p, "config.write")).toBe(false);
  });

  it("canAny() is true if at least one permission matches", () => {
    const p = principal({ roles: ["STUDENT"] });
    expect(canAny(p, ["config.write", "team.read.own"])).toBe(true);
    expect(canAny(p, ["config.write", "audit.read"])).toBe(false);
  });

  it("a principal with no roles has no permissions", () => {
    const p = principal({ roles: [] });
    expect(permissionsFor([]).size).toBe(0);
    expect(can(p, "team.read.own")).toBe(false);
  });
});

describe("assertCan", () => {
  it("throws AuthorizationError (403) when the permission is missing", () => {
    const p = principal({ roles: ["STUDENT"] });
    expect(() => assertCan(p, "config.write")).toThrow(AuthorizationError);
    try {
      assertCan(p, "config.write");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(AuthorizationError);
      expect((error as AuthorizationError).status).toBe(403);
    }
  });

  it("does not throw when the permission is present", () => {
    const p = principal({ roles: ["ADMIN"] });
    expect(() => assertCan(p, "config.write")).not.toThrow();
  });
});

describe("isCollegeWide / canAccessDepartment / departmentScope", () => {
  const cse = "dept-cse";
  const aids = "dept-aids";

  it("treats SUPER_ADMIN, DIRECTOR and ADMIN as college-wide", () => {
    expect(isCollegeWide(principal({ roles: ["SUPER_ADMIN"] }))).toBe(true);
    expect(isCollegeWide(principal({ roles: ["DIRECTOR"] }))).toBe(true);
    expect(isCollegeWide(principal({ roles: ["ADMIN"] }))).toBe(true);
    expect(isCollegeWide(principal({ roles: ["HOD"], departmentIds: [cse] }))).toBe(false);
    expect(isCollegeWide(principal({ roles: ["FACULTY_MENTOR"] }))).toBe(false);
  });

  it("lets a college-wide principal access any department", () => {
    const admin = principal({ roles: ["ADMIN"] });
    expect(canAccessDepartment(admin, cse)).toBe(true);
    expect(canAccessDepartment(admin, aids)).toBe(true);
    expect(canAccessDepartment(admin, null)).toBe(true);
  });

  it("restricts an HOD to the departments they actually head", () => {
    const hod = principal({ roles: ["HOD"], departmentIds: [cse] });
    expect(canAccessDepartment(hod, cse)).toBe(true);
    expect(canAccessDepartment(hod, aids)).toBe(false);
    expect(canAccessDepartment(hod, null)).toBe(false);
  });

  it("assertDepartment throws for a department outside an HOD's scope", () => {
    const hod = principal({ roles: ["HOD"], departmentIds: [cse] });
    expect(() => assertDepartment(hod, aids)).toThrow(AuthorizationError);
    expect(() => assertDepartment(hod, cse)).not.toThrow();
  });

  it("departmentScope returns null (unrestricted) for college-wide roles and a list otherwise", () => {
    expect(departmentScope(principal({ roles: ["DIRECTOR"] }))).toBeNull();
    expect(departmentScope(principal({ roles: ["HOD"], departmentIds: [cse, aids] }))).toEqual([cse, aids]);
  });

  it("an HOD who heads two departments is scoped to exactly those two, not one", () => {
    const hod = principal({ roles: ["HOD"], departmentIds: [cse, aids] });
    expect(canAccessDepartment(hod, cse)).toBe(true);
    expect(canAccessDepartment(hod, aids)).toBe(true);
    expect(canAccessDepartment(hod, "dept-me")).toBe(false);
  });
});
