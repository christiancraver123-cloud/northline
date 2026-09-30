// In-process provider health tracking: configured / unavailable / rate_limited / failed. Persisted call history lives in llm_calls.
import type { LlmError, LlmProvider, LlmProviderName, ProviderState } from "./types";

interface Rec { kind: "rate_limited" | "failed" | "unavailable" | "auth"; until: number; at: number; detail: string }
const g = globalThis as unknown as { __nlLlmHealth?: Map<string, Rec> };
const store = () => (g.__nlLlmHealth ??= new Map());

export const FAIL_COOLDOWN_MS = 60_000;
export const DEFAULT_RATE_LIMIT_MS = 60_000;

export function recordFailure(name: LlmProviderName, e: LlmError, now = Date.now()) {
  const ms = e.kind === "rate_limited" ? (e.retryAfterSec ? e.retryAfterSec * 1000 : DEFAULT_RATE_LIMIT_MS) : FAIL_COOLDOWN_MS;
  store().set(name, { kind: e.kind, until: now + ms, at: now, detail: e.message });
}
export function recordSuccess(name: LlmProviderName) { store().delete(name); }
export function resetHealth() { store().clear(); }

export function providerState(p: LlmProvider, now = Date.now()): { state: ProviderState; detail: string | null; until: number | null } {
  if (!p.configured()) return { state: "unavailable", detail: "not configured (missing credentials)", until: null };
  const r = store().get(p.name);
  if (r && r.until > now) return { state: r.kind === "rate_limited" ? "rate_limited" : "failed", detail: r.detail, until: r.until };
  return { state: "configured", detail: null, until: null };
}
