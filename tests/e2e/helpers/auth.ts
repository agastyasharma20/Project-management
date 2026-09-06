import { createHash, createHmac, randomBytes } from "node:crypto";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * Mints a valid session cookie directly against the e2e database, mirroring
 * exactly the scheme in src/lib/auth/session.ts (SHA-256 token hash stored
 * server-side, HMAC-signed token in the cookie). This is deliberately NOT an
 * import of the app's own session module — e2e tests exercise the app only
 * over HTTP, and a hand-rolled cookie proves the real verification path in
 * session.ts works, rather than assuming it.
 *
 * Used to reach role-specific pages instantly instead of driving the login
 * form for every test — the login form itself gets its own dedicated,
 * UI-driven test in login.spec.ts.
 */
const DB_PATH = path.resolve(__dirname, "../.tmp/e2e.db");
const AUTH_SECRET = "e2e-only-secret-not-for-production-use-32b";
export const COOKIE_NAME = "piemr_session";

let client: PrismaClient | null = null;
function db(): PrismaClient {
  if (!client) client = new PrismaClient({ datasources: { db: { url: `file:${DB_PATH}` } } });
  return client;
}

export async function sessionCookieFor(email: string): Promise<string> {
  const user = await db().user.findUniqueOrThrow({ where: { email } });
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await db().session.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 3_600_000) },
  });
  const mac = createHmac("sha256", AUTH_SECRET).update(token).digest("hex");
  return `${token}.${mac}`;
}

export function e2eClient(): PrismaClient {
  return db();
}

export async function closeE2eClient(): Promise<void> {
  await client?.$disconnect();
  client = null;
}
