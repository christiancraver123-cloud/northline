import { afterEach, describe, expect, it, vi } from "vitest";
import { FileRepo } from "@/lib/db/file-store";
import { enqueue, unblockTask, retryTask, cancelTask } from "@/lib/agents/ops/service";
import { processQueue, reclaimExpired } from "@/lib/agents/ops/worker";
import { backoffMs, classifyFailure, jobStage, planFailure, stageAllows } from "./durable";
import { ProviderError } from "@/lib/providers/types";

afterEach(() => vi.unstubAllEnvs());
const on = () => vi.stubEnv("NORTHLINE_DURABLE_JOBS", "on");
const mk = (repo: FileRepo, kind: string, input: Record<string, unknown> = {}, createdBy = "operator") => enqueue(repo, { agentId: "ORCHESTRATOR", kind, title: kind, input, createdBy, origin: "demo" });
const task = async (repo: FileRepo, id: string) => (await repo.get("agentTasks", id))!;
const HOUR = 3_600_000;

describe("durable jobs: pure policy", () => {
  it("classifies failures; only transient failures retry", () => {
    expect(classifyFailure(new ProviderError("openai", "x", false, "quota_exceeded"))).toEqual({ class: "quota", retry: false });
    expect(classifyFailure(new ProviderError("openai", "x", true, "auth"))).toEqual({ class: "auth", retry: false });
    expect(classifyFailure(new ProviderError("openai", "x", true, "timeout"))).toEqual({ class: "transient", retry: true });
    expect(classifyFailure(new Error("Budget limit: daily image cap reached"))).toEqual({ class: "budget", retry: false });
    expect(classifyFailure(new Error("something weird"))).toEqual({ class: "unknown", retry: false });
  });
  it("backoff is exponential and capped", () => {
    expect([1, 2, 3].map((n) => backoffMs(n))).toEqual([30_000, 60_000, 120_000]);
    expect(backoffMs(20)).toBe(1800_000);
  });
  it("generation kinds never auto-requeue", () => {
    const e = new ProviderError("openai", "x", true, "timeout");
    expect(planFailure({ kind: "production.create", attempts: 1, maxAttempts: 3 }, e, new Date(), { noRequeue: true }).status).toBe("FAILED");
    expect(planFailure({ kind: "system.flaky", attempts: 1, maxAttempts: 3 }, e, new Date(), { noRequeue: false }).status).toBe("QUEUED");
    expect(planFailure({ kind: "system.flaky", attempts: 3, maxAttempts: 3 }, e, new Date(), { noRequeue: false }).status).toBe("FAILED");
  });
  it("stage gate is cumulative and conservative; default stage is 1", () => {
    expect(jobStage({})).toBe(1); expect(jobStage({ NORTHLINE_JOB_STAGE: "9" })).toBe(1);
    expect(stageAllows(1, { kind: "system.noop", createdBy: "n8n" }).ok).toBe(true);
    expect(stageAllows(1, { kind: "identity_qa.attempt", createdBy: "operator" }).ok).toBe(false);
    expect(stageAllows(2, { kind: "identity_qa.attempt", createdBy: "operator" }).ok).toBe(true);
    expect(stageAllows(2, { kind: "production.create", createdBy: "operator" }).ok).toBe(false);
    expect(stageAllows(3, { kind: "production.create", createdBy: "operator" }).ok).toBe(true);
    expect(stageAllows(3, { kind: "production.create", createdBy: "schedule:x" }).ok).toBe(false);
    expect(stageAllows(4, { kind: "production.create", createdBy: "schedule:x" }).ok).toBe(true);
    expect(stageAllows(4, { kind: "strategist.unknown", createdBy: "operator" }).ok).toBe(false);
  });
});

describe("durable jobs: worker semantics", () => {
  it("flag OFF keeps legacy behaviour: a failure is FAILED immediately, no durable columns written", async () => {
    const repo = new FileRepo(null), t = await mk(repo, "system.flaky", { succeedOnAttempt: 2 });
    await processQueue(repo, { background: true });
    const x = await task(repo, t.id);
    expect(x.status).toBe("FAILED"); expect(x.failureClass).toBeUndefined();
  });
  it("transient failure → QUEUED with run_after; not re-run early; succeeds later; every attempt is in history", async () => {
    on(); const repo = new FileRepo(null), t = await mk(repo, "system.flaky", { succeedOnAttempt: 2 });
    const t0 = new Date();
    await processQueue(repo, { background: true, now: t0 });
    let x = await task(repo, t.id);
    expect(x).toMatchObject({ status: "QUEUED", attempts: 1, failureClass: "transient" });
    expect(new Date(x.runAfter!).getTime()).toBeGreaterThan(t0.getTime());
    await processQueue(repo, { background: true, now: t0 }); // too early
    expect((await task(repo, t.id)).attempts).toBe(1);
    await processQueue(repo, { background: true, now: new Date(t0.getTime() + HOUR) });
    x = await task(repo, t.id);
    expect(x.status).toBe("COMPLETE"); expect(x.attempts).toBe(2);
    const runs = (await repo.list("agentRuns")).filter((r) => r.taskId === t.id);
    expect(runs.map((r) => r.state)).toEqual(["FAILED", "COMPLETE"]);
  });
  it("attempts are bounded", async () => {
    on(); const repo = new FileRepo(null), t = await mk(repo, "system.flaky", { succeedOnAttempt: 99 });
    for (let i = 0; i < 6; i++) await processQueue(repo, { background: true, now: new Date(Date.now() + (i + 1) * HOUR) });
    const x = await task(repo, t.id);
    expect(x.status).toBe("FAILED"); expect(x.attempts).toBe(3); expect(x.error).toMatch(/gave up after 3/);
  });
  it("permanent failure is not retried; quota-class failure BLOCKS with a reason until an operator unblocks", async () => {
    on(); const repo = new FileRepo(null);
    const f = await mk(repo, "system.fail"), b = await mk(repo, "system.blocked");
    await processQueue(repo, { background: true });
    expect(await task(repo, f.id)).toMatchObject({ status: "FAILED", failureClass: "invalid", attempts: 1 });
    const bx = await task(repo, b.id);
    expect(bx).toMatchObject({ status: "BLOCKED", failureClass: "quota", attempts: 1 }); expect(bx.blockedReason).toMatch(/quota/);
    await processQueue(repo, { background: true, now: new Date(Date.now() + HOUR) });
    expect((await task(repo, b.id)).attempts).toBe(1); // BLOCKED tasks are never picked up
    await unblockTask(repo, b.id);
    expect(await task(repo, b.id)).toMatchObject({ status: "QUEUED", blockedReason: null });
    await cancelTask(repo, b.id);
    expect((await task(repo, b.id)).status).toBe("CANCELLED");
  });
  it("operator retry of a failed task grants a fresh attempt allowance and keeps history", async () => {
    on(); const repo = new FileRepo(null), t = await mk(repo, "system.fail");
    await processQueue(repo, { background: true });
    await retryTask(repo, t.id);
    expect(await task(repo, t.id)).toMatchObject({ status: "QUEUED", attempts: 0 });
    await processQueue(repo, { background: true });
    expect((await repo.list("agentRuns")).filter((r) => r.taskId === t.id).length).toBe(2);
  });
  it("stage gate: the background worker leaves non-stage jobs QUEUED and untouched; generation never starts at stage 1-2", async () => {
    on(); vi.stubEnv("NORTHLINE_JOB_STAGE", "1");
    const repo = new FileRepo(null);
    const qa = await mk(repo, "identity_qa.review", { productionId: "x" }), gen = await mk(repo, "production.create", { request: {} }), sys = await mk(repo, "system.noop");
    const r = await processQueue(repo, { background: true });
    expect(r.ran.map((x) => x.taskId)).toEqual([sys.id]);
    expect(await task(repo, qa.id)).toMatchObject({ status: "QUEUED", attempts: 0 });
    expect(await task(repo, gen.id)).toMatchObject({ status: "QUEUED", attempts: 0 });
    vi.stubEnv("NORTHLINE_JOB_STAGE", "2");
    await processQueue(repo, { background: true });
    expect((await task(repo, qa.id)).attempts).toBe(1);
    expect(await task(repo, gen.id)).toMatchObject({ status: "QUEUED", attempts: 0 });
  });
  it("n8n/schedule generation tasks never start while autonomous generation is off, even at stage 5; operator ones do", async () => {
    on(); vi.stubEnv("NORTHLINE_JOB_STAGE", "5");
    const repo = new FileRepo(null);
    const n8n = await mk(repo, "production.create", { request: {} }, "n8n"), sch = await mk(repo, "production.regenerate", {}, "schedule:1");
    await processQueue(repo, { background: true });
    expect((await task(repo, n8n.id)).attempts).toBe(0); expect((await task(repo, sch.id)).attempts).toBe(0);
  });
  it("crash recovery: an expired lease is reclaimed with backoff (stuck), bounded, and generation is never requeued", async () => {
    on(); const repo = new FileRepo(null), past = new Date(Date.now() - HOUR).toISOString();
    const a = await mk(repo, "system.noop"), b = await mk(repo, "system.noop"), g = await mk(repo, "production.create");
    await repo.update("agentTasks", a.id, { status: "RUNNING", claimedBy: "dead", leaseExpiresAt: past, attempts: 1 });
    await repo.update("agentTasks", b.id, { status: "RUNNING", claimedBy: "dead", leaseExpiresAt: past, attempts: 3 });
    await repo.update("agentTasks", g.id, { status: "RUNNING", claimedBy: "dead", leaseExpiresAt: past, attempts: 1 });
    expect(await reclaimExpired(repo)).toBe(3);
    const ax = await task(repo, a.id);
    expect(ax).toMatchObject({ status: "QUEUED", failureClass: "stuck", claimedBy: null }); expect(new Date(ax.runAfter!).getTime()).toBeGreaterThan(Date.now());
    expect((await task(repo, b.id)).status).toBe("FAILED");
    expect((await task(repo, g.id)).status).toBe("FAILED");
  });
  it("atomic claim: two concurrent workers run a task exactly once", async () => {
    on(); const repo = new FileRepo(null), t = await mk(repo, "system.slow", { ms: 20 });
    await Promise.all([processQueue(repo, { background: true }), processQueue(repo, { background: true })]);
    expect((await task(repo, t.id)).attempts).toBe(1);
    expect((await repo.list("agentRuns")).filter((r) => r.taskId === t.id).length).toBe(1);
  });
  it("idempotency: the same key returns the same task", async () => {
    const repo = new FileRepo(null);
    const a = await enqueue(repo, { agentId: "ORCHESTRATOR", kind: "system.noop", title: "x", idempotencyKey: "k1", origin: "demo" });
    const b = await enqueue(repo, { agentId: "ORCHESTRATOR", kind: "system.noop", title: "x", idempotencyKey: "k1", origin: "demo" });
    expect(b.id).toBe(a.id); expect((await repo.list("agentTasks")).length).toBe(1);
  });
  it("heartbeat keeps a healthy long job's lease alive", async () => {
    on(); vi.stubEnv("AGENT_LEASE_SEC", "3");
    const repo = new FileRepo(null), t = await mk(repo, "system.slow", { ms: 2600 });
    const run = processQueue(repo, { background: true });
    await new Promise((r) => setTimeout(r, 1800));
    const mid = await task(repo, t.id);
    expect(mid.status).toBe("RUNNING"); expect(mid.heartbeatAt).not.toBe(mid.startedAt);
    await run;
    expect((await task(repo, t.id)).status).toBe("COMPLETE");
  }, 15000);
  it("a job is never run by a generation-provider call: system jobs make no provider calls", async () => {
    on(); const repo = new FileRepo(null); await mk(repo, "system.noop");
    await processQueue(repo, { background: true });
    expect((await repo.list("providerJobs")).length).toBe(0); expect((await repo.list("llmCalls")).length).toBe(0);
  });
});
