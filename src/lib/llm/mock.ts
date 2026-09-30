// Mock LLM provider for dev/tests. Can impersonate a vendor name and simulate failures. Reports no token usage (nothing real was used).
import { LlmError, type LlmErrorKind, type LlmProvider, type LlmProviderName } from "./types";

export interface MockLlmOptions { name?: LlmProviderName; configured?: boolean; failWith?: LlmErrorKind; delayMs?: number; reply?: (prompt: string) => string; calls?: { prompt: string; model: string; images?: number }[]; usage?: { inputTokens: number; outputTokens: number } }

export function mockLlm(o: MockLlmOptions = {}): LlmProvider {
  const name = o.name ?? "mock";
  return {
    name, vision: true, defaultModel: name === "mock" ? "mock-1" : `${name}-mock`,
    configured: () => o.configured ?? true,
    async complete(req) {
      if (o.delayMs) await new Promise((r) => setTimeout(r, o.delayMs));
      if (o.failWith) throw new LlmError(name, o.failWith, `simulated ${o.failWith}`, o.failWith === "rate_limited" ? 30 : undefined);
      const model = req.model || (name === "mock" ? "mock-1" : `${name}-mock`);
      o.calls?.push({ prompt: req.prompt, model, images: req.images?.length ?? 0 });
      return { provider: name, model, text: o.reply ? o.reply(req.prompt) : `[${name} mock analysis] ${req.prompt.slice(0, 120)}`, usage: o.usage ? { ...o.usage, totalTokens: o.usage.inputTokens + o.usage.outputTokens } : null, requestId: null };
    },
  };
}
