import { describe, expect, it } from "vitest";
import type { AgentTask, LlmCall, ProviderJob } from "@/lib/db/records";
import { summarizeUsage } from "./usage";

const T = (h: number) => new Date(Date.parse("2026-10-07T12:00:00Z") - h * 3_600_000).toISOString();
const job = (state: ProviderJob["state"], hAgo: number, usage: unknown, costUsd: number | null = null, op = "image.generate"): ProviderJob => ({ id: Math.random().toString(), origin: "live", createdAt: T(hAgo), updatedAt: T(hAgo), runId: null, productionId: "p", provider: "openai", model: "gpt-image-1", operation: op, state, externalId: null, error: null, assetId: null, shotN: 1, costUsd, credits: null, briefId: null, attemptId: null, promptId: null, retryCount: 0, retryOfJobId: null, startedAt: T(hAgo), finishedAt: T(hAgo), failureCategory: null, metadata: usage ? { usage } : {} });
const call = (status: LlmCall["status"], hAgo: number, tokens: number | null, cost: number | null = null): LlmCall => ({ id: Math.random().toString(), origin: "live", createdAt: T(hAgo), updatedAt: T(hAgo), runId: null, taskId: null, agentId: "IDENTITY_QA", provider: "openai", model: "m", status, error: null, startedAt: T(hAgo), finishedAt: T(hAgo), latencyMs: 1, inputTokens: null, outputTokens: null, totalTokens: tokens, costUsd: cost, fallbackFrom: null });
const task = (status: AgentTask["status"], hAgo: number) => ({ id: Math.random().toString(), status, createdAt: T(hAgo), finishedAt: T(hAgo) } as AgentTask);

describe("usage summary (usage stored separately from price)", () => {
  const since = new Date(T(24));
  const u = (n: number) => ({ input_tokens: n, output_tokens: 6240, input_tokens_details: { image_tokens: n - 600, text_tokens: 600 } });
  it("sums image usage in the window only and splits image vs text input tokens", () => {
    const s = summarizeUsage({ jobs: [job("SUCCEEDED", 1, u(5000)), job("SUCCEEDED", 2, u(1400)), job("FAILED", 3, null), job("SUCCEEDED", 30, u(9000))], llmCalls: [], tasks: [], since });
    expect(s.images).toEqual({ succeeded: 2, failed: 1, inputTokens: 6400, imageInputTokens: 5200, textInputTokens: 1200, outputTokens: 12480, withUsage: 2 });
  });
  it("never invents a dollar figure: cost is null unless a record carries one", () => {
    expect(summarizeUsage({ jobs: [job("SUCCEEDED", 1, u(5000))], llmCalls: [call("COMPLETE", 1, 100)], tasks: [], since })).toMatchObject({ costUsd: null });
    expect(summarizeUsage({ jobs: [job("SUCCEEDED", 1, u(5000), 0.3)], llmCalls: [call("COMPLETE", 1, 100, 0.01)], tasks: [], since }).costUsd).toBeCloseTo(0.31);
  });
  it("counts LLM calls, failures and tokens; skipped calls are separate; unknown tokens are not summed as zero-known", () => {
    const s = summarizeUsage({ jobs: [], llmCalls: [call("COMPLETE", 1, 1000), call("RATE_LIMITED", 1, null), call("SKIPPED", 1, null), call("COMPLETE", 2, null)], tasks: [], since });
    expect(s.llm).toEqual({ calls: 3, ok: 2, failed: 1, skipped: 1, tokens: 1000, tokensKnownFor: 1 });
  });
  it("counts finished tasks in the window and ignores non-image provider jobs", () => {
    const s = summarizeUsage({ jobs: [job("SUCCEEDED", 1, u(5000), null, "video.submit")], llmCalls: [], tasks: [task("COMPLETE", 1), task("FAILED", 2), task("COMPLETE", 40)], since });
    expect(s.tasks).toEqual({ complete: 1, failed: 1 }); expect(s.images.succeeded).toBe(0);
  });
});
