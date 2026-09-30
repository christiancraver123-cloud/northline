import { ProviderError, type ImageProvider, type VideoProvider } from "./types";

// A tiny valid 1x1 PNG is NOT generated: the mock returns no bytes so assets render as labelled placeholders and can never be mistaken for real images.
/** Mock still-image provider (demo/tests). Produces no image bytes. */
export const mockImage: ImageProvider = {
  name: "mock", model: "mock-image-1",
  async generate() { return { provider: "mock", model: "mock-image-1", bytes: null, mime: "image/png", costUsd: 0, credits: 0, externalId: null, metadata: { mock: true } }; },
};

/** Mock that returns real (solid-color) PNG bytes, for exercising file storage / inspection paths in tests. */
export function mockImageWithBytes(png: Uint8Array, opts: { failShots?: number[] } = {}): ImageProvider {
  return { name: "mock", model: "mock-image-bytes", async generate(req) {
    if (opts.failShots?.includes(req.shotN)) throw new ProviderError("mock", "simulated generation failure", true, "provider_unavailable");
    return { provider: "mock", model: "mock-image-bytes", bytes: png, mime: "image/png", costUsd: 0, credits: 0, externalId: null, metadata: { mock: true } };
  } };
}

export const mockVideo: VideoProvider = {
  name: "mock",
  async submit() { return { provider: "mock", externalId: `mock-${Date.now()}`, state: "COMPLETE", url: null, credits: 0 }; },
  async poll(id) { return { provider: "mock", externalId: id, state: "COMPLETE", url: null, credits: 0 }; },
};
