import type { NextConfig } from "next";

const config: NextConfig = {
  devIndicators: false, // the operator runs the app in dev mode on the Mac; hide the Next.js badge
  serverExternalPackages: ["@supabase/supabase-js"],
  outputFileTracingRoot: process.cwd(),
  // Image imports go through server actions; allow one image up to the 10 MB limit (plus form overhead).
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  // Phone access in development (scripts/mac/Start Northline for phone.command sets NORTHLINE_LAN_HOSTS to this Mac's addresses).
  allowedDevOrigins: (process.env.NORTHLINE_LAN_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean),
};
export default config;
