import { defineConfig } from "@playwright/test";

/**
 * End-to-end smoke suite. Runs against a real, seeded Next.js server rather
 * than mocking the framework — the thing that actually matters here (a
 * mentor's role denying them /configuration, a student's session cookie
 * granting access to /my-team) can only be proven true by an HTTP round trip.
 *
 * `webServer` builds and starts the app against a dedicated e2e database
 * (tests/e2e/.tmp/e2e.db) seeded once before the run, so this suite never
 * touches your local dev.db.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  // Generous: the first hit to a cold Next dev server compiles the route,
  // its server action, and every transitive import (Prisma, bcrypt, sharp,
  // recharts for the dashboard) on demand. That is a one-time cost specific
  // to dev mode, not a symptom of a slow app — a production build serves
  // instantly. Raised here rather than per-assertion so no test in the file
  // execution order is penalised for happening to go first.
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    // This environment pre-installs a single Chromium build and points
    // PLAYWRIGHT_BROWSERS_PATH at it; Playwright's default headless-shell
    // binary is not present, so launch the real browser explicitly.
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : undefined,
  },
  webServer: {
    command: "npm run test:e2e:serve",
    url: "http://localhost:3100/login",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
