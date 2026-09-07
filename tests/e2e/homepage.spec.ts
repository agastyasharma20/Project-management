import { expect, test } from "@playwright/test";
import { closeE2eClient, COOKIE_NAME, sessionCookieFor } from "./helpers/auth";

/**
 * The public landing page — no session required. Distinct from login.spec.ts,
 * which proves the auth form itself.
 */
test.describe("homepage", () => {
  test.afterAll(async () => {
    await closeE2eClient();
  });

  test("is reachable without signing in and explains what the platform is", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "What this is" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Register your team" }).first()).toBeVisible();
  });

  test("footer names no individual by default — the credit line is env-configured, never hardcoded", async ({ page }) => {
    // No CREDIT_* env vars are set for the e2e server (tests/e2e/serve.mjs
    // deliberately doesn't set them), so this proves the generic fallback
    // renders and confirms nothing personal ships in source by default.
    await page.goto("/");
    await expect(page.getByText("Project Intelligence & Management Platform").last()).toBeVisible();
    await expect(page.getByText("Designed & Developed by:")).toHaveCount(0);
  });

  test("shows 'Go to Dashboard' instead of sign-in links for an authenticated visitor", async ({ page, context }) => {
    const cookie = await sessionCookieFor("superadmin@seed.piemr.edu.in");
    await context.addCookies([{ name: COOKIE_NAME, value: cookie, domain: "localhost", path: "/" }]);

    await page.goto("/");
    await expect(page.getByRole("link", { name: "Go to Dashboard" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  });
});
