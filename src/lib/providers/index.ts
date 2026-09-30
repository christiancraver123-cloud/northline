import { mockImage, mockVideo } from "./mock";
import { openaiImage } from "./openai";
import { higgsfieldVideo } from "./higgsfield";
import type { ImageProvider, VideoProvider } from "./types";

export function getImageProvider(): ImageProvider {
  if (process.env.IMAGE_PROVIDER === "openai" && process.env.OPENAI_API_KEY) return openaiImage(process.env.OPENAI_API_KEY, process.env.OPENAI_IMAGE_MODEL || undefined);
  return mockImage;
}
export function getVideoProvider(): VideoProvider {
  if (process.env.VIDEO_PROVIDER === "higgsfield" && process.env.HIGGSFIELD_API_KEY) return higgsfieldVideo(process.env.HIGGSFIELD_API_KEY);
  return mockVideo;
}
export function providerStatus() {
  return {
    image: { configured: process.env.IMAGE_PROVIDER ?? "mock", live: process.env.IMAGE_PROVIDER === "openai" && !!process.env.OPENAI_API_KEY, envNeeded: "OPENAI_API_KEY" },
    video: { configured: process.env.VIDEO_PROVIDER ?? "mock", live: false, envNeeded: "HIGGSFIELD_API_KEY" },
  };
}
