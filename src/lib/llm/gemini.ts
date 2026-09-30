// Google Gemini adapter (generateContent REST API). Server-side only; key from GEMINI_API_KEY, sent in a header (never in URLs/logs).
// Not exercised against the live API in CI (no credentials) — covered by fetch-mocked contract tests.
import { LlmError, type LlmProvider } from "./types";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export function geminiProvider(env: NodeJS.ProcessEnv = process.env, fetchFn: typeof fetch = fetch): LlmProvider {
  const model0 = env.GEMINI_MODEL || "gemini-2.5-flash";
  return {
    name: "gemini",
    defaultModel: model0, vision: true,
    configured: () => !!env.GEMINI_API_KEY,
    async complete(req) {
      const key = env.GEMINI_API_KEY;
      if (!key) throw new LlmError("gemini", "unavailable", "GEMINI_API_KEY is not set");
      const model = req.model || model0;
      let res: Response;
      try {
        res = await fetchFn(`${BASE}/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
            contents: [{ role: "user", parts: [{ text: req.prompt }, ...(req.images ?? []).map((i) => ({ inlineData: { mimeType: i.mime, data: i.dataBase64 } }))] }],
            generationConfig: { temperature: req.temperature ?? 0.4, ...(req.maxOutputTokens ? { maxOutputTokens: req.maxOutputTokens } : {}), ...(req.json ? { responseMimeType: "application/json" } : {}) },
          }),
        });
      } catch {
        throw new LlmError("gemini", "unavailable", "network error reaching Gemini");
      }
      if (!res.ok) {
        const retry = Number(res.headers.get("retry-after")) || undefined;
        // Never echo the upstream body (may contain request details); status only.
        if (res.status === 429) throw new LlmError("gemini", "rate_limited", "rate limited (HTTP 429)", retry);
        if (res.status === 401 || res.status === 403) throw new LlmError("gemini", "auth", `credentials rejected (HTTP ${res.status})`);
        if (res.status === 503) throw new LlmError("gemini", "unavailable", "service unavailable (HTTP 503)", retry);
        throw new LlmError("gemini", "failed", `request failed (HTTP ${res.status})`);
      }
      const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }; responseId?: string };
      const text = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
      if (!text) throw new LlmError("gemini", "failed", `empty response${j.candidates?.[0]?.finishReason ? ` (${j.candidates[0].finishReason})` : ""}`);
      const u = j.usageMetadata;
      return { provider: "gemini", model, text, usage: u ? { inputTokens: u.promptTokenCount ?? null, outputTokens: u.candidatesTokenCount ?? null, totalTokens: u.totalTokenCount ?? null } : null, requestId: j.responseId ?? null };
    },
  };
}
