import { db } from "@/lib/db";
import type { Principal } from "@/lib/auth/rbac";
import { requestMeta } from "@/lib/auth/session";

export interface AuditInput {
  action: string;
  entity: string;
  entityId?: string | null;
  summary: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Append-only audit trail. There is deliberately no update or delete path for
 * AuditLog anywhere in the service layer, so no role — including SUPER_ADMIN —
 * can rewrite history through the application.
 */
export async function recordAudit(principal: Principal | null, input: AuditInput): Promise<void> {
  const meta = await requestMeta();
  await db.auditLog.create({
    data: {
      actorUserId: principal?.userId ?? null,
      actorRole: principal?.roles.join(",") ?? null,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      summary: input.summary,
      beforeJson: input.before === undefined ? null : JSON.stringify(input.before),
      afterJson: input.after === undefined ? null : JSON.stringify(input.after),
      ipAddress: meta.ip,
      userAgent: meta.userAgent,
    },
  });
}
