// OpenAI still-image adapter (primary still-image layer). Requires OPENAI_API_KEY (server-side only).
// NOTE: not exercised in CI — no credentials in the build environment. Verify with a real key before relying on it.
import { ProviderError, type ImageProvider } from "./types";

export function openaiImage(apiKey: string, model = "gpt-image-1"): ImageProvider {
  return {
    name: "openai",
    async generate(req) {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, prompt: `${req.prompt}\n\n${req.negative}`, size: "1024x1536", n: 1 }),
      });
      if (!res.ok) {
        // Never echo the key or full upstream body into logs/UI.
        throw new ProviderError("openai", `image generation failed (HTTP ${res.status})`, res.status >= 500 || res.status === 429);
      }
      const json = (await res.json()) as { data?: { b64_json?: string }[] };
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) throw new ProviderError("openai", "response contained no image data", false);
      return { provider: "openai", model, bytes: Uint8Array.from(Buffer.from(b64, "base64")), mime: "image/png", costUsd: null, credits: null, externalId: null };
    },
  };
}
