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

  test("carries the required credit footer with working contact links", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Prof. Dr. Piyush Choudhary")).toBeVisible();
    await expect(page.getByText("Mr. Agastya Sharma")).toBeVisible();

    const linkedin = page.getByRole("link", { name: "Mr. Agastya Sharma" });
    await expect(linkedin).toHaveAttribute("href", "https://www.linkedin.com/in/agastya20");

    await expect(page.locator('a[href="mailto:hod_cs@piemr.edu.in"]').first()).toBeVisible();
    await expect(page.locator('a[href="mailto:work.agastya20@gmail.com"]')).toBeVisible();
  });

  test("shows 'Go to Dashboard' instead of sign-in links for an authenticated visitor", async ({ page, context }) => {
    const cookie = await sessionCookieFor("superadmin@seed.piemr.edu.in");
    await context.addCookies([{ name: COOKIE_NAME, value: cookie, domain: "localhost", path: "/" }]);

    await page.goto("/");
    await expect(page.getByRole("link", { name: "Go to Dashboard" }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  });
});
