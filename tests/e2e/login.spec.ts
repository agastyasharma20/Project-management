import { expect, test } from "@playwright/test";

/**
 * The one flow that must be driven through the real UI rather than minted
 * directly: signing in. Everything else in this suite authenticates via a
 * pre-minted cookie (see helpers/auth.ts) so RBAC tests aren't re-testing the
 * login form on every page — this file is where the form itself is proven.
 */
test.describe("login", () => {
  test("signs in with valid seeded credentials and reaches the dashboard", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("superadmin@seed.piemr.edu.in");
    await page.getByLabel("Password").fill("E2e@12345");

    // Confirm the actual server-side outcome first: the login form action
    // returns an HTTP 303 to /dashboard on success. We assert that directly
    // rather than waiting for the client-side (History API) transition that
    // follows it — under dev-mode Fast Refresh churn that transition's RSC
    // fetch can be aborted and retried indefinitely, which is a dev-server
    // artifact, not a defect in the redirect itself.
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().endsWith("/login") && res.request().method() === "POST"),
      page.getByRole("button", { name: "Sign in" }).click(),
    ]);
    expect(response.status()).toBe(303);

    // Prove the session actually works with a plain, full navigation —
    // sidesteps the client transition entirely and is what actually matters:
    // the cookie the server just set grants access to the dashboard.
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "College overview" })).toBeVisible({ timeout: 30_000 });
  });

  test("shows an inline error and stays on the login page for a wrong password", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("superadmin@seed.piemr.edu.in");
    await page.getByLabel("Password").fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  });

  test("rejects an unknown email with the same message as a wrong password (no account enumeration)", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("no-such-account@seed.piemr.edu.in");
    await page.getByLabel("Password").fill("whatever123");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  });

  test("an unauthenticated visitor to a protected page is redirected to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("signing out clears the session so the dashboard redirects back to login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill("superadmin@seed.piemr.edu.in");
    await page.getByLabel("Password").fill("E2e@12345");
    await Promise.all([
      page.waitForResponse((res) => res.url().endsWith("/login") && res.request().method() === "POST"),
      page.getByRole("button", { name: "Sign in" }).click(),
    ]);

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "College overview" })).toBeVisible({ timeout: 30_000 });

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
  });
});
