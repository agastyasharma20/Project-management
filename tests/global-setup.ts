import { execSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Runs once before the whole test run, in the main Vitest process — before
 * any test worker exists.
 *
 * It provisions a throwaway SQLite database from the real Prisma schema (the
 * same schema the application ships with, never a hand-maintained fixture
 * schema that can drift) and writes the env vars every test worker needs into
 * a JSON file. tests/setup-env.ts reads that file in every worker. Doing it
 * via a file — rather than relying solely on child-process env inheritance —
 * means the tests do not depend on how Vitest happens to fork its workers.
 */
const TMP_DIR = path.resolve(__dirname, ".tmp");
const DB_PATH = path.join(TMP_DIR, "test.db");
const ENV_FILE = path.join(TMP_DIR, "env.json");

export default async function globalSetup() {
  rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(TMP_DIR, { recursive: true });
  mkdirSync(path.join(TMP_DIR, "storage"), { recursive: true });

  const databaseUrl = `file:${DB_PATH}`;

  writeFileSync(
    ENV_FILE,
    JSON.stringify({
      DATABASE_URL: databaseUrl,
      AUTH_SECRET: "test-only-secret-not-for-production-use-32b",
      SESSION_TTL_HOURS: "12",
      COOKIE_SECURE: "false",
      STORAGE_DRIVER: "LOCAL",
      STORAGE_LOCAL_DIR: path.join(TMP_DIR, "storage"),
      STORAGE_PUBLIC_BASE: "/api/files",
      SEED_PASSWORD: "Test@12345",
    }),
    "utf8",
  );

  // Also export into this process's env, so pool workers that inherit env at
  // fork time (the common case) get it without reading the file at all.
  process.env.DATABASE_URL = databaseUrl;

  // No --force-reset: the directory above was just deleted and recreated, so
  // the SQLite file does not exist yet and there is nothing to reset. Prisma
  // treats a missing database as "create fresh", which is exactly what we
  // want for a throwaway test database.
  execSync("npx prisma db push --skip-generate", {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
}
