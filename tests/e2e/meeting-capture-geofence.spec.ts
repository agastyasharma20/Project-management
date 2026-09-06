import { expect, test } from "@playwright/test";
import { closeE2eClient, COOKIE_NAME, sessionCookieFor } from "./helpers/auth";
import { pickApprovedTeamWithMentor } from "./helpers/data";

/**
 * Exercises the mobile evidence-capture flow's location step against a real
 * browser Geolocation API — mocked to specific coordinates via Playwright's
 * `context.setGeolocation`, not by stubbing application code. This proves the
 * UI reads `navigator.geolocation`, runs it through the same client-side
 * geofence check as production, and gates the "Continue to camera" step on
 * the result — the part of the workflow described in docs/ARCHITECTURE.md §5
 * that a unit test of `evaluateGeofence()` alone cannot prove is actually
 * wired into the page.
 *
 * This suite deliberately stops before the camera step: faking a MediaStream
 * device is possible with Chromium's fake-device flags, but the campus
 * location gate — the part unique to this application — is fully covered
 * without it. Camera capture itself relies on standard, browser-vendor-tested
 * `getUserMedia`/`canvas.toBlob` behaviour.
 */
const CAMPUS_ANCHOR = { latitude: 22.719568, longitude: 75.857726 };
const FAR_AWAY = { latitude: 22.9, longitude: 76.0 };

test.describe("meeting evidence capture — location gate", () => {
  test.beforeEach(async ({ context }) => {
    await context.grantPermissions(["geolocation"]);
  });

  test.afterAll(async () => {
    await closeE2eClient();
  });

  test("shows the location as verified and unlocks the camera step when inside the campus geofence", async ({ page, context }) => {
    await context.setGeolocation({ ...CAMPUS_ANCHOR, accuracy: 8 });
    const { teamId, mentorEmail } = await pickApprovedTeamWithMentor();
    const cookie = await sessionCookieFor(mentorEmail);
    await context.addCookies([{ name: COOKIE_NAME, value: cookie, domain: "localhost", path: "/" }]);

    await page.goto(`/meetings/record/${teamId}`);

    await expect(page.getByText("inside campus")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("button", { name: "Continue to camera" })).toBeVisible();
  });

  test("blocks the camera step and explains why when the device is outside the campus geofence", async ({
    page,
    context,
  }) => {
    await context.setGeolocation({ ...FAR_AWAY, accuracy: 8 });
    const { teamId, mentorEmail } = await pickApprovedTeamWithMentor();
    const cookie = await sessionCookieFor(mentorEmail);
    await context.addCookies([{ name: COOKIE_NAME, value: cookie, domain: "localhost", path: "/" }]);

    await page.goto(`/meetings/record/${teamId}`);

    await expect(page.getByText("Location verification failed")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Allowed radius: 80m/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue to camera" })).toHaveCount(0);
  });

  test("a student — who has no meeting.record permission at all — is denied before any team data loads", async ({
    page,
    context,
  }) => {
    await context.setGeolocation({ ...CAMPUS_ANCHOR, accuracy: 8 });
    const { teamId } = await pickApprovedTeamWithMentor();
    const cookie = await sessionCookieFor("student1@seed.piemr.edu.in");
    await context.addCookies([{ name: COOKIE_NAME, value: cookie, domain: "localhost", path: "/" }]);

    const response = await page.goto(`/meetings/record/${teamId}`);
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByText("Permission denied")).toBeVisible();
  });

  test("a faculty mentor who is not assigned to this specific team gets a not-found, not someone else's data", async ({
    page,
    context,
  }) => {
    await context.setGeolocation({ ...CAMPUS_ANCHOR, accuracy: 8 });
    const { teamId, mentorEmail } = await pickApprovedTeamWithMentor();

    // Any other mentor holds meeting.record generally, but not for this team.
    const cookie = await sessionCookieFor(
      mentorEmail === "faculty1.cse@seed.piemr.edu.in" ? "faculty2.cse@seed.piemr.edu.in" : "faculty1.cse@seed.piemr.edu.in",
    );
    await context.addCookies([{ name: COOKIE_NAME, value: cookie, domain: "localhost", path: "/" }]);

    const response = await page.goto(`/meetings/record/${teamId}`);
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByText("Not found")).toBeVisible();
  });
});
