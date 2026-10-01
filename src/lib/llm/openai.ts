// OpenAI text/LLM adapter (chat completions). Separate from the still-image adapter in lib/providers/openai.ts.
// Key from OPENAI_API_KEY (server-side). Not exercised live in CI — fetch-mocked contract tests only.
import { LlmError, type LlmProvider } from "./types";

export function openaiLlmProvider(env: NodeJS.ProcessEnv = process.env, fetchFn: typeof fetch = fetch): LlmProvider {
  const model0 = env.OPENAI_TEXT_MODEL || "gpt-4o-mini";
  return {
    name: "openai",
    defaultModel: model0, vision: true,
    configured: () => !!env.OPENAI_API_KEY,
    async complete(req) {
      const key = env.OPENAI_API_KEY;
      if (!key) throw new LlmError("openai", "unavailable", "OPENAI_API_KEY is not set");
      const model = req.model || model0;
      let res: Response;
      try {
        res = await fetchFn("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
          body: JSON.stringify({ model, temperature: req.temperature ?? 0.4, ...(req.maxOutputTokens ? { max_tokens: req.maxOutputTokens } : {}), ...(req.json ? { response_format: { type: "json_object" } } : {}),
            messages: [...(req.system ? [{ role: "system", content: req.system }] : []), { role: "user", content: req.images?.length ? [{ type: "text", text: req.prompt }, ...req.images.map((i) => ({ type: "image_url", image_url: { url: `data:${i.mime};base64,${i.dataBase64}` } }))] : req.prompt }] }),
        });
      } catch { throw new LlmError("openai", "unavailable", "network error reaching OpenAI"); }
      if (!res.ok) {
        const retry = Number(res.headers.get("retry-after")) || undefined;
        if (res.status === 429) {
          const code = await res.json().then((j: { error?: { code?: string } }) => j.error?.code).catch(() => undefined);
          if (code === "insufficient_quota" || code === "credit_balance_exhausted" || code === "billing_hard_limit_reached") throw new LlmError("openai", "quota_exhausted", "quota/credit exhausted (HTTP 429) — add billing credit", retry);
          throw new LlmError("openai", "rate_limited", "rate limited (HTTP 429)", retry);
        }
        if (res.status === 401 || res.status === 403) throw new LlmError("openai", "auth", `credentials rejected (HTTP ${res.status})`);
        if (res.status === 503) throw new LlmError("openai", "unavailable", "service unavailable (HTTP 503)", retry);
        throw new LlmError("openai", "failed", `request failed (HTTP ${res.status})`);
      }
      const j = (await res.json()) as { id?: string; choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
      const text = j.choices?.[0]?.message?.content ?? "";
      if (!text) throw new LlmError("openai", "failed", "empty response");
      const u = j.usage;
      return { provider: "openai", model, text, usage: u ? { inputTokens: u.prompt_tokens ?? null, outputTokens: u.completion_tokens ?? null, totalTokens: u.total_tokens ?? null } : null, requestId: j.id ?? null };
    },
  };
}
