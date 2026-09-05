import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePrincipal } from "@/lib/auth/session";
import { guard } from "@/lib/auth/page-guard";

import { judgeTeamView } from "@/lib/services/evaluation";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { MarksForm } from "./marks-form";

export default async function JudgeTeamPage({ params }: { params: Promise<{ code: string }> }) {
  const principal = await requirePrincipal();
  const denied = guard(principal, ["marks.enter"]);
  if (denied) return denied;
  const { code } = await params;

  let view: Awaited<ReturnType<typeof judgeTeamView>>;
  try {
    view = await judgeTeamView(principal, decodeURIComponent(code));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Team not available.";
    redirect(`/judge?error=${encodeURIComponent(message)}`);
  }

  const { team, slots } = view;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        breadcrumb={
          <Link href="/judge" className="hover:underline">
            Evaluate
          </Link>
        }
        title={team.teamId ?? team.projectTitle}
        description={team.projectTitle}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone="brand">{team.projectType.name}</Badge>
        <Badge>
          {team.department.code}
          {team.section ? `-${team.section.name}` : ""} · Semester {team.semester.number}
        </Badge>
        <Badge>Mentor: {team.mentor?.name ?? "—"}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Project" />
          <CardBody className="whitespace-pre-wrap text-[13px]">{team.projectDescription}</CardBody>
        </Card>

        <Card>
          <CardHeader title="Team members" />
          <CardBody>
            <ul className="space-y-1 text-[13px]">
              {team.members.map((m) => (
                <li key={m.id} className="flex justify-between gap-3">
                  <span>{m.student.user.name}</span>
                  <span className="text-[var(--color-muted)]">
                    {m.student.enrollmentNo}
                    {m.isLead ? " · Lead" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Resources" description="Links published by the team" />
        {team.resources.length ? (
          <ul className="divide-y divide-[var(--color-line)]">
            {team.resources.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium">{r.title}</span>
                  <span className="block text-[12px] text-[var(--color-muted)]">{r.category.name}</span>
                </span>
                {r.url ? (
                  <a
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="shrink-0 text-[13px] text-[var(--color-brand-600)] underline"
                  >
                    Open
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="No resources published" />
        )}
      </Card>

      <div className="mt-4 space-y-4">
        {slots.length ? (
          slots.map((slot) => {
            const scheme = slot.presentation.scheme;
            const submission = slot.submissions[0];
            return (
              <Card key={slot.id}>
                <CardHeader
                  title={slot.presentation.name}
                  description={`${formatDate(slot.presentation.scheduledOn)}${
                    slot.venue ? ` · ${slot.venue}` : slot.presentation.venue ? ` · ${slot.presentation.venue}` : ""
                  }`}
                  action={<StatusBadge status={submission?.status ?? "DRAFT"} />}
                />
                {scheme ? (
                  <MarksForm
                    presentationTeamId={slot.id}
                    schemeName={scheme.name}
                    totalMarks={scheme.totalMarks}
                    criteria={scheme.criteria.map((c) => ({
                      id: c.id,
                      label: c.label,
                      description: c.description,
                      maxMarks: c.maxMarks,
                    }))}
                    existing={
                      submission
                        ? {
                            status: submission.status,
                            remarks: submission.remarks,
                            marks: Object.fromEntries(submission.marks.map((m) => [m.criterionId, m.value])),
                          }
                        : null
                    }
                  />
                ) : (
                  <EmptyState
                    title="No marking scheme attached"
                    description="An administrator must attach a marking scheme to this presentation."
                  />
                )}
              </Card>
            );
          })
        ) : (
          <Card>
            <EmptyState title="No presentation scheduled for this team" />
          </Card>
        )}
      </div>
    </div>
  );
}
