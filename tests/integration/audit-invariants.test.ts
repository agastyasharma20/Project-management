import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { recordAudit } from "@/lib/services/audit";
import { buildAcademicEnvironment, makeUser } from "./fixtures";

const SRC_ROOT = path.resolve(__dirname, "../../src");

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...listTsFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * These are "architecture guard" tests: they scan the source tree rather than
 * exercise runtime behaviour, to pin two invariants the platform depends on
 * for institutional trust — that the audit trail is append-only, and that
 * meeting evidence, once captured, cannot be edited by any code path. A
 * runtime test could pass today and be broken by a totally unrelated new
 * service function tomorrow; a source guard catches it at the point the
 * dangerous call is written, in code review or CI, before it ships.
 */
describe("append-only invariants (static source guard)", () => {
  const files = listTsFiles(SRC_ROOT);

  it("no source file calls db.auditLog.update(...) or db.auditLog.delete(...)", () => {
    const offenders = files.filter((file) => {
      const content = readFileSync(file, "utf8");
      return /auditLog\.(update|updateMany|delete|deleteMany)\s*\(/.test(content);
    });
    expect(offenders).toEqual([]);
  });

  it("no source file calls db.meetingEvidence.update(...) or db.meetingEvidence.delete(...)", () => {
    const offenders = files.filter((file) => {
      const content = readFileSync(file, "utf8");
      return /meetingEvidence\.(update|updateMany|delete|deleteMany)\s*\(/.test(content);
    });
    expect(offenders).toEqual([]);
  });

  it("no source file calls db.meetingAttendance.update(...) — attendance snapshots are write-once", () => {
    const offenders = files.filter((file) => {
      const content = readFileSync(file, "utf8");
      return /meetingAttendance\.(update|updateMany)\s*\(/.test(content);
    });
    expect(offenders).toEqual([]);
  });
});

describe("recordAudit (runtime behaviour)", () => {
  it("writes an entry that is queryable and carries the actor, action and summary", async () => {
    const env = await buildAcademicEnvironment();
    const admin = await makeUser({ roles: [{ role: "ADMIN" }] });

    await recordAudit(admin, {
      action: "TEST_ACTION",
      entity: "Department",
      entityId: env.department.id,
      summary: "Recorded by the audit invariants test.",
    });

    const entry = await db.auditLog.findFirstOrThrow({
      where: { action: "TEST_ACTION", entityId: env.department.id },
    });
    expect(entry.actorUserId).toBe(admin.userId);
    expect(entry.summary).toBe("Recorded by the audit invariants test.");
  });

  it("serialises before/after payloads as JSON rather than dropping them", async () => {
    const admin = await makeUser({ roles: [{ role: "ADMIN" }] });
    await recordAudit(admin, {
      action: "TEST_DIFF",
      entity: "Team",
      summary: "Diff payload test.",
      before: { status: "ACTIVE" },
      after: { status: "ARCHIVED" },
    });
    const entry = await db.auditLog.findFirstOrThrow({ where: { action: "TEST_DIFF" } });
    expect(JSON.parse(entry.beforeJson!)).toEqual({ status: "ACTIVE" });
    expect(JSON.parse(entry.afterJson!)).toEqual({ status: "ARCHIVED" });
  });

  it("records an entry even for an unauthenticated actor (null principal), never silently drops it", async () => {
    await recordAudit(null, { action: "TEST_SYSTEM_ACTION", entity: "User", summary: "System-initiated." });
    const entry = await db.auditLog.findFirstOrThrow({ where: { action: "TEST_SYSTEM_ACTION" } });
    expect(entry.actorUserId).toBeNull();
  });
});
