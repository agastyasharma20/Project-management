import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";

describe("env — footer credit fields", () => {
  it("are undefined by default — nothing personal is baked in unless explicitly configured", () => {
    // tests/global-setup.ts deliberately does not set any CREDIT_* var, so
    // this proves the "no PII hardcoded, opt-in only" claim holds at
    // runtime, not just by reading the source.
    const e = env();
    expect(e.CREDIT_NAME_1).toBeUndefined();
    expect(e.CREDIT_TITLE_1).toBeUndefined();
    expect(e.CREDIT_EMAIL_1).toBeUndefined();
    expect(e.CREDIT_NAME_2).toBeUndefined();
    expect(e.CREDIT_EMAIL_2).toBeUndefined();
    expect(e.CREDIT_LINKEDIN_2).toBeUndefined();
  });
});
