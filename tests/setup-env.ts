import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { vi } from "vitest";

// Defensive fallback for the env vars written by tests/global-setup.ts — read
// from disk in case this worker did not inherit process.env from the setup
// process (see the comment in global-setup.ts).
const ENV_FILE = path.resolve(__dirname, ".tmp/env.json");
if (existsSync(ENV_FILE)) {
  const vars = JSON.parse(readFileSync(ENV_FILE, "utf8")) as Record<string, string>;
  for (const [key, value] of Object.entries(vars)) {
    if (!process.env[key]) process.env[key] = value;
  }
}

/**
 * `next/headers` requires an active Next.js request context and throws
 * outside of one. The service layer only ever touches it indirectly, via
 * `requestMeta()` in `src/lib/auth/session.ts` (used by the audit logger to
 * capture IP/user-agent). We stand in for it here so services can be
 * exercised directly against the test database, the same way route handlers
 * and server actions call them — just without a real HTTP request wrapping
 * the call.
 */
vi.mock("next/headers", () => ({
  headers: async () => ({ get: (_key: string) => null }),
  cookies: async () => ({
    get: (_key: string) => undefined,
    set: () => undefined,
    delete: () => undefined,
  }),
}));
