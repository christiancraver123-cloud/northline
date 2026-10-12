import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["@supabase/supabase-js"],
  outputFileTracingRoot: process.cwd(),
  // Image imports go through server actions; allow one image up to the 10 MB limit (plus form overhead).
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
};
export default config;
