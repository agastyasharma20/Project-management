import { expect, test } from "@playwright/test";

/**
 * Verifies the security headers configured in next.config.ts actually reach
 * the client — a config typo or an accidental removal of the `headers()`
 * export would silently strip these with no other test noticing.
 */
test.describe("security headers", () => {
  test("are present on the public homepage", async ({ page }) => {
    const response = await page.goto("/");
    const headers = response!.headers();

    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["content-security-policy"]).toContain("default-src 'self'");
    expect(headers["permissions-policy"]).toContain("geolocation=(self)");
    expect(headers["permissions-policy"]).toContain("camera=(self)");
  });

  test("are present on an authenticated page too, not just the public entry point", async ({ page }) => {
    const response = await page.goto("/login");
    const headers = response!.headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["content-security-policy"]).toBeTruthy();
  });
});
