import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["sharp", "exceljs", "@prisma/client", "bcryptjs"],
  experimental: {
    // Evidence uploads carry an original + stamped image payload.
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
