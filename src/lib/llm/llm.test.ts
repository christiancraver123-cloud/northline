import { beforeEach, describe, expect, it, vi } from "vitest";
import { FileRepo } from "@/lib/db/file-store";
import { geminiProvider } from "./gemini";
import { openaiLlmProvider } from "./openai";
import { costFor } from "./pricing";
import { createRouter, defaultRouter } from "./router";
import { resetHealth } from "./health";
import { mockLlm } from "./mock";
import { LlmError } from "./types";
import { llmProviderStatuses } from "./status";
import { ensureAgents, enqueue, setModelPreference, snapshots } from "@/lib/agents/ops/service";
import { processQueue } from "@/lib/agents/ops/worker";
import { handleMessage } from "@/lib/agents/ops/chat";

beforeEach(() => resetHealth());
const mkFetch = (status: number, body: unknown, headers: Record<string, string> = {}) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers }));

describe("Gemini adapter (fetch-mocked contract)", () => {
  const ok = { candidates: [{ content: { parts: [{ text: "hello" }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 }, responseId: "r1" };
  it("sends key in a header (never the URL), maps request and parses usage", async () => {
    const f = mkFetch(200, ok);
    const p = geminiProvider({ GEMINI_API_KEY: "SECRETKEY", GEMINI_MODEL: "gemini-x" } as never, f as never);
    const r = await p.complete({ system: "sys", prompt: "hi", json: true, maxOutputTokens: 100 });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent");
    expect(url).not.toContain("SECRETKEY");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("SECRETKEY");
    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toBe("sys");
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(r).toMatchObject({ provider: "gemini", model: "gemini-x", text: "hello", usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 }, requestId: "r1" });
  });
  it("maps 429/401/503/500 to typed errors without leaking the key", async () => {
    const run = async (status: number, h = {}): Promise<LlmError> => { try { await geminiProvider({ GEMINI_API_KEY: "SECRETKEY" } as never, mkFetch(status, { error: { message: "SECRETKEY leaked?" } }, h) as never).complete({ prompt: "x" }); } catch (e) { return e as LlmError; } throw new Error("expected failure"); };
    const e429 = await run(429, { "retry-after": "12" });
    expect([e429.kind, e429.retryAfterSec]).toEqual(["rate_limited", 12]);
    expect((await run(403)).kind).toBe("auth");
    expect((await run(503)).kind).toBe("unavailable");
    const e500 = await run(500);
    expect(e500.kind).toBe("failed");
    expect(e500.message).not.toContain("SECRETKEY");
  });
  it("is unavailable without a key and never calls the network", async () => {
    const f = mkFetch(200, ok);
    const p = geminiProvider({} as never, f as never);
    expect(p.configured()).toBe(false);
    await expect(p.complete({ prompt: "x" })).rejects.toMatchObject({ kind: "unavailable" });
    expect(f).not.toHaveBeenCalled();
  });
  it("OpenAI text adapter parses usage", async () => {
    const p = openaiLlmProvider({ OPENAI_API_KEY: "k" } as never, mkFetch(200, { id: "c1", choices: [{ message: { content: "yo" } }], usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } }) as never);
    expect(await p.complete({ prompt: "x" })).toMatchObject({ provider: "openai", text: "yo", usage: { totalTokens: 7 } });
  });
});

describe("cost tracking never fabricates", () => {
  const u = { inputTokens: 1_000_000, outputTokens: 500_000, totalTokens: 1_500_000 };
  it("null without pricing or usage; computed only from supplied pricing", () => {
    expect(costFor("gemini", "m", u, {} as never)).toBeNull();
    expect(costFor("gemini", "m", null, { LLM_PRICING_JSON: '{"gemini/m":{"inputPerMTok":1,"outputPerMTok":2}}' } as never)).toBeNull();
    expect(costFor("gemini", "m", u, { LLM_PRICING_JSON: '{"gemini/other":{"inputPerMTok":1,"outputPerMTok":2}}' } as never)).toBeNull();
    expect(costFor("gemini", "m", u, { LLM_PRICING_JSON: "not json" } as never)).toBeNull();
    expect(costFor("gemini", "m", u, { LLM_PRICING_JSON: '{"gemini/m":{"inputPerMTok":1,"outputPerMTok":2}}' } as never)).toBeCloseTo(2);
    expect(costFor("mock", "m", null, {} as never)).toBe(0);
  });
});

describe("router policy", () => {
  const set = (o: Partial<Record<"gemini" | "openai" | "mock", Parameters<typeof mockLlm>[0]>>) =>
    createRouter({ gemini: mockLlm({ name: "gemini", ...o.gemini }), openai: mockLlm({ name: "openai", ...o.openai }), mock: mockLlm({ name: "mock", configured: false, ...o.mock }) });
  it("auto routes analysis jobs to first configured LLM (gemini), else rules", () => {
    expect(set({}).candidates("PERFORMANCE_AGENT", "performance.report").map((c) => c.provider)).toEqual(["gemini", "openai"]);
    expect(set({ gemini: { configured: false } }).candidates("PERFORMANCE_AGENT", "performance.report").map((c) => c.provider)).toEqual(["openai"]);
    expect(set({ gemini: { configured: false }, openai: { configured: false } }).laneFor("PERFORMANCE_AGENT", "performance.report")).toBe("rules");
  });
  it("identity-critical kinds never auto-route to an LLM", () => {
    expect(set({}).candidates("IDENTITY_QA", "identity_qa.review")).toEqual([]);
    expect(set({}).candidates("PRODUCTION_MANAGER", "production.create")).toEqual([]);
  });
  it("falls back on failure for analysis jobs and records the fallback", async () => {
    const r = set({ gemini: { failWith: "rate_limited" } });
    const out = await r.run("GROWTH_STRATEGIST", "growth.recommendations", { prompt: "x" }, { provider: "gemini" });
    expect(out.result?.provider).toBe("openai");
    expect(out.usedFallback).toBe(true);
    expect(out.attempts.map((a) => [a.provider, a.status, a.fallbackFrom])).toEqual([["gemini", "RATE_LIMITED", null], ["openai", "COMPLETE", "gemini"]]);
  });
  it("a rate-limited provider is skipped (cooldown) without another call", async () => {
    const calls: { prompt: string; model: string }[] = [];
    const r = createRouter({ gemini: mockLlm({ name: "gemini", failWith: "rate_limited", calls }), openai: mockLlm({ name: "openai" }), mock: mockLlm({ configured: false }) });
    await r.run("GROWTH_STRATEGIST", "growth.recommendations", { prompt: "1" }, { provider: "gemini" });
    const second = await r.run("GROWTH_STRATEGIST", "growth.recommendations", { prompt: "2" }, { provider: "gemini" });
    expect(second.attempts[0]).toMatchObject({ provider: "gemini", status: "SKIPPED" });
    expect(second.result?.provider).toBe("openai");
  });
  it("NEVER silently switches provider for identity-critical work unless explicitly allowed", async () => {
    const r = set({ gemini: { failWith: "failed" } });
    const blocked = await r.run("IDENTITY_QA", "identity_qa.review", { prompt: "x" }, { provider: "gemini" });
    expect(blocked.result).toBeNull();
    expect(blocked.attempts.map((a) => a.provider)).toEqual(["gemini"]);
    resetHealth();
    const allowed = await r.run("IDENTITY_QA", "identity_qa.review", { prompt: "x" }, { provider: "gemini", allowFallback: true });
    expect(allowed.result?.provider).toBe("openai");
  });
  it("explicit preference for an unconfigured provider with no fallback is an honest failure", async () => {
    const r = set({ gemini: { configured: false } });
    const out = await r.run("PERFORMANCE_AGENT", "performance.report", { prompt: "x" }, { provider: "gemini", allowFallback: false });
    expect(out.result).toBeNull();
    expect(out.error?.kind).toBe("unavailable");
  });
  it("default router works with no credentials at all", () => {
    expect(defaultRouter({} as never).laneFor("PERFORMANCE_AGENT", "performance.report")).toBe("rules");
  });
});

describe("agent ops integration", () => {
  const mkRouter = (o: Parameters<typeof createRouter>[0]) => createRouter(o);
  async function fresh() { const r = new FileRepo(null); await ensureAgents(r); return r; }
  const prov = (g?: Parameters<typeof mockLlm>[0], o?: Parameters<typeof mockLlm>[0]) => mkRouter({ gemini: mockLlm({ name: "gemini", ...g }), openai: mockLlm({ name: "openai", ...o }), mock: mockLlm({ configured: false }) });

  it("records actual provider/model on the run, llm_calls and activity; cost null without pricing", async () => {
    const r = await fresh();
    await enqueue(r, { agentId: "PERFORMANCE_AGENT", kind: "performance.report", title: "perf" });
    await processQueue(r, { router: prov({ usage: { inputTokens: 100, outputTokens: 50 } }) });
    const [run] = await r.list("agentRuns");
    expect(run).toMatchObject({ provider: "gemini", model: "gemini-mock", tokens: 150, costUsd: null, usedFallback: false });
    const [call] = await r.list("llmCalls");
    expect(call).toMatchObject({ provider: "gemini", status: "COMPLETE", totalTokens: 150, runId: run.id });
    expect((await r.list("agentEvents")).some((e) => e.kind === "LLM_CALL" && e.message.includes("gemini/gemini-mock"))).toBe(true);
    const rep = (await r.list("agentReports"))[0];
    expect(rep.body).toContain("AI analysis (gemini · gemini-mock)");
    expect(rep.body).toMatch(/no real or manual analytics/i); // facts stay authoritative
  });
  it("no provider configured -> run is labelled rules, no calls, no cost", async () => {
    const r = await fresh();
    await enqueue(r, { agentId: "PERFORMANCE_AGENT", kind: "performance.report", title: "perf" });
    await processQueue(r, { router: prov({ configured: false }, { configured: false }) });
    const [run] = await r.list("agentRuns");
    expect(run).toMatchObject({ provider: "rules", model: null, tokens: null, costUsd: null });
    expect(await r.list("llmCalls")).toHaveLength(0);
  });
  it("preference is per agent and changeable; fallback is recorded on the run", async () => {
    const r = await fresh();
    await setModelPreference(r, "GROWTH_STRATEGIST", { provider: "openai", model: "gpt-custom" });
    await enqueue(r, { agentId: "GROWTH_STRATEGIST", kind: "growth.recommendations", title: "g" });
    await processQueue(r, { router: prov() });
    expect((await r.list("agentRuns"))[0]).toMatchObject({ provider: "openai", model: "gpt-custom" });
    await setModelPreference(r, "GROWTH_STRATEGIST", { provider: "gemini", allowFallback: true });
    await enqueue(r, { agentId: "GROWTH_STRATEGIST", kind: "growth.recommendations", title: "g2" });
    await processQueue(r, { router: prov({ failWith: "failed" }) });
    const run2 = (await r.list("agentRuns")).find((x) => x.usedFallback)!;
    expect(run2.provider).toBe("openai");
    expect((await snapshots(r)).find((s) => s.agent.code === "GROWTH_STRATEGIST")!.lastRun).toBeTruthy();
  });
  it("provider outage degrades to facts-only without failing the task", async () => {
    const r = await fresh();
    await setModelPreference(r, "PERFORMANCE_AGENT", { provider: "gemini", allowFallback: false });
    await enqueue(r, { agentId: "PERFORMANCE_AGENT", kind: "performance.report", title: "perf" });
    await processQueue(r, { router: prov({ failWith: "rate_limited" }) });
    expect((await r.list("agentTasks"))[0].status).toBe("COMPLETE");
    expect((await r.list("agentReports"))[0].body).not.toContain("AI analysis");
    expect((await r.list("agentEvents")).some((e) => e.kind === "LLM_UNAVAILABLE")).toBe(true);
    expect((await r.list("llmCalls"))[0]).toMatchObject({ status: "RATE_LIMITED", provider: "gemini" });
    const st = await llmProviderStatuses(r, prov({ failWith: "rate_limited" }));
    expect(st.find((s) => s.name === "gemini")!.failures).toBe(1);
  });
  it("runs independent jobs concurrently across different providers", async () => {
    const r = await fresh();
    await setModelPreference(r, "PERFORMANCE_AGENT", { provider: "gemini" });
    await setModelPreference(r, "GROWTH_STRATEGIST", { provider: "openai" });
    await setModelPreference(r, "CONTENT_QA", { provider: "gemini" });
    await enqueue(r, { agentId: "PERFORMANCE_AGENT", kind: "performance.report", title: "p" });
    await enqueue(r, { agentId: "GROWTH_STRATEGIST", kind: "growth.recommendations", title: "g" });
    await enqueue(r, { agentId: "CONTENT_QA", kind: "content_qa.audit", title: "a" });
    const t0 = Date.now();
    const res = await processQueue(r, { router: prov({ delayMs: 120 }, { delayMs: 120 }) });
    const elapsed = Date.now() - t0;
    expect(res.ran.map((x) => x.status)).toEqual(["COMPLETE", "COMPLETE", "COMPLETE"]);
    expect(elapsed).toBeLessThan(330); // sequential would be >= 360ms
    const runs = await r.list("agentRuns");
    const s = runs.map((x) => x.startedAt).sort();
    const f = runs.map((x) => x.finishedAt!).sort();
    expect(s[2] < f[0]).toBe(true); // overlapping execution windows
    expect(new Set(runs.map((x) => x.provider))).toEqual(new Set(["gemini", "openai"]));
  });
  it("chat: content audit runs through the router", async () => {
    const r = await fresh();
    const a = await handleMessage(r, "ORCHESTRATOR", "Have Content QA audit recent content");
    expect(a.reply).toMatch(/Content QA finished/);
    expect((await r.list("agentRuns"))[0].provider).toBe("rules"); // default env has no keys
  });
});
