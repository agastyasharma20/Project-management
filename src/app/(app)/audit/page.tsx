import { requirePrincipal } from "@/lib/auth/session";
import { guard } from "@/lib/auth/page-guard";

import { db } from "@/lib/db";
import { Badge, Card, CardHeader, EmptyState, InfoNote, PageHeader, Pagination, Table, Td, Th } from "@/components/ui";
import { formatDateTime, pageFrom, param } from "@/lib/utils";

export const metadata = { title: "Audit log" };

const PAGE_SIZE = 50;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requirePrincipal();
  // Deliberately not granted to SUPER_ADMIN — see ROLE_PERMISSIONS in rbac.ts.
  const denied = guard(principal, ["audit.read"]);
  if (denied) return denied;

  const sp = await searchParams;
  const q = param(sp, "q");
  const where = q
    ? {
        OR: [
          { action: { contains: q } },
          { entity: { contains: q } },
          { summary: { contains: q } },
          { actor: { name: { contains: q } } },
        ],
      }
    : {};

  const { page, skip, take } = pageFrom(sp, PAGE_SIZE);
  const [total, entries] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { name: true, email: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of significant actions." />

      <InfoNote>
        Audit entries cannot be edited or deleted through the application by any role. Actions taken by platform
        Super Admins are recorded here for institutional review.
      </InfoNote>

      <form className="my-4 flex gap-2" action="/audit">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Action, entity, actor or summary"
          className="h-9 min-w-[16rem] flex-1 rounded-lg border border-[var(--color-line-strong)] px-3 text-[13px]"
        />
        <button type="submit" className="h-9 rounded-lg border border-[var(--color-line-strong)] bg-white px-3 text-[13px]">
          Search
        </button>
      </form>

      <Card>
        <CardHeader title={`${total} entr${total === 1 ? "y" : "ies"}`} />
        {entries.length ? (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Actor</Th>
                  <Th>Action</Th>
                  <Th>Entity</Th>
                  <Th>Summary</Th>
                  <Th>Source</Th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <Td className="whitespace-nowrap">{formatDateTime(entry.createdAt)}</Td>
                    <Td className="whitespace-nowrap">
                      {entry.actor?.name ?? "System"}
                      {entry.actorRole ? (
                        <span className="block text-[11px] text-[var(--color-muted)]">
                          {entry.actorRole.replace(/_/g, " ").toLowerCase()}
                        </span>
                      ) : null}
                    </Td>
                    <Td>
                      <Badge>{entry.action.replace(/_/g, " ").toLowerCase()}</Badge>
                    </Td>
                    <Td>{entry.entity}</Td>
                    <Td className="max-w-[24rem]">{entry.summary}</Td>
                    <Td className="text-[11px] text-[var(--color-muted)]">{entry.ipAddress ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} pageSize={PAGE_SIZE} total={total} basePath="/audit" query={{ q }} />
          </>
        ) : (
          <EmptyState title="No audit entries" />
        )}
      </Card>
    </>
  );
}
