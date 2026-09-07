import type { NextConfig } from "next";

/**
 * Security headers applied to every response. Geolocation and camera are
 * explicitly permitted for same-origin only — the platform genuinely needs
 * them for the meeting-evidence workflow — everything else is denied.
 * frame-ancestors 'none' + X-Frame-Options DENY stop the app being embedded
 * in a hostile iframe (clickjacking on login, judge marks entry, etc.).
 */
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(self), microphone=(), payment=(), usb=()" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Next.js dev/HMR and inline styles from Tailwind's runtime need these;
      // no third-party script origins are ever allowed.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["sharp", "exceljs", "@prisma/client", "bcryptjs"],
  experimental: {
    // Evidence uploads carry an original + stamped image payload.
    serverActions: { bodySizeLimit: "12mb" },
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
