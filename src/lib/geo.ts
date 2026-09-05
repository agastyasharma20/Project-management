import type { AccuracyBand } from "@/lib/domain/constants";

const EARTH_RADIUS_M = 6_371_008.8;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Great-circle distance in metres between two WGS-84 coordinates.
 * Coordinates are never compared as strings anywhere in this application.
 */
export function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface GeofenceRules {
  latitude: number;
  longitude: number;
  radiusM: number;
  /** Submissions with accuracy worse than this are refused. */
  minAccuracyM: number;
  goodAccuracyM: number;
  warnAccuracyM: number;
  enforce: boolean;
}

export interface GeofenceVerdict {
  distanceM: number;
  radiusM: number;
  insideFence: boolean;
  accuracyBand: AccuracyBand;
  accuracyAcceptable: boolean;
  allowed: boolean;
  reason: string | null;
}

export function accuracyBandFor(accuracyM: number, rules: GeofenceRules): AccuracyBand {
  if (accuracyM <= rules.goodAccuracyM) return "GOOD";
  if (accuracyM <= rules.warnAccuracyM) return "WARNING";
  return "POOR";
}

/**
 * The single authority on whether a meeting capture may be submitted.
 * Called by the browser for live feedback AND re-evaluated on the server at
 * submit time with the same rules — the client verdict is never trusted.
 */
export function evaluateGeofence(
  fix: { latitude: number; longitude: number; accuracyM: number },
  rules: GeofenceRules,
): GeofenceVerdict {
  const distanceM = haversineMeters(fix, rules);
  const insideFence = distanceM <= rules.radiusM;
  const accuracyBand = accuracyBandFor(fix.accuracyM, rules);
  const accuracyAcceptable = fix.accuracyM <= rules.minAccuracyM;

  let reason: string | null = null;
  if (!accuracyAcceptable) {
    reason = `GPS accuracy is ±${Math.round(fix.accuracyM)}m. The campus policy requires ±${Math.round(
      rules.minAccuracyM,
    )}m or better. Move outdoors and wait for the signal to settle.`;
  } else if (!insideFence) {
    reason = `You appear to be outside the permitted project-meeting area. Distance from campus: ${Math.round(
      distanceM,
    )}m. Allowed radius: ${Math.round(rules.radiusM)}m.`;
  }

  const allowed = rules.enforce ? insideFence && accuracyAcceptable : true;
  return { distanceM, radiusM: rules.radiusM, insideFence, accuracyBand, accuracyAcceptable, allowed, reason };
}
