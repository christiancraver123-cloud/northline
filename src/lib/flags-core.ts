// Dependency-free flag readers (safe to import from provider code without import cycles). See lib/flags.ts for the full view.
type Env = Record<string, string | undefined>;
export const flagOn = (v: string | undefined) => ["on", "true", "1", "yes"].includes((v ?? "").trim().toLowerCase());
/** Paid image providers may be called only when NORTHLINE_IMAGE_GENERATION=on. Mock generation never needs it. */
export const imageGenerationEnabled = (env: Env = process.env) => flagOn(env.NORTHLINE_IMAGE_GENERATION);
export const instagramLiveRequested = (env: Env = process.env) => flagOn(env.NORTHLINE_INSTAGRAM_LIVE);
export type PublishingMode = "off" | "mock" | "live";
/** NORTHLINE_PUBLISHING=off|mock|live. Default: mock in development, off in production. */
export function publishingMode(env: Env = process.env): PublishingMode {
  const v = (env.NORTHLINE_PUBLISHING ?? "").trim().toLowerCase();
  if (v === "off" || v === "mock" || v === "live") return v;
  return env.NODE_ENV === "production" ? "off" : "mock";
}
