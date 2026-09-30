// Cost is computed ONLY from operator-supplied pricing (LLM_PRICING_JSON) AND real usage numbers. Otherwise null — never guessed.
// Example: LLM_PRICING_JSON='{"gemini/gemini-2.5-flash":{"inputPerMTok":0.30,"outputPerMTok":2.50}}'  (USD per million tokens; you supply the values)
import type { LlmUsage } from "./types";

export function costFor(provider: string, model: string, usage: LlmUsage | null, env: NodeJS.ProcessEnv = process.env): number | null {
  if (provider === "mock") return 0; // no real call, no charge
  if (!usage || usage.inputTokens == null || usage.outputTokens == null || !env.LLM_PRICING_JSON) return null;
  try {
    const p = (JSON.parse(env.LLM_PRICING_JSON) as Record<string, { inputPerMTok?: number; outputPerMTok?: number }>)[`${provider}/${model}`];
    if (!p || typeof p.inputPerMTok !== "number" || typeof p.outputPerMTok !== "number") return null;
    return (usage.inputTokens * p.inputPerMTok + usage.outputTokens * p.outputPerMTok) / 1_000_000;
  } catch { return null; }
}
