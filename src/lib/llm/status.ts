// Operator-facing provider status: configured / unavailable / rate_limited / failed, plus real call counts from llm_calls.
import type { Repo } from "@/lib/db/repo";
import { providerState } from "./health";
import type { Router } from "./router";
import type { LlmProviderName, ProviderState } from "./types";

export interface ProviderStatus { name: LlmProviderName; model: string; state: ProviderState; detail: string | null; calls: number; failures: number; lastCallAt: string | null; tokens: number | null; costUsd: number | null }

export async function llmProviderStatuses(repo: Repo, router: Router): Promise<ProviderStatus[]> {
  const calls = await repo.list("llmCalls");
  return (["gemini", "openai", "mock"] as const).map((name) => {
    const p = router.providers[name];
    const st = providerState(p);
    const mine = calls.filter((c) => c.provider === name && c.status !== "SKIPPED");
    const ok = mine.filter((c) => c.status === "COMPLETE");
    const tokenKnown = ok.length > 0 && ok.every((c) => c.totalTokens != null);
    const costKnown = ok.length > 0 && ok.every((c) => c.costUsd != null);
    return {
      name, model: p.defaultModel, state: st.state, detail: st.detail, calls: mine.length, failures: mine.filter((c) => c.status !== "COMPLETE").length,
      lastCallAt: mine.map((c) => c.startedAt).sort().at(-1) ?? null,
      tokens: tokenKnown ? ok.reduce((s, c) => s + (c.totalTokens ?? 0), 0) : null, costUsd: costKnown ? ok.reduce((s, c) => s + (c.costUsd ?? 0), 0) : null,
    };
  });
}
