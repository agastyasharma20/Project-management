import { requirePrincipal } from "@/lib/auth/session";
import { guard } from "@/lib/auth/page-guard";

import { db } from "@/lib/db";
import { teamScopeWhere } from "@/lib/services/teams";
import { Badge, ButtonLink, Card, CardHeader, EmptyState, PageHeader, Pagination, StatusBadge, Table, Td, Th } from "@/components/ui";
import { formatDateTime, pageFrom, param } from "@/lib/utils";

export const metadata = { title: "Meetings" };

const PAGE_SIZE = 25;

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const principal = await requirePrincipal();
  const denied = guard(principal, [
    "meeting.read.all",
    "meeting.read.department",
    "meeting.read.mentored",
    "meeting.read.own",
  ]);
  if (denied) return denied;
  const sp = await searchParams;
  const status = param(sp, "status");
  const q = param(sp, "q");

  const where = {
    team: teamScopeWhere(principal),
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { code: { contains: q } },
            { discussion: { contains: q } },
            { team: { teamId: { contains: q } } },
          ],
        }
      : {}),
  };

  const { page, skip, take } = pageFrom(sp, PAGE_SIZE);
  const [total, meetings] = await Promise.all([
    db.meeting.count({ where }),
    db.meeting.findMany({
      where,
      skip,
      take,
      orderBy: { heldAt: "desc" },
      include: {
        team: { select: { id: true, teamId: true, department: { select: { code: true } } } },
        mentor: { select: { name: true } },
        evidence: { select: { geofenceOk: true, accuracyM: true, distanceM: true } },
      },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Meetings"
        description="Every official meeting with its geofenced, camera-captured evidence."
      />

      <form className="mb-4 flex flex-wrap gap-2" action="/meetings">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Meeting code, team ID or discussion…"
          className="h-9 min-w-[14rem] flex-1 rounded-lg border border-[var(--color-line-strong)] px-3 text-[13px]"
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          aria-label="Status"
          className="h-9 rounded-lg border border-[var(--color-line-strong)] bg-white px-3 text-[13px]"
        >
          <option value="">All statuses</option>
          {["PENDING_APPROVAL", "APPROVED", "REJECTED", "RESUBMISSION_REQUIRED"].map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ").toLowerCase()}
            </option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 rounded-lg border border-[var(--color-line-strong)] bg-white px-3 text-[13px]"
        >
          Apply
        </button>
      </form>

      <Card>
        <CardHeader title={`${total} meeting${total === 1 ? "" : "s"}`} />
        {meetings.length ? (
          <>
            <Table>
              <thead>
                <tr>
                  <Th>Code</Th>
                  <Th>Team</Th>
                  <Th>Held</Th>
                  <Th>Discussion</Th>
                  <Th>Attendance</Th>
                  <Th>Evidence</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {meetings.map((m) => (
                  <tr key={m.id}>
                    <Td className="font-medium">{m.code}</Td>
                    <Td className="whitespace-nowrap">
                      {m.team.teamId}
                      <span className="block text-[12px] text-[var(--color-muted)]">{m.mentor.name}</span>
                    </Td>
                    <Td className="whitespace-nowrap">{formatDateTime(m.heldAt)}</Td>
                    <Td className="max-w-[20rem] truncate">{m.discussion}</Td>
                    <Td className="tabular">
                      {m.presentCount}/{m.memberCount}
                    </Td>
                    <Td className="whitespace-nowrap">
                      {m.evidence ? (
                        <>
                          <Badge tone={m.evidence.geofenceOk ? "success" : "danger"}>
                            {m.evidence.geofenceOk ? "on campus" : `${Math.round(m.evidence.distanceM)}m away`}
                          </Badge>
                          <span className="tabular ml-1 text-[12px] text-[var(--color-muted)]">
                            ±{Math.round(m.evidence.accuracyM)}m
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td>
                      <StatusBadge status={m.status} />
                    </Td>
                    <Td className="text-right">
                      <ButtonLink size="sm" href={`/meetings/${m.id}`}>
                        Open
                      </ButtonLink>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              basePath="/meetings"
              query={{ q, status }}
            />
          </>
        ) : (
          <EmptyState title="No meetings found" description="Meetings appear here once mentors record them." />
        )}
      </Card>
    </>
  );
}
