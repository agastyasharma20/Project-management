#!/usr/bin/env node
/**
 * Prepares a dedicated e2e database (never the developer's local dev.db),
 * seeds it, then starts the Next.js dev server on it. Playwright's
 * `webServer` config runs this once before the e2e suite and reuses the
 * process across the whole run.
 */
import { execSync, spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TMP_DIR = path.join(ROOT, "tests/e2e/.tmp");
const DB_PATH = path.join(TMP_DIR, "e2e.db");

rmSync(TMP_DIR, { recursive: true, force: true });
mkdirSync(path.join(TMP_DIR, "storage"), { recursive: true });

const env = {
  ...process.env,
  DATABASE_URL: `file:${DB_PATH}`,
  AUTH_SECRET: "e2e-only-secret-not-for-production-use-32b",
  COOKIE_SECURE: "false",
  STORAGE_DRIVER: "LOCAL",
  STORAGE_LOCAL_DIR: path.join(TMP_DIR, "storage"),
  STORAGE_PUBLIC_BASE: "/api/files",
  SEED_PASSWORD: "E2e@12345",
};

console.log("[e2e] provisioning schema...");
// No --force-reset: DB_PATH does not exist yet, so there is nothing to reset.
execSync("npx prisma db push --skip-generate", { cwd: ROOT, stdio: "inherit", env });

console.log("[e2e] seeding demo data...");
execSync("npx tsx prisma/seed.ts", { cwd: ROOT, stdio: "inherit", env: { ...env, SEED_FORCE: "1" } });

console.log("[e2e] starting dev server on :3100...");
const server = spawn("npx", ["next", "dev", "-p", "3100"], { cwd: ROOT, stdio: "inherit", env });
server.on("exit", (code) => process.exit(code ?? 0));
