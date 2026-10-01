import { describe, expect, it } from "vitest";
import type { LlmCall, ProviderJob } from "@/lib/db/records";
import { deriveProviderHealth, STALE_MS } from "./health-derived";

const NOW = Date.parse("2026-10-01T12:00:00Z");
const iso = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();
const call = (p: string, status: LlmCall["status"], minAgo: number, error: string | null = null): LlmCall => ({ id: Math.random().toString(), origin: "live", createdAt: iso(minAgo), updatedAt: iso(minAgo), runId: null, taskId: null, agentId: "IDENTITY_QA", provider: p, model: "m", status, error, startedAt: iso(minAgo), finishedAt: iso(minAgo), latencyMs: 1, inputTokens: null, outputTokens: null, totalTokens: null, costUsd: null, fallbackFrom: null });
const job = (state: ProviderJob["state"], minAgo: number, cat: string | null = null): ProviderJob => ({ id: Math.random().toString(), origin: "live", createdAt: iso(minAgo), updatedAt: iso(minAgo), runId: null, productionId: "p", provider: "openai", model: "gpt-image-1", operation: "image.generate", state, externalId: null, error: null, assetId: null, shotN: 1, costUsd: null, credits: null, briefId: null, attemptId: null, promptId: null, retryCount: 0, retryOfJobId: null, startedAt: iso(minAgo), finishedAt: iso(minAgo), failureCategory: cat, metadata: {} });
const get = (h: ReturnType<typeof deriveProviderHealth>, id: string) => h.find((x) => x.id === id)!;

describe("derived provider health", () => {
  it("UNKNOWN with no calls; Higgsfield is honestly not connected", () => {
    const h = deriveProviderHealth({ llmCalls: [], jobs: [], now: NOW });
    expect(h.map((x) => x.state)).toEqual(["UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"]);
    expect(get(h, "HIGGSFIELD").detail).toMatch(/not connected/);
  });
  it("HEALTHY after successes; DEGRADED when the latest succeeded but earlier calls failed", () => {
    expect(get(deriveProviderHealth({ llmCalls: [call("gemini", "COMPLETE", 5), call("gemini", "COMPLETE", 4)], jobs: [], now: NOW }), "GEMINI_VISION").state).toBe("HEALTHY");
    expect(get(deriveProviderHealth({ llmCalls: [call("gemini", "UNAVAILABLE", 9, "[gemini] service unavailable (HTTP 503)"), call("gemini", "COMPLETE", 2)], jobs: [], now: NOW }), "GEMINI_VISION").state).toBe("DEGRADED");
  });
  it("classifies the latest blocker: quota, rate limit, auth, unavailable", () => {
    const g = (c: LlmCall) => get(deriveProviderHealth({ llmCalls: [c], jobs: [], now: NOW }), "GEMINI_VISION");
    expect(g(call("gemini", "RATE_LIMITED", 1, "[gemini] daily quota exhausted (HTTP 429) — resets daily or enable billing")).state).toBe("QUOTA_EXHAUSTED");
    expect(g(call("gemini", "RATE_LIMITED", 1, "[gemini] rate limited (HTTP 429)")).state).toBe("RATE_LIMITED");
    expect(g(call("gemini", "FAILED", 1, "[gemini] credentials rejected (HTTP 403)")).state).toBe("AUTH_ERROR");
    expect(g(call("gemini", "UNAVAILABLE", 1, "[gemini] service unavailable (HTTP 503)")).state).toBe("UNAVAILABLE");
    expect(g(call("gemini", "FAILED", 1, "empty response")).state).toBe("DEGRADED");
  });
  it("SKIPPED calls (consequences of an earlier failure) are not counted as new signals", () => {
    const h = deriveProviderHealth({ llmCalls: [call("gemini", "COMPLETE", 30), call("gemini", "SKIPPED", 1, "failed: x")], jobs: [], now: NOW });
    expect(get(h, "GEMINI_VISION")).toMatchObject({ state: "HEALTHY", recentFailed: 0 });
  });
  it("blockers decay to UNKNOWN (needs a re-probe) except auth errors, which never decay", () => {
    const old = (min: number, status: LlmCall["status"], err: string) => get(deriveProviderHealth({ llmCalls: [call("gemini", status, min, err)], jobs: [], now: NOW }), "GEMINI_VISION");
    expect(old(STALE_MS.RATE_LIMITED! / 60_000 + 5, "RATE_LIMITED", "rate limited").state).toBe("UNKNOWN");
    expect(old(25 * 60, "RATE_LIMITED", "daily quota exhausted").state).toBe("UNKNOWN");
    expect(old(25 * 60, "RATE_LIMITED", "daily quota exhausted").detail).toMatch(/re-probe/);
    expect(old(30 * 24 * 60, "FAILED", "credentials rejected (HTTP 401)").state).toBe("AUTH_ERROR");
  });
  it("image health comes from provider_jobs: quota/auth/rate/unavailable map correctly; content-policy/invalid-request are not provider health", () => {
    const i = (j: ProviderJob[]) => get(deriveProviderHealth({ llmCalls: [], jobs: j, now: NOW }), "OPENAI_IMAGE");
    expect(i([job("SUCCEEDED", 20), job("SUCCEEDED", 10)]).state).toBe("HEALTHY");
    expect(i([job("FAILED", 5, "quota_exceeded")]).state).toBe("QUOTA_EXHAUSTED");
    expect(i([job("FAILED", 5, "auth")]).state).toBe("AUTH_ERROR");
    expect(i([job("FAILED", 5, "rate_limited")]).state).toBe("RATE_LIMITED");
    expect(i([job("FAILED", 5, "provider_unavailable")]).state).toBe("UNAVAILABLE");
    expect(i([job("SUCCEEDED", 10), job("FAILED", 5, "content_policy"), job("FAILED", 4, "invalid_request")]).state).toBe("HEALTHY");
    expect(i([job("SUCCEEDED", 30), job("FAILED", 20, "provider_unavailable"), job("SUCCEEDED", 5)]).state).toBe("DEGRADED");
  });
  it("only openai image jobs count for image health", () => {
    const other = { ...job("FAILED", 1, "quota_exceeded"), provider: "higgsfield" };
    expect(get(deriveProviderHealth({ llmCalls: [], jobs: [other], now: NOW }), "OPENAI_IMAGE").state).toBe("UNKNOWN");
  });
});
