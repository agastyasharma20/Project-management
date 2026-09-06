import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Vitest config for unit + integration tests.
 *
 * `pool: "forks"` with `singleFork: true` and `isolate: false` runs the whole
 * suite in one process against one temporary SQLite database (created by
 * tests/global-setup.ts). This matches how the application actually behaves —
 * one Prisma client, one set of module singletons — and avoids SQLite's
 * single-writer file locking biting us if multiple workers touched the same
 * file concurrently.
 *
 * End-to-end browser tests live under tests/e2e and run separately via
 * Playwright (`npm run test:e2e`) since they need a live Next.js server.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: ["tests/e2e/**", "node_modules/**"],
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup-env.ts"],
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    isolate: false,
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/**/*.d.ts", "src/lib/services/reports.ts"],
    },
  },
});
