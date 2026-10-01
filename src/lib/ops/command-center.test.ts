import { describe, expect, it } from "vitest";
import { buildCommandCenter, NOT_CONFIGURED, UNKNOWN } from "./command-center";
import type { AgentTask, Production, ProviderJob } from "@/lib/db/records";

const now = new Date("2026-10-01T12:00:00Z");
const task = (o: Partial<AgentTask>): AgentTask => ({ id: Math.random().toString(36), origin: "demo", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", agentId: "ORCHESTRATOR", kind: "system.noop", title: "t", input: {}, output: null, status: "QUEUED", priority: 3, dependsOn: [], parentTaskId: null, assignmentId: null, productionId: null, talent: null, createdBy: "operator", claimedBy: null, leaseExpiresAt: null, attempts: 0, idempotencyKey: null, waitingOn: null, runAfter: null, startedAt: null, finishedAt: null, error: null, ...o });
const base = { tasks: [], jobs: [], productions: [], approvalsPending: 0, health: [], storeDriver: "file", now };

describe("command center view-model", () => {
  it("reports UNKNOWN / NOT CONFIGURED instead of inventing values", () => {
    const cc = buildCommandCenter({ ...base, env: {} });
    expect(cc.workers.idle).toBe(UNKNOWN);
    expect(cc.budget.limits).toBe(NOT_CONFIGURED);
    expect(cc.learnings).toBe(NOT_CONFIGURED);
    expect(cc.system).toMatchObject({ governor: "OFF", durableJobs: "OFF", autonomousGeneration: "DISABLED", jobStage: "n/a", migrations: UNKNOWN });
  });
  it("pause: env override is shown; governor ON with unreadable DB is UNKNOWN (not 'not paused')", () => {
    expect(buildCommandCenter({ ...base, env: { NORTHLINE_PAUSE: "true" } }).budget.pause).toMatchObject({ paused: true, source: "env" });
    expect(buildCommandCenter({ ...base, env: { NORTHLINE_GOVERNOR: "on" }, dbPause: "error", budgetLimits: "error" }).budget).toMatchObject({ pause: { paused: UNKNOWN }, limits: UNKNOWN });
    expect(buildCommandCenter({ ...base, env: { NORTHLINE_GOVERNOR: "on" }, dbPause: { enabled: true, reason: "x" }, budgetLimits: [] }).budget.pause).toMatchObject({ paused: true, source: "database" });
  });
  it("counts today's images from provider jobs only (UTC day), by creator and provider", () => {
    const p = { id: "p1", code: "SIE-1", talent: ["SIE"], status: "GENERATING" } as Production;
    const j = (o: Partial<ProviderJob>) => ({ id: Math.random().toString(36), operation: "image.generate", state: "SUCCEEDED", provider: "openai", productionId: "p1", finishedAt: "2026-10-01T08:00:00Z", createdAt: "2026-10-01T08:00:00Z", ...o }) as ProviderJob;
    const cc = buildCommandCenter({ ...base, env: {}, productions: [p], jobs: [j({}), j({}), j({ finishedAt: "2026-09-30T23:59:00Z" }), j({ state: "FAILED" })] });
    expect(cc.budget.imagesToday).toEqual({ total: 2, byCreator: { SIE: 2 }, byProvider: { openai: 2 } });
    expect(cc.productionsInProgress.map((x) => x.code)).toEqual(["SIE-1"]);
  });
  it("queue counts, held tasks (autonomy off / retry scheduled), blocked and failed attention items", () => {
    const tasks = [task({ status: "QUEUED", kind: "production.create", createdBy: "n8n" }), task({ status: "QUEUED", runAfter: "2026-10-01T13:00:00Z" }), task({ status: "BLOCKED", blockedReason: "quota: x", updatedAt: "2026-10-01T11:00:00Z" }), task({ status: "FAILED", error: "boom", finishedAt: "2026-10-01T10:00:00Z" }), task({ status: "RUNNING", claimedBy: "w1", heartbeatAt: "2026-10-01T11:59:00Z" }), task({ status: "COMPLETE", finishedAt: "2026-10-01T09:00:00Z" })];
    const cc = buildCommandCenter({ ...base, env: {}, tasks });
    expect(cc.queue).toMatchObject({ queued: 2, running: 1, blocked: 1, failed: 1, completed: 1, retryScheduled: 1 });
    expect(cc.queue.held.map((h) => h.reason).join("|")).toMatch(/Autonomous generation is DISABLED.*retry scheduled/);
    expect(cc.workers.active).toEqual([{ workerId: "w1", tasks: 1, lastHeartbeat: "2026-10-01T11:59:00Z" }]);
    expect(cc.attention.map((a) => a.kind)).toEqual(["blocked", "task"]);
    expect(cc.recentCompleted).toHaveLength(1);
  });
  it("budget-blocked image jobs are not reported as provider failures", () => {
    const j = { id: "j", operation: "image.generate", state: "FAILED", failureCategory: "budget_blocked", createdAt: "2026-10-01T10:00:00Z", finishedAt: "2026-10-01T10:00:00Z", provider: "openai", productionId: null } as unknown as ProviderJob;
    expect(buildCommandCenter({ ...base, env: {}, jobs: [j] }).attention).toEqual([]);
  });
});
