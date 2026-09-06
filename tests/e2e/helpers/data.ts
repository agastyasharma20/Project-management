import { e2eClient } from "./auth";

/** Finds one approved, active team + its mentor's and a member's email from the seeded data. */
export async function pickApprovedTeamWithMentor() {
  const team = await e2eClient().team.findFirstOrThrow({
    where: { registrationStatus: "APPROVED", status: { not: "ARCHIVED" }, mentorUserId: { not: null } },
    include: {
      mentor: { select: { email: true } },
      members: {
        where: { removedAt: null },
        take: 1,
        select: { student: { select: { user: { select: { email: true } } } } },
      },
    },
  });
  if (!team.mentor) throw new Error("Seeded team has no mentor — check prisma/seed.ts");
  const memberEmail = team.members[0]?.student.user.email;
  if (!memberEmail) throw new Error("Seeded team has no members — check prisma/seed.ts");
  return { teamId: team.id, teamCode: team.teamId!, mentorEmail: team.mentor.email, memberEmail };
}
