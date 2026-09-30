import type { NextConfig } from "next";

const config: NextConfig = {
  serverExternalPackages: ["@supabase/supabase-js"],
  outputFileTracingRoot: process.cwd(),
};
export default config;
