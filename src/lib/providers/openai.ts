// OpenAI still-image adapter (primary still-image layer). Server-side only: key from OPENAI_API_KEY, sent in a header.
// With canonical references it uses the images EDITS endpoint (reference images as inputs); otherwise generations.
// Verified only against mocked fetch — NOT yet against the live API (no credentials in the build environment).
import { ProviderError, type FailureCategory, type ImageProvider } from "./types";

const API = "https://api.openai.com/v1/images";

function categorize(status: number, code: string | undefined): { category: FailureCategory; retryable: boolean } {
  if (code === "content_policy_violation" || code === "moderation_blocked") return { category: "content_policy", retryable: false };
  // Seen live: HTTP 429 with code credit_balance_exhausted / insufficient_quota is a BILLING problem, not a transient rate limit.
  if (code === "insufficient_quota" || code === "credit_balance_exhausted" || code === "billing_hard_limit_reached") return { category: "quota_exceeded", retryable: false };
  if (status === 429) return { category: "rate_limited", retryable: true };
  if (status === 401 || status === 403) return { category: "auth", retryable: false };
  if (status === 400 || status === 422) return { category: "invalid_request", retryable: false };
  if (status === 408 || status === 504) return { category: "timeout", retryable: true };
  if (status >= 500) return { category: "provider_unavailable", retryable: true };
  return { category: "unknown", retryable: false };
}

export function openaiImage(apiKey: string, model = "gpt-image-1", fetchFn: typeof fetch = fetch): ImageProvider {
  return {
    name: "openai", model,
    async generate(req) {
      const size = req.size ?? "1024x1536";
      const prompt = `${req.prompt}\n\n${req.negative}`;
      let res: Response;
      try {
        if (req.references.length) {
          const form = new FormData();
          form.append("model", model); form.append("prompt", `${prompt}\n\nThe attached reference images are the authoritative identity source for face and permanent markers; text is secondary where ambiguous.`);
          form.append("size", size); form.append("n", "1");
          if (req.inputFidelity) form.append("input_fidelity", req.inputFidelity);
          req.references.forEach((r, i) => form.append("image[]", new Blob([Buffer.from(r.bytes)], { type: r.mime }), `reference-${i + 1}-${r.type}.${r.mime.split("/")[1]}`));
          res = await fetchFn(`${API}/edits`, { method: "POST", headers: { authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(180_000) });
        } else {
          res = await fetchFn(`${API}/generations`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` }, body: JSON.stringify({ model, prompt, size, n: 1 }), signal: AbortSignal.timeout(180_000) });
        }
      } catch (e) {
        const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
        throw new ProviderError("openai", timeout ? "request timed out" : "network error reaching OpenAI", true, timeout ? "timeout" : "provider_unavailable");
      }
      if (!res.ok) {
        let code: string | undefined;
        let type: string | undefined;
        try { const e = ((await res.json()) as { error?: { code?: string; type?: string } }).error; code = e?.code; type = e?.type; } catch { /* ignore body */ }
        const c = categorize(res.status, typeof code === "string" ? code : typeof type === "string" ? type : undefined);
        // Never echo the upstream body or the key: status + category only.
        throw new ProviderError("openai", `image generation failed (HTTP ${res.status}, ${c.category})`, c.retryable, c.category);
      }
      const json = (await res.json()) as { data?: { b64_json?: string }[]; usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } };
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) throw new ProviderError("openai", "response contained no image data", false, "unknown");
      return { provider: "openai", model, bytes: Uint8Array.from(Buffer.from(b64, "base64")), mime: "image/png", costUsd: null, credits: null, externalId: null,
        metadata: { size, endpoint: req.references.length ? "edits" : "generations", referenceCount: req.references.length, inputFidelity: req.inputFidelity ?? null, usage: json.usage ?? null } };
    },
  };
}
