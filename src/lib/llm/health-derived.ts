// Provider health DERIVED FROM PERSISTED RECORDS (llm_calls + provider_jobs), so it survives restarts, is identical on every instance,
// and works on a read-only host. (The in-process tracker in health.ts only drives cooldowns inside one running server.)
// Nothing here invents data: a provider with no recorded calls is UNKNOWN, and stale blockers decay to UNKNOWN ("needs a re-probe").
import type { LlmCall, ProviderJob } from "@/lib/db/records";

export type HealthState = "HEALTHY" | "DEGRADED" | "RATE_LIMITED" | "QUOTA_EXHAUSTED" | "AUTH_ERROR" | "UNAVAILABLE" | "UNKNOWN";
export type ProviderId = "OPENAI_IMAGE" | "GEMINI_VISION" | "OPENAI_TEXT" | "HIGGSFIELD";
export interface ProviderHealth {
  id: ProviderId; label: string; state: HealthState; detail: string;
  lastSuccessAt: string | null; lastFailureAt: string | null; lastFailure: string | null; recentOk: number; recentFailed: number; basis: string;
}

/** How long a blocker is believed before we say "unknown, re-probe". Auth errors never decay (they need a fix). */
export const STALE_MS: Partial<Record<HealthState, number>> = { RATE_LIMITED: 10 * 60_000, UNAVAILABLE: 60 * 60_000, QUOTA_EXHAUSTED: 24 * 3_600_000, DEGRADED: 24 * 3_600_000 };
const WINDOW = 10;

interface Ev { at: string; ok: boolean; state: HealthState | null; reason: string | null }

const llmFailure = (c: LlmCall): { state: HealthState; reason: string } | null => {
  const e = c.error ?? "";
  if (c.status === "COMPLETE" || c.status === "SKIPPED") return null; // SKIPPED = a consequence of an earlier failure, not a new signal
  if (/credentials rejected|HTTP 40[13]/i.test(e)) return { state: "AUTH_ERROR", reason: e };
  if (/daily quota|quota\/credit exhausted|insufficient_quota/i.test(e)) return { state: "QUOTA_EXHAUSTED", reason: e };
  if (c.status === "RATE_LIMITED") return { state: "RATE_LIMITED", reason: e || "rate limited" };
  if (c.status === "UNAVAILABLE") return { state: "UNAVAILABLE", reason: e || "unavailable" };
  return { state: "DEGRADED", reason: e || "request failed" };
};
const jobFailure = (j: ProviderJob): { state: HealthState; reason: string } | null | "ignore" => {
  if (j.state !== "FAILED") return null;
  switch (j.failureCategory) {
    case "quota_exceeded": return { state: "QUOTA_EXHAUSTED", reason: "image quota / credit exhausted" };
    case "auth": return { state: "AUTH_ERROR", reason: "credentials rejected" };
    case "rate_limited": return { state: "RATE_LIMITED", reason: "rate limited" };
    case "provider_unavailable": case "timeout": return { state: "UNAVAILABLE", reason: j.failureCategory };
    case "content_policy": case "invalid_request": case "budget_blocked": return "ignore"; // the request was the problem, not the provider
    default: return { state: "DEGRADED", reason: j.failureCategory ?? "failed" };
  }
};

function judge(id: ProviderId, label: string, events: Ev[], basis: string, now: number): ProviderHealth {
  const evs = [...events].sort((a, b) => a.at.localeCompare(b.at)).slice(-WINDOW);
  const base = { id, label, basis, recentOk: evs.filter((e) => e.ok).length, recentFailed: evs.filter((e) => !e.ok).length, lastSuccessAt: [...evs].reverse().find((e) => e.ok)?.at ?? null, lastFailureAt: [...evs].reverse().find((e) => !e.ok)?.at ?? null, lastFailure: [...evs].reverse().find((e) => !e.ok)?.reason ?? null };
  if (!evs.length) return { ...base, state: "UNKNOWN", detail: "no calls recorded yet" };
  const last = evs[evs.length - 1];
  if (last.ok) return base.recentFailed ? { ...base, state: "DEGRADED", detail: `latest call succeeded; ${base.recentFailed} of the last ${evs.length} failed` } : { ...base, state: "HEALTHY", detail: `last ${evs.length} call(s) succeeded` };
  const st = last.state as HealthState, ttl = STALE_MS[st];
  if (ttl !== undefined && now - Date.parse(last.at) > ttl) return { ...base, state: "UNKNOWN", detail: `last failure (${st.toLowerCase().replace("_", " ")}) was ${Math.round((now - Date.parse(last.at)) / 3_600_000)}h ago with no call since: re-probe needed` };
  return { ...base, state: st, detail: last.reason ?? st };
}

export function deriveProviderHealth(input: { llmCalls: LlmCall[]; jobs: ProviderJob[]; now?: number }): ProviderHealth[] {
  const now = input.now ?? Date.now();
  const llm = (p: string): Ev[] => input.llmCalls.filter((c) => c.provider === p && c.status !== "SKIPPED").map((c) => { const f = llmFailure(c); return { at: c.startedAt, ok: c.status === "COMPLETE", state: f?.state ?? null, reason: f?.reason ?? null }; });
  const img: Ev[] = [];
  for (const j of input.jobs.filter((x) => x.provider === "openai" && x.operation.startsWith("image"))) {
    const f = jobFailure(j); if (f === "ignore") continue;
    if (j.state === "SUCCEEDED") img.push({ at: j.finishedAt ?? j.createdAt, ok: true, state: null, reason: null });
    else if (f) img.push({ at: j.finishedAt ?? j.createdAt, ok: false, state: f.state, reason: f.reason });
  }
  return [
    judge("OPENAI_IMAGE", "OpenAI image generation", img, "provider_jobs (image.generate)", now),
    judge("GEMINI_VISION", "Gemini vision / analysis", llm("gemini"), "llm_calls (gemini)", now),
    judge("OPENAI_TEXT", "OpenAI text / vision fallback", llm("openai"), "llm_calls (openai)", now),
    { id: "HIGGSFIELD", label: "Higgsfield (video)", state: "UNKNOWN", detail: "adapter not connected yet (stub)", lastSuccessAt: null, lastFailureAt: null, lastFailure: null, recentOk: 0, recentFailed: 0, basis: "not implemented" },
  ];
}
export const HEALTH_TONE: Record<HealthState, "ok" | "warn" | "bad" | "mute"> = { HEALTHY: "ok", DEGRADED: "warn", RATE_LIMITED: "warn", QUOTA_EXHAUSTED: "bad", AUTH_ERROR: "bad", UNAVAILABLE: "bad", UNKNOWN: "mute" };
