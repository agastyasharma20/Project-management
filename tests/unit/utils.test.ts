import { describe, expect, it } from "vitest";
import { formatPct, initials, pageFrom, param, relativeDays } from "@/lib/utils";
import { healthBand } from "@/lib/domain/constants";

describe("param", () => {
  it("returns a single string value as-is", () => {
    expect(param({ q: "hello" }, "q")).toBe("hello");
  });

  it("takes the first entry of an array param", () => {
    expect(param({ q: ["first", "second"] }, "q")).toBe("first");
  });

  it("returns undefined for a missing or empty value", () => {
    expect(param({}, "q")).toBeUndefined();
    expect(param({ q: "" }, "q")).toBeUndefined();
  });
});

describe("pageFrom", () => {
  it("defaults to page 1 with no offset", () => {
    expect(pageFrom({}, 25)).toEqual({ page: 1, skip: 0, take: 25 });
  });

  it("computes the correct skip for a later page", () => {
    expect(pageFrom({ page: "3" }, 25)).toEqual({ page: 3, skip: 50, take: 25 });
  });

  it("never produces a page below 1 for garbage input", () => {
    expect(pageFrom({ page: "-5" }, 25).page).toBe(1);
    expect(pageFrom({ page: "not-a-number" }, 25).page).toBe(1);
    expect(pageFrom({ page: "0" }, 25).page).toBe(1);
  });
});

describe("formatPct", () => {
  it("formats a number to the requested decimal places with a % sign", () => {
    expect(formatPct(87.456, 1)).toBe("87.5%");
    expect(formatPct(87.456, 0)).toBe("87%");
  });

  it("renders null/undefined/NaN as an em dash, never '0%' or 'NaN%'", () => {
    expect(formatPct(null)).toBe("—");
    expect(formatPct(undefined)).toBe("—");
    expect(formatPct(Number.NaN)).toBe("—");
  });
});

describe("relativeDays", () => {
  it("labels today and yesterday specially", () => {
    expect(relativeDays(new Date())).toBe("today");
    expect(relativeDays(new Date(Date.now() - 25 * 60 * 60 * 1000))).toBe("yesterday");
  });

  it("counts whole days for older dates", () => {
    expect(relativeDays(new Date(Date.now() - 5 * 86_400_000))).toBe("5 days ago");
  });

  it("reports 'never' for a null date", () => {
    expect(relativeDays(null)).toBe("never");
  });
});

describe("initials", () => {
  it("takes the first letter of up to two words", () => {
    expect(initials("Jordan Lee")).toBe("JL");
    expect(initials("Madonna")).toBe("M");
    expect(initials("Dr. A B Verma")).toBe("DA");
  });

  it("handles extra whitespace gracefully", () => {
    expect(initials("  Multi   Space  Name ")).toBe("MS");
  });
});

describe("healthBand", () => {
  it("maps scores to the documented bands with inclusive lower bounds", () => {
    expect(healthBand(100).label).toBe("Excellent");
    expect(healthBand(90).label).toBe("Excellent");
    expect(healthBand(89).label).toBe("Healthy");
    expect(healthBand(75).label).toBe("Healthy");
    expect(healthBand(74).label).toBe("Needs Attention");
    expect(healthBand(50).label).toBe("Needs Attention");
    expect(healthBand(49).label).toBe("At Risk");
    expect(healthBand(0).label).toBe("At Risk");
  });
});
