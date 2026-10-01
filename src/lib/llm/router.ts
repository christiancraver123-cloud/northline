// Model router: picks provider+model per agent/job, runs the call, records every attempt, and applies fallback policy.
// RULES
//  * Agents never import a vendor; they call the router with their agent id + task kind.
//  * Preference order: agent.config.model -> job-class default ("auto": first configured of gemini, openai) -> deterministic `rules` (no model call).
//  * Fallback happens only when allowed. Identity-critical jobs NEVER fall back unless the preference explicitly sets allowFallback: true.
//  * Every attempt (incl. failures) is returned so it can be persisted in llm_calls and shown on the run.
import type { AgentCode } from "@/lib/db/records";
import { costFor } from "./pricing";
import { providerState, recordFailure, recordSuccess } from "./health";
import { geminiProvider } from "./gemini";
import { openaiLlmProvider } from "./openai";
import { mockLlm } from "./mock";
import { LlmError, type LlmProvider, type LlmProviderName, type LlmRequest, type LlmResult, type ModelPreference } from "./types";

/** Task kinds where switching provider silently could change identity-relevant output. */
export const IDENTITY_CRITICAL_KINDS = new Set(["identity_qa.review", "identity_qa.attempt", "continuity_qa.attempt", "prompt.build", "image.generate", "production.create", "production.regenerate"]);
/** Jobs suited to background/asynchronous analysis (Gemini-friendly by default when configured). */
export const ANALYSIS_KINDS = new Set(["strategist.concepts", "director.concepts", "growth.recommendations", "performance.report", "content_qa.review", "content_qa.audit", "technical_qa.attempt", "production.digest", "orchestrator.report", "orchestrator.consolidate"]);

export interface Attempt { provider: LlmProviderName; model: string; status: "COMPLETE" | "FAILED" | "RATE_LIMITED" | "UNAVAILABLE" | "SKIPPED"; error: string | null; startedAt: string; finishedAt: string; latencyMs: number; usage: LlmResult["usage"]; costUsd: number | null; fallbackFrom: LlmProviderName | null }
export interface RouteResult { result: LlmResult | null; attempts: Attempt[]; usedFallback: boolean; error: LlmError | null }

export interface Router {
  providers: Record<LlmProviderName, LlmProvider>;
  /** Ordered candidates for a job (before availability filtering). Empty = run deterministic rules. */
  candidates(agent: AgentCode, kind: string, pref?: ModelPreference): { provider: LlmProviderName; model: string }[];
  /** Predicted lane (for concurrency scheduling / UI): first candidate's provider or "rules". */
  laneFor(agent: AgentCode, kind: string, pref?: ModelPreference): LlmProviderName | "rules";
  /** `probe: true` = a deliberate retry after backoff: ignore the provider's failure cooldown (never ignores 'not configured'). */
  run(agent: AgentCode, kind: string, req: LlmRequest, pref?: ModelPreference, opts?: { probe?: boolean }): Promise<RouteResult>;
}

export function createRouter(providers: Record<LlmProviderName, LlmProvider>): Router {
  const auto = (): LlmProviderName[] => (["gemini", "openai"] as const).filter((n) => providers[n].configured());
  const fallbackAllowed = (kind: string, pref?: ModelPreference) => pref?.allowFallback ?? !IDENTITY_CRITICAL_KINDS.has(kind);

  function candidates(_agent: AgentCode, kind: string, pref?: ModelPreference) {
    const p = pref ?? { provider: "auto" as const };
    if (p.provider === "rules") return [];
    const chain: { provider: LlmProviderName; model: string }[] = [];
    const add = (n: LlmProviderName, model?: string) => { if (!chain.some((c) => c.provider === n)) chain.push({ provider: n, model: model ?? providers[n].defaultModel }); };
    if (p.provider === "auto") {
      // Identity-critical kinds don't auto-route to an LLM at all unless the operator set a preference.
      if (IDENTITY_CRITICAL_KINDS.has(kind) || !ANALYSIS_KINDS.has(kind)) return [];
      for (const n of auto()) add(n);
      return chain;
    }
    add(p.provider, p.model);
    if (fallbackAllowed(kind, pref)) {
      for (const n of auto()) add(n);
      if (p.provider !== "mock" && !auto().length && providers.mock.configured()) add("mock");
    }
    return chain;
  }

  return {
    providers, candidates,
    laneFor(agent, kind, pref) {
      const c = candidates(agent, kind, pref).find((x) => providers[x.provider].configured() && providerState(providers[x.provider]).state === "configured");
      return c?.provider ?? "rules";
    },
    async run(agent, kind, req, pref, opts) {
      const attempts: Attempt[] = [];
      const chain = candidates(agent, kind, pref);
      let lastErr: LlmError | null = null;
      let first: LlmProviderName | null = null;
      for (const c of chain) {
        const prov = providers[c.provider];
        const t0 = Date.now(), s0 = new Date(t0).toISOString();
        const st = providerState(prov, t0);
        first ??= c.provider;
        if (st.state !== "configured" && !(opts?.probe && st.until !== null)) {
          lastErr = new LlmError(c.provider, st.state === "rate_limited" ? "rate_limited" : "unavailable", st.detail ?? st.state);
          attempts.push({ provider: c.provider, model: c.model, status: "SKIPPED", error: `${st.state}: ${st.detail ?? ""}`.trim(), startedAt: s0, finishedAt: s0, latencyMs: 0, usage: null, costUsd: null, fallbackFrom: first === c.provider ? null : first });
          continue;
        }
        if (req.images?.length && !prov.vision) {
          lastErr = new LlmError(c.provider, "unavailable", "provider has no vision support");
          attempts.push({ provider: c.provider, model: c.model, status: "SKIPPED", error: "no vision support", startedAt: s0, finishedAt: s0, latencyMs: 0, usage: null, costUsd: null, fallbackFrom: first === c.provider ? null : first });
          continue;
        }
        try {
          const r = await prov.complete({ ...req, model: c.model });
          const latencyMs = Date.now() - t0;
          const costUsd = costFor(r.provider, r.model, r.usage);
          recordSuccess(c.provider);
          const result: LlmResult = { ...r, costUsd, latencyMs };
          attempts.push({ provider: c.provider, model: r.model, status: "COMPLETE", error: null, startedAt: s0, finishedAt: new Date().toISOString(), latencyMs, usage: r.usage, costUsd, fallbackFrom: first === c.provider ? null : first });
          return { result, attempts, usedFallback: first !== c.provider, error: null };
        } catch (e) {
          const err = e instanceof LlmError ? e : new LlmError(c.provider, "failed", e instanceof Error ? e.message : "unknown error");
          recordFailure(c.provider, err);
          lastErr = err;
          attempts.push({ provider: c.provider, model: c.model, status: err.kind === "rate_limited" ? "RATE_LIMITED" : err.kind === "unavailable" ? "UNAVAILABLE" : "FAILED", error: err.message, startedAt: s0, finishedAt: new Date().toISOString(), latencyMs: Date.now() - t0, usage: null, costUsd: null, fallbackFrom: first === c.provider ? null : first });
        }
      }
      return { result: null, attempts, usedFallback: false, error: lastErr };
    },
  };
}

export function defaultRouter(env: NodeJS.ProcessEnv = process.env): Router {
  return createRouter({ gemini: geminiProvider(env), openai: openaiLlmProvider(env), mock: mockLlm({ configured: env.LLM_ENABLE_MOCK === "true" }) });
}
