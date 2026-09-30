import type { ImageProvider, VideoProvider } from "./types";

/** Produces no bytes: assets created by the mock carry provider "mock" and render as labelled placeholders. */
export const mockImage: ImageProvider = {
  name: "mock",
  async generate() { return { provider: "mock", model: null, bytes: null, mime: "image/png", costUsd: 0, credits: 0, externalId: null }; },
};

export const mockVideo: VideoProvider = {
  name: "mock",
  async submit() { return { provider: "mock", externalId: `mock-${Date.now()}`, state: "COMPLETE", url: null, credits: 0 }; },
  async poll(id) { return { provider: "mock", externalId: id, state: "COMPLETE", url: null, credits: 0 }; },
};
