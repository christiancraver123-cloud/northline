// Provider-neutral LLM contracts. Agents talk to the router, never to a specific vendor.
export type LlmProviderName = "openai" | "gemini" | "mock";
export const LLM_PROVIDERS: LlmProviderName[] = ["gemini", "openai", "mock"];

export interface LlmImage { mime: string; dataBase64: string }
export interface LlmRequest { system?: string; prompt: string; json?: boolean; maxOutputTokens?: number; temperature?: number; model?: string; /** Inline images for vision calls (e.g. image QA). Never logged. */ images?: LlmImage[] }
export interface LlmUsage { inputTokens: number | null; outputTokens: number | null; totalTokens: number | null }
export interface LlmResult { provider: LlmProviderName; model: string; text: string; usage: LlmUsage | null; costUsd: number | null; latencyMs: number; requestId: string | null }

export type LlmErrorKind = "unavailable" | "rate_limited" | "auth" | "failed";
export class LlmError extends Error {
  constructor(public provider: LlmProviderName, public kind: LlmErrorKind, message: string, public retryAfterSec?: number) { super(`[${provider}] ${message}`); }
  get retryable() { return this.kind === "rate_limited" || this.kind === "failed" || this.kind === "unavailable"; }
}

export interface LlmProvider {
  readonly name: LlmProviderName;
  readonly defaultModel: string;
  /** Can this provider/model inspect images? */
  readonly vision: boolean;
  /** True when credentials/config are present (says nothing about live reachability). */
  configured(): boolean;
  complete(req: LlmRequest): Promise<Omit<LlmResult, "costUsd" | "latencyMs">>;
}

/** Operator-visible provider state. */
export type ProviderState = "configured" | "unavailable" | "rate_limited" | "failed";

/** Per-agent preference stored in agents.config.model. `rules` = deterministic, no model call. `auto` = router default. */
export interface ModelPreference { provider: LlmProviderName | "rules" | "auto"; model?: string; allowFallback?: boolean }
