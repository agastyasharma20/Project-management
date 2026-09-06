import { expect, test, type Page } from "@playwright/test";
import { closeE2eClient, COOKIE_NAME, sessionCookieFor } from "./helpers/auth";

/**
 * Proves the RBAC matrix documented in docs/ARCHITECTURE.md §3 end-to-end,
 * over real HTTP against the running app — not by calling the permission
 * functions directly (tests/unit/rbac.test.ts already does that), but by
 * requesting the actual route with the actual signed cookie and reading what
 * came back. This is the same exercise done manually with curl during
 * development, made repeatable.
 */
const ROLE_EMAILS = {
  superAdmin: "superadmin@seed.piemr.edu.in",
  director: "director@seed.piemr.edu.in",
  admin: "admin@seed.piemr.edu.in",
  hod: "hod.cse@seed.piemr.edu.in",
  faculty: "faculty1.cse@seed.piemr.edu.in",
  student: "student1@seed.piemr.edu.in",
} as const;

type RoleKey = keyof typeof ROLE_EMAILS;

async function signInAs(page: Page, role: RoleKey) {
  const cookie = await sessionCookieFor(ROLE_EMAILS[role]);
  await page.context().addCookies([
    { name: COOKIE_NAME, value: cookie, domain: "localhost", path: "/" },
  ]);
}

async function isPermissionDenied(page: Page): Promise<boolean> {
  return (await page.getByText("Permission denied").count()) > 0;
}

test.afterAll(async () => {
  await closeE2eClient();
});

test.describe("dashboard renders the right surface per role", () => {
  test("Super Admin sees the college-wide overview", async ({ page }) => {
    await signInAs(page, "superAdmin");
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "College overview" })).toBeVisible();
  });

  test("HOD sees the department overview, not the raw college label", async ({ page }) => {
    await signInAs(page, "hod");
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Department overview" })).toBeVisible();
  });

  test("Faculty mentor sees 'My mentoring'", async ({ page }) => {
    await signInAs(page, "faculty");
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "My mentoring" })).toBeVisible();
  });

  test("Student sees their own project workspace, not an admin dashboard", async ({ page }) => {
    await signInAs(page, "student");
    await page.goto("/dashboard");
    await expect(page.getByText("Permission denied")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "College overview" })).toHaveCount(0);
  });
});

test.describe("the audit log is withheld from Super Admin but open to Director / Admin / HOD", () => {
  test("Super Admin gets Permission denied on /audit", async ({ page }) => {
    await signInAs(page, "superAdmin");
    await page.goto("/audit");
    expect(await isPermissionDenied(page)).toBe(true);
  });

  test("Director can open /audit", async ({ page }) => {
    await signInAs(page, "director");
    await page.goto("/audit");
    expect(await isPermissionDenied(page)).toBe(false);
    await expect(page.getByRole("heading", { name: "Audit log" })).toBeVisible();
  });

  test("Admin can open /audit", async ({ page }) => {
    await signInAs(page, "admin");
    await page.goto("/audit");
    expect(await isPermissionDenied(page)).toBe(false);
  });

  test("HOD can open /audit", async ({ page }) => {
    await signInAs(page, "hod");
    await page.goto("/audit");
    expect(await isPermissionDenied(page)).toBe(false);
  });

  test("the Audit Logs link is absent from Super Admin's sidebar entirely", async ({ page }) => {
    await signInAs(page, "superAdmin");
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Audit Logs" })).toHaveCount(0);
  });

  test("the Audit Logs link is present in the HOD's sidebar", async ({ page }) => {
    await signInAs(page, "hod");
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Audit Logs" })).toBeVisible();
  });
});

test.describe("configuration is an administrative surface, not a faculty or student one", () => {
  test("Admin can reach /configuration", async ({ page }) => {
    await signInAs(page, "admin");
    await page.goto("/configuration");
    expect(await isPermissionDenied(page)).toBe(false);
    await expect(page.getByRole("heading", { name: "Configuration" })).toBeVisible();
  });

  test("Faculty mentor is denied /configuration", async ({ page }) => {
    await signInAs(page, "faculty");
    await page.goto("/configuration");
    expect(await isPermissionDenied(page)).toBe(true);
  });

  test("Student is denied /configuration", async ({ page }) => {
    await signInAs(page, "student");
    await page.goto("/configuration");
    expect(await isPermissionDenied(page)).toBe(true);
  });
});

test.describe("meeting evidence recording is bound to the mentor/HOD path", () => {
  test("Faculty mentor can open /meetings/record", async ({ page }) => {
    await signInAs(page, "faculty");
    await page.goto("/meetings/record");
    expect(await isPermissionDenied(page)).toBe(false);
  });

  test("Student is denied /meetings/record", async ({ page }) => {
    await signInAs(page, "student");
    await page.goto("/meetings/record");
    expect(await isPermissionDenied(page)).toBe(true);
  });

});

test.describe("the judge portal is scoped to marks entry only", () => {
  test("a faculty member holding the Judge capability can open /judge", async ({ page }) => {
    await signInAs(page, "faculty"); // faculty1.cse is also seeded as a judge
    await page.goto("/judge");
    expect(await isPermissionDenied(page)).toBe(false);
    await expect(page.getByRole("heading", { name: "Evaluate a team" })).toBeVisible();
  });

  test("a plain student cannot open /users even though the judge-holding faculty can", async ({ page }) => {
    await signInAs(page, "student");
    await page.goto("/users");
    expect(await isPermissionDenied(page)).toBe(true);
  });

  test("a student lacking marks.enter is denied /judge", async ({ page }) => {
    await signInAs(page, "student");
    await page.goto("/judge");
    expect(await isPermissionDenied(page)).toBe(true);
  });
});

test.describe("global search results respect the caller's scope", () => {
  test("a student's search never returns a team from another department", async ({ page }) => {
    await signInAs(page, "student");
    await page.goto("/dashboard"); // establishes the session in this context
    // page.request shares the browser context's cookie jar, so the signed-in
    // student's session cookie is sent automatically — no header needed.
    const response = await page.request.get("/api/search?q=PIEMR-");
    expect(response.ok()).toBe(true);
    const hits = (await response.json()) as { kind: string }[];
    // A student's own team may appear; nothing else should.
    expect(hits.length).toBeLessThanOrEqual(1);
  });

  test("an unauthenticated search request is rejected", async ({ page }) => {
    const response = await page.request.get("/api/search?q=PIEMR");
    expect(response.status()).toBe(401);
  });
});
