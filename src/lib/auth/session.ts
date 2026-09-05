import { createHash, randomBytes, timingSafeEqual, createHmac } from "node:crypto";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type { Role } from "@/lib/domain/constants";
import type { Principal } from "@/lib/auth/rbac";

const COOKIE_NAME = "piemr_session";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Cookie value is `<token>.<hmac>` so a tampered cookie is rejected before any DB hit. */
function sign(token: string): string {
  return createHmac("sha256", env().AUTH_SECRET).update(token).digest("hex");
}

function unpack(raw: string): string | null {
  const [token, mac] = raw.split(".");
  if (!token || !mac) return null;
  const expected = sign(token);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return token;
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const ttlMs = env().SESSION_TTL_HOURS * 60 * 60 * 1000;
  const hdrs = await headers();

  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ttlMs),
      ipAddress: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: hdrs.get("user-agent")?.slice(0, 300) ?? null,
    },
  });

  const store = await cookies();
  store.set(COOKIE_NAME, `${token}.${sign(token)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().COOKIE_SECURE,
    path: "/",
    maxAge: Math.floor(ttlMs / 1000),
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (raw) {
    const token = unpack(raw);
    if (token) {
      await db.session.updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }
  store.delete(COOKIE_NAME);
}

/**
 * Resolves the signed-in principal, or null. Memoised per request so the
 * dozens of authorisation checks in a single render cost one query.
 */
export const getPrincipal = cache(async (): Promise<Principal | null> => {
  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const token = unpack(raw);
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          roles: true,
          studentProfile: { select: { id: true, departmentId: true } },
          facultyProfile: { select: { id: true, departmentId: true } },
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (!session.user.isActive) return null;

  const user = session.user;
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    roles: user.roles.map((r) => r.role as Role),
    departmentIds: user.roles
      .filter((r) => r.departmentId)
      .map((r) => r.departmentId as string),
    homeDepartmentId:
      user.facultyProfile?.departmentId ?? user.studentProfile?.departmentId ?? null,
    studentProfileId: user.studentProfile?.id ?? null,
    facultyProfileId: user.facultyProfile?.id ?? null,
  };
});

export class AuthenticationError extends Error {
  readonly status = 401;
  constructor(message = "You must sign in to continue.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

/** Use in every server action / route handler that requires a signed-in user. */
export async function requirePrincipal(): Promise<Principal> {
  const principal = await getPrincipal();
  if (!principal) throw new AuthenticationError();
  return principal;
}

export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const hdrs = await headers();
  return {
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: hdrs.get("user-agent")?.slice(0, 300) ?? null,
  };
}
