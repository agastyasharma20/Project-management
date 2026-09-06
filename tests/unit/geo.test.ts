import { describe, expect, it } from "vitest";
import { accuracyBandFor, evaluateGeofence, haversineMeters, type GeofenceRules } from "@/lib/geo";

const CAMPUS: GeofenceRules = {
  latitude: 22.719568,
  longitude: 75.857726,
  radiusM: 80,
  minAccuracyM: 50,
  goodAccuracyM: 20,
  warnAccuracyM: 50,
  enforce: true,
};

describe("haversineMeters", () => {
  it("returns 0 for identical coordinates", () => {
    expect(haversineMeters(CAMPUS, CAMPUS)).toBeCloseTo(0, 3);
  });

  it("matches the well-known ~111.2km per degree of latitude", () => {
    const distance = haversineMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 });
    expect(distance).toBeGreaterThan(110_000);
    expect(distance).toBeLessThan(112_000);
  });

  it("is symmetric", () => {
    const a = { latitude: 22.7196, longitude: 75.8577 };
    const b = { latitude: 22.7300, longitude: 75.8700 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 6);
  });
});

describe("accuracyBandFor", () => {
  it("classifies GOOD / WARNING / POOR at the configured thresholds", () => {
    expect(accuracyBandFor(5, CAMPUS)).toBe("GOOD");
    expect(accuracyBandFor(20, CAMPUS)).toBe("GOOD"); // inclusive boundary
    expect(accuracyBandFor(21, CAMPUS)).toBe("WARNING");
    expect(accuracyBandFor(50, CAMPUS)).toBe("WARNING"); // inclusive boundary
    expect(accuracyBandFor(51, CAMPUS)).toBe("POOR");
  });
});

describe("evaluateGeofence", () => {
  it("allows a submission inside the fence with good accuracy", () => {
    const verdict = evaluateGeofence({ latitude: 22.719600, longitude: 75.857800, accuracyM: 8 }, CAMPUS);
    expect(verdict.insideFence).toBe(true);
    expect(verdict.accuracyAcceptable).toBe(true);
    expect(verdict.allowed).toBe(true);
    expect(verdict.reason).toBeNull();
    expect(verdict.accuracyBand).toBe("GOOD");
  });

  it("refuses a submission outside the radius and reports the distance", () => {
    const verdict = evaluateGeofence({ latitude: 22.730000, longitude: 75.870000, accuracyM: 8 }, CAMPUS);
    expect(verdict.insideFence).toBe(false);
    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain("outside the permitted project-meeting area");
    expect(verdict.reason).toContain(`${Math.round(verdict.distanceM)}m`);
  });

  it("refuses a submission with unacceptable GPS accuracy even if physically inside the fence", () => {
    const verdict = evaluateGeofence({ latitude: 22.719600, longitude: 75.857800, accuracyM: 120 }, CAMPUS);
    expect(verdict.insideFence).toBe(true); // physically inside
    expect(verdict.accuracyAcceptable).toBe(false);
    expect(verdict.allowed).toBe(false); // still refused
    expect(verdict.reason).toContain("GPS accuracy");
  });

  it("prioritises the accuracy reason over the distance reason when both fail", () => {
    const verdict = evaluateGeofence({ latitude: 22.900000, longitude: 76.000000, accuracyM: 200 }, CAMPUS);
    expect(verdict.reason).toContain("GPS accuracy");
  });

  it("allows everything when enforcement is turned off, regardless of distance", () => {
    const relaxed: GeofenceRules = { ...CAMPUS, enforce: false };
    const verdict = evaluateGeofence({ latitude: 0, longitude: 0, accuracyM: 500 }, relaxed);
    expect(verdict.insideFence).toBe(false);
    expect(verdict.allowed).toBe(true);
  });

  it("never compares coordinates as strings — a boundary distance case resolves numerically", () => {
    // A point exactly on the radius boundary should be treated consistently
    // regardless of floating point formatting.
    const rules: GeofenceRules = { ...CAMPUS, radiusM: 100 };
    const point = { latitude: 22.720400, longitude: 75.858500, accuracyM: 5 };
    const verdict = evaluateGeofence(point, rules);
    expect(verdict.distanceM).toBeGreaterThan(0);
    expect(typeof verdict.distanceM).toBe("number");
    expect(verdict.insideFence).toBe(verdict.distanceM <= rules.radiusM);
  });
});
