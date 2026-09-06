import type { Role } from "@/lib/domain/constants";

/**
 * Centralised permission catalogue.
 *
 * Every server action and route handler resolves authorisation through
 * `can()` / `assertCan()` here. UI navigation is filtered with the same
 * matrix, but the UI filter is cosmetic — the server check is authoritative.
 */
export const PERMISSIONS = [
  // Academic configuration
  "config.read",
  "config.write",
  "geofence.write",
  "analytics.config.write",

  // Users
  "user.read",
  "user.write",
  "user.role.write",

  // Teams / registrations
  "team.read.all",
  "team.read.department",
  "team.read.mentored",
  "team.read.own",
  "team.register",
  "team.write",
  "team.approve",
  "team.archive",
  "team.mentor.assign",

  // Meetings
  "meeting.read.all",
  "meeting.read.department",
  "meeting.read.mentored",
  "meeting.read.own",
  "meeting.record",
  "meeting.approve",

  // Resources
  "resource.read",
  "resource.write",

  // Presentations & evaluation
  "presentation.read",
  "presentation.write",
  "judge.manage",
  "scheme.write",
  "marks.read.all",
  "marks.enter",
  "marks.publish",

  // Analytics & reports
  "analytics.read.college",
  "analytics.read.department",
  "analytics.read.mentored",
  "report.generate",

  // Platform
  "audit.read",
  "notification.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const OPERATIONAL: Permission[] = [
  "config.read",
  "config.write",
  "geofence.write",
  "analytics.config.write",
  "user.read",
  "user.write",
  "user.role.write",
  "team.read.all",
  "team.read.department",
  "team.read.mentored",
  "team.read.own",
  "team.write",
  "team.approve",
  "team.archive",
  "team.mentor.assign",
  "meeting.read.all",
  "meeting.read.department",
  "meeting.read.mentored",
  "meeting.read.own",
  "meeting.approve",
  "resource.read",
  "resource.write",
  "presentation.read",
  "presentation.write",
  "judge.manage",
  "scheme.write",
  "marks.read.all",
  "marks.enter",
  "marks.publish",
  "analytics.read.college",
  "analytics.read.department",
  "analytics.read.mentored",
  "report.generate",
  "notification.read",
];

/**
 * Role → permission grants.
 *
 * SUPER_ADMIN holds every operational permission. Per the deployment
 * requirement for this institution, the audit log is deliberately NOT exposed
 * to SUPER_ADMIN — audit review sits with DIRECTOR / ADMIN / HOD, so the
 * platform operator cannot silently review (or be assumed to have reviewed)
 * institutional oversight records. Audit entries are still WRITTEN for
 * super-admin actions; only the read surface is withheld.
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: [...OPERATIONAL],
  DIRECTOR: [...OPERATIONAL, "audit.read"],
  ADMIN: [...OPERATIONAL, "audit.read"],
  HOD: [
    "config.read",
    "config.write",
    "geofence.write",
    "user.read",
    "user.write",
    "user.role.write",
    "team.read.department",
    "team.read.mentored",
    "team.write",
    "team.approve",
    "team.archive",
    "team.mentor.assign",
    "meeting.read.department",
    "meeting.read.mentored",
    "meeting.record",
    "meeting.approve",
    "resource.read",
    "resource.write",
    "presentation.read",
    "presentation.write",
    "judge.manage",
    "scheme.write",
    "marks.read.all",
    "marks.publish",
    "analytics.read.department",
    "analytics.read.mentored",
    "report.generate",
    "audit.read",
    "notification.read",
  ],
  FACULTY_MENTOR: [
    "team.read.mentored",
    "meeting.read.mentored",
    "meeting.record",
    "meeting.approve",
    "resource.read",
    "resource.write",
    "presentation.read",
    "analytics.read.mentored",
    "report.generate",
    "notification.read",
  ],
  JUDGE: ["presentation.read", "marks.enter", "notification.read"],
  STUDENT: [
    "team.read.own",
    "team.register",
    "meeting.read.own",
    "resource.read",
    "resource.write",
    "presentation.read",
    "notification.read",
    // Deliberately no marks.read.own: presentation marks are visible only to
    // HOD/Admin/Director/Super Admin — not to students or faculty mentors.
  ],
};

export interface Principal {
  userId: string;
  name: string;
  email: string;
  roles: Role[];
  /** Departments this user administers (HOD grants). */
  departmentIds: string[];
  /** Home department from the faculty/student profile, if any. */
  homeDepartmentId: string | null;
  studentProfileId: string | null;
  facultyProfileId: string | null;
}

export function permissionsFor(roles: Role[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const role of roles) for (const p of ROLE_PERMISSIONS[role] ?? []) set.add(p);
  return set;
}

export function can(principal: Principal, permission: Permission): boolean {
  return permissionsFor(principal.roles).has(permission);
}

export function canAny(principal: Principal, permissions: Permission[]): boolean {
  const set = permissionsFor(principal.roles);
  return permissions.some((p) => set.has(p));
}

export class AuthorizationError extends Error {
  readonly status = 403;
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function assertCan(principal: Principal, permission: Permission): void {
  if (!can(principal, permission)) throw new AuthorizationError();
}

export function assertCanAny(principal: Principal, permissions: Permission[]): void {
  if (!canAny(principal, permissions)) throw new AuthorizationError();
}

/** True when the principal's reach is the entire college. */
export function isCollegeWide(principal: Principal): boolean {
  return principal.roles.some((r) => r === "SUPER_ADMIN" || r === "DIRECTOR" || r === "ADMIN");
}

/**
 * Department scope check. College-wide roles pass for any department; an HOD
 * passes only for the departments they head.
 */
export function canAccessDepartment(principal: Principal, departmentId: string | null): boolean {
  if (isCollegeWide(principal)) return true;
  if (!departmentId) return false;
  return principal.departmentIds.includes(departmentId);
}

export function assertDepartment(principal: Principal, departmentId: string | null): void {
  if (!canAccessDepartment(principal, departmentId)) {
    throw new AuthorizationError("This record belongs to a department outside your scope.");
  }
}

/**
 * `null` means "no department restriction" (college-wide); an array restricts
 * queries to those department ids. Used to build Prisma `where` clauses.
 */
export function departmentScope(principal: Principal): string[] | null {
  if (isCollegeWide(principal)) return null;
  return principal.departmentIds;
}
