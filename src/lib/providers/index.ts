import { mockImage, mockVideo } from "./mock";
import { placeholderPng } from "@/lib/media/placeholder";
import { ROSTER_BY_CODE } from "@/lib/talent/roster";
import { openaiImage } from "./openai";
import { higgsfieldVideo } from "./higgsfield";
import { ProviderError, type ImageProvider, type VideoProvider } from "./types";

export type ImageMode = "mock" | "openai" | "unavailable";
export interface ImageResolution { provider: ImageProvider; mode: ImageMode; reason: string | null }

/** Still-image provider selection. Never silently substitutes a mock for a configured real provider (identity-critical). */
export function resolveImageProvider(env: NodeJS.ProcessEnv = process.env): ImageResolution {
  const want = env.IMAGE_PROVIDER ?? "mock";
  if (want === "openai") {
    if (env.OPENAI_API_KEY) return { provider: openaiImage(env.OPENAI_API_KEY, env.OPENAI_IMAGE_MODEL || undefined), mode: "openai", reason: null };
    const reason = "IMAGE_PROVIDER=openai but OPENAI_API_KEY is not set";
    return { mode: "unavailable", reason, provider: { name: "openai", model: env.OPENAI_IMAGE_MODEL || "gpt-image-1", async generate() { throw new ProviderError("openai", reason, false, "provider_unavailable"); } } };
  }
  if (want === "mock-png") {
    // Dev/demo: still provider "mock", but returns a real placeholder PNG so storage/inspection/UI paths run end to end.
    return { mode: "mock", reason: null, provider: { name: "mock", model: "mock-png-1", async generate(req) {
      return { provider: "mock", model: "mock-png-1", bytes: placeholderPng(ROSTER_BY_CODE[req.talent].color, req.shotN), mime: "image/png", costUsd: 0, credits: 0, externalId: null, metadata: { mock: true, placeholder: true } };
    } } };
  }
  return { provider: mockImage, mode: "mock", reason: null };
}
export const getImageProvider = (): ImageProvider => resolveImageProvider().provider;

export function getVideoProvider(): VideoProvider {
  if (process.env.VIDEO_PROVIDER === "higgsfield" && process.env.HIGGSFIELD_API_KEY) return higgsfieldVideo(process.env.HIGGSFIELD_API_KEY);
  return mockVideo;
}
export function providerStatus() {
  const img = resolveImageProvider();
  return {
    image: { configured: process.env.IMAGE_PROVIDER ?? "mock", live: img.mode === "openai", mode: img.mode, reason: img.reason, envNeeded: "OPENAI_API_KEY" },
    video: { configured: process.env.VIDEO_PROVIDER ?? "mock", live: false, envNeeded: "HIGGSFIELD_API_KEY" },
  };
}
