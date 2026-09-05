import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPrincipal } from "@/lib/auth/session";
import { storage } from "@/lib/storage";
import { teamScopeWhere } from "@/lib/services/teams";

/**
 * Authorised file delivery. Storage keys are never public URLs: every read
 * resolves the owning record first and re-checks the caller's team scope, so a
 * leaked key from one department cannot be replayed by another.
 */
export async function GET(_request: Request, context: { params: Promise<{ key: string[] }> }) {
  const principal = await getPrincipal();
  if (!principal) return new NextResponse("Unauthorized", { status: 401 });

  const { key: segments } = await context.params;
  const key = segments.join("/");

  const scope = teamScopeWhere(principal);

  const evidence = await db.meetingEvidence.findFirst({
    where: {
      OR: [{ originalKey: key }, { stampedKey: key }],
      meeting: { team: scope },
    },
    select: { id: true },
  });

  const resource = evidence
    ? null
    : await db.projectResource.findFirst({ where: { fileKey: key, team: scope }, select: { id: true } });

  if (!evidence && !resource) return new NextResponse("Not found", { status: 404 });

  const object = await storage().get(key);
  if (!object) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(new Uint8Array(object.body), {
    headers: {
      "Content-Type": object.mimeType,
      "Content-Length": String(object.body.byteLength),
      "Cache-Control": "private, max-age=3600",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
