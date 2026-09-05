"use client";

import { useActionState, useState } from "react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  ErrorState,
  Field,
  Input,
  Select,
  SuccessNote,
  Table,
  Td,
  Textarea,
  Th,
} from "@/components/ui";
import {
  addMemberAction,
  archiveTeamAction,
  reassignMentorAction,
  removeMemberAction,
  updateTeamAction,
  type ActionState,
} from "./actions";

interface Option {
  value: string;
  label: string;
}

const IDLE: ActionState = { status: "idle" };

function Feedback({ state }: { state: ActionState }) {
  if (state.status === "error") return <ErrorState title="Could not save" description={state.message} />;
  if (state.status === "success") return <SuccessNote>{state.message}</SuccessNote>;
  return null;
}

export function TeamAdminPanel({
  team,
  members,
  options,
}: {
  team: {
    id: string;
    projectTitle: string;
    projectDescription: string;
    sectionId: string | null;
    semesterId: string;
    projectTypeId: string;
    status: string;
    mentorUserId: string | null;
    archived: boolean;
  };
  members: { id: string; name: string; enrollmentNo: string; isLead: boolean }[];
  options: { mentors: Option[]; sections: Option[]; semesters: Option[]; projectTypes: Option[] };
}) {
  const [detailsState, saveDetails] = useActionState(updateTeamAction, IDLE);
  const [mentorState, saveMentor] = useActionState(reassignMentorAction, IDLE);
  const [addState, add] = useActionState(addMemberAction, IDLE);
  const [removeState, remove] = useActionState(removeMemberAction, IDLE);
  const [archiveState, archive] = useActionState(archiveTeamAction, IDLE);
  const [confirmArchive, setConfirmArchive] = useState(false);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Project details" description="Changes are written to the audit log." />
        <CardBody>
          <form action={saveDetails} className="space-y-4">
            <Feedback state={detailsState} />
            <input type="hidden" name="teamId" value={team.id} />

            <Field label="Project title" htmlFor="projectTitle" required>
              <Input id="projectTitle" name="projectTitle" defaultValue={team.projectTitle} required />
            </Field>
            <Field label="Project description" htmlFor="projectDescription" required>
              <Textarea
                id="projectDescription"
                name="projectDescription"
                rows={4}
                defaultValue={team.projectDescription}
                required
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Section" htmlFor="sectionId">
                <Select id="sectionId" name="sectionId" defaultValue={team.sectionId ?? ""}>
                  <option value="">Not set</option>
                  {options.sections.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Semester" htmlFor="semesterId" required>
                <Select id="semesterId" name="semesterId" defaultValue={team.semesterId}>
                  {options.semesters.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Project type" htmlFor="projectTypeId" required>
                <Select id="projectTypeId" name="projectTypeId" defaultValue={team.projectTypeId}>
                  {options.projectTypes.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Status" htmlFor="status" required>
                <Select id="status" name="status" defaultValue={team.status}>
                  {["REGISTERED", "ACTIVE", "COMPLETED", "ARCHIVED"].map((s) => (
                    <option key={s} value={s}>
                      {s.toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Button type="submit">Save changes</Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Faculty mentor" />
        <CardBody>
          <form action={saveMentor} className="flex flex-wrap items-end gap-3">
            <Feedback state={mentorState} />
            <input type="hidden" name="teamId" value={team.id} />
            <Field label="Mentor" htmlFor="mentorUserId" className="min-w-[16rem] flex-1">
              <Select id="mentorUserId" name="mentorUserId" defaultValue={team.mentorUserId ?? ""} required>
                <option value="">Select faculty…</option>
                {options.mentors.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" variant="secondary">
              Reassign
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Members" description="Maximum four students including the team lead." />
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Enrollment</Th>
              <Th>Role</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <Td className="font-medium">{m.name}</Td>
                <Td>{m.enrollmentNo}</Td>
                <Td>{m.isLead ? "Team lead" : "Member"}</Td>
                <Td className="text-right">
                  {m.isLead ? null : (
                    <form action={remove}>
                      <input type="hidden" name="teamId" value={team.id} />
                      <input type="hidden" name="memberId" value={m.id} />
                      <Button type="submit" size="sm" variant="ghost">
                        Remove
                      </Button>
                    </form>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <CardBody className="border-t border-[var(--color-line)]">
          <Feedback state={addState} />
          <Feedback state={removeState} />
          <form action={add} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="teamId" value={team.id} />
            <Field label="Add member by enrollment number" htmlFor="enrollmentNo" className="min-w-[14rem] flex-1">
              <Input id="enrollmentNo" name="enrollmentNo" placeholder="0808CS221001" required />
            </Field>
            <Button type="submit" variant="secondary">
              Add
            </Button>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={team.archived ? "Restore team" : "Archive team"}
          description="Archiving preserves all history — records are never deleted."
        />
        <CardBody className="space-y-3">
          <Feedback state={archiveState} />
          {confirmArchive ? (
            <form action={archive} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="teamId" value={team.id} />
              <input type="hidden" name="archived" value={team.archived ? "false" : "true"} />
              <p className="text-[13px]">
                {team.archived
                  ? "Restore this team to active status?"
                  : "Archive this team? It will be hidden from active listings but fully preserved."}
              </p>
              <Button type="submit" variant={team.archived ? "primary" : "danger"} size="sm">
                Yes, {team.archived ? "restore" : "archive"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmArchive(false)}>
                Cancel
              </Button>
            </form>
          ) : (
            <Button variant={team.archived ? "secondary" : "danger"} onClick={() => setConfirmArchive(true)}>
              {team.archived ? "Restore team" : "Archive team"}
            </Button>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
