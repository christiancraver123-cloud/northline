import { describe, expect, it } from "vitest";
import { FileRepo } from "@/lib/db/file-store";
import { mockImage, mockVideo } from "@/lib/providers/mock";
import { localStorageProvider } from "@/lib/providers/storage";
import type { Deps } from "@/lib/orchestrator/execute";
import { decide } from "@/lib/orchestrator/approvals";
import { ensureAgents, enqueue, materializeDueSchedules, resolveApprovalWaits, setPaused, setScheduleEnabled, snapshots } from "./service";
import { processQueue } from "./worker";
import { submitCreate } from "./commands";
import { handleMessage } from "./chat";
import { nextRun, validCron } from "./cron";

const deps: Partial<Deps> = { image: mockImage, video: mockVideo, storage: localStorageProvider };
const fresh = async () => { const r = new FileRepo(null); await ensureAgents(r); return r; };
const status = async (r: FileRepo, code: string) => (await snapshots(r)).find((s) => s.agent.code === code)!;

describe("agent registry & status", () => {
  it("seeds ten persistent agents idempotently, schedules disabled", async () => {
    const r = await fresh(); await ensureAgents(r);
    expect(await r.list("agents")).toHaveLength(10);
    const sch = await r.list("agentSchedules");
    expect(sch.length).toBeGreaterThan(0);
    expect(sch.every((s) => !s.enabled)).toBe(true);
  });
  it("is IDLE with no work and consumes nothing", async () => {
    const r = await fresh();
    expect((await snapshots(r)).every((s) => s.status === "IDLE")).toBe(true);
    const res = await processQueue(r);
    expect(res.ran).toHaveLength(0);
    expect(await r.list("agentRuns")).toHaveLength(0);
  });
  it("derives QUEUED, PAUSED, FAILED, WAITING, SCHEDULED", async () => {
    const r = await fresh();
    await enqueue(r, { agentId: "CONTENT_STRATEGIST", kind: "strategist.concepts", title: "t", input: { talent: "SIE", count: 2 }, talent: "SIE" });
    expect((await status(r, "CONTENT_STRATEGIST")).status).toBe("QUEUED");
    await setPaused(r, "CONTENT_STRATEGIST", true);
    expect((await status(r, "CONTENT_STRATEGIST")).status).toBe("PAUSED");
    await processQueue(r);
    expect((await r.list("agentTasks"))[0].status).toBe("QUEUED"); // paused agents don't run
    await setPaused(r, "CONTENT_STRATEGIST", false);
    await processQueue(r);
    expect((await status(r, "CONTENT_STRATEGIST")).status).toBe("IDLE");
    await enqueue(r, { agentId: "CAPTION_WRITER", kind: "nope.unknown", title: "bad" });
    await processQueue(r);
    const f = await status(r, "CAPTION_WRITER");
    expect(f.status).toBe("FAILED");
    expect(f.lastError).toMatch(/No handler/);
    await enqueue(r, { agentId: "IDENTITY_QA", kind: "approval.wait", title: "w", status: "WAITING" });
    expect((await status(r, "IDENTITY_QA")).status).toBe("WAITING");
    const [s] = await r.list("agentSchedules");
    await setScheduleEnabled(r, s.id, true);
    expect((await status(r, s.agentId)).status).toBe("SCHEDULED");
  });
});

describe("cron + scheduled execution (no browser needed)", () => {
  it("computes next runs", () => {
    expect(validCron("0 14 * * *")).toBe(true);
    expect(validCron("nope")).toBe(false);
    expect(nextRun("0 14 * * *", new Date("2026-10-01T15:00:00Z"))!.toISOString()).toBe("2026-10-02T14:00:00.000Z");
    expect(nextRun("0 15 * * 1", new Date("2026-10-01T00:00:00Z"))!.toISOString()).toBe("2026-10-05T15:00:00.000Z");
    expect(nextRun("*/15 * * * *", new Date("2026-10-01T10:07:00Z"))!.toISOString()).toBe("2026-10-01T10:15:00.000Z");
  });
  it("tick: due schedule -> task -> run -> report; not-due does nothing", async () => {
    const r = await fresh();
    const s = (await r.list("agentSchedules")).find((x) => x.taskKind === "performance.report")!;
    await setScheduleEnabled(r, s.id, true, new Date("2026-10-01T00:00:00Z"));
    expect(await materializeDueSchedules(r, new Date("2026-10-01T00:05:00Z"))).toHaveLength(0);
    const due = await materializeDueSchedules(r, new Date("2026-10-05T15:01:00Z"));
    expect(due).toHaveLength(1);
    const res = await processQueue(r, { trigger: "schedule" });
    expect(res.ran[0].status).toBe("COMPLETE");
    const runs = await r.list("agentRuns");
    expect(runs[0].trigger).toBe("schedule");
    expect(runs[0].tokens).toBeNull(); // no model call was made
    const reports = await r.list("agentReports");
    expect(reports[0].body).toMatch(/no real or manual analytics/i); // honest: nothing fabricated
    expect((await r.get("agentSchedules", s.id))!.lastRunAt).toBeTruthy();
  });
});

describe("production workflow through agents", () => {
  it("logs multi-agent activity, waits for approval, then resolves", async () => {
    const r = await fresh();
    const out = await submitCreate(r, { talent: ["SIE"], format: "POST", concept: "beach" }, { deps, origin: "demo" });
    expect(out.task.status).toBe("COMPLETE");
    const ev = await r.list("agentEvents");
    const agentsSeen = new Set(ev.map((e) => e.agentId));
    for (const a of ["ORCHESTRATOR", "CONTENT_STRATEGIST", "CREATIVE_DIRECTOR", "PROMPT_ENGINEER", "IDENTITY_QA", "CAPTION_WRITER", "PRODUCTION_MANAGER"]) expect(agentsSeen.has(a as never), a).toBe(true);
    expect(ev.some((e) => e.kind === "QA_PASSED")).toBe(true);
    expect((await status(r, "PRODUCTION_MANAGER")).status).toBe("WAITING");
    const [ap] = await r.list("approvals");
    const [ls] = [await r.insert("launchStates", { talent: "SIE", accountCreated: false, handle: null, bioDone: false, aiDisclosure: true, profilePicture: false, masterFace: false, referencesDone: false, initialContent: false, approved: false })];
    expect(ls.aiDisclosure).toBe(true);
    await decide(r, ap.id, "APPROVED", "ok");
    await resolveApprovalWaits(r, ap.productionId, "APPROVED");
    expect((await status(r, "PRODUCTION_MANAGER")).status).toBe("IDLE");
  });
});

describe("operator chat is operational", () => {
  it("answers 'what is everyone doing' from real state", async () => {
    const r = await fresh();
    await submitCreate(r, { talent: ["SIE"], format: "POST", concept: "beach" }, { deps });
    const a = await handleMessage(r, "ORCHESTRATOR", "What is everyone doing?");
    expect(a.reply).toMatch(/Production Manager: WAITING/);
    expect(a.reply).toMatch(/Creative Director: IDLE/);
    expect((await r.list("agentMessages")).map((m) => m.role)).toEqual(["operator", "agent"]);
  });
  it("Prioritize Vesper raises queued tasks and flags her", async () => {
    const r = await fresh();
    await enqueue(r, { agentId: "CONTENT_STRATEGIST", kind: "strategist.concepts", title: "v", input: { talent: "VES" }, talent: "VES", priority: 4 });
    const a = await handleMessage(r, "ORCHESTRATOR", "Prioritize Vesper");
    expect(a.reply).toMatch(/1 queued task/);
    expect((await r.list("agentTasks"))[0].priority).toBe(1);
    expect((await r.list("agents")).find((x) => x.code === "ORCHESTRATOR")!.config.priorityTalent).toEqual(["VES"]);
  });
  it("Pause Skye production holds her tasks; Resume releases them", async () => {
    const r = await fresh();
    await enqueue(r, { agentId: "CONTENT_STRATEGIST", kind: "strategist.concepts", title: "s", input: { talent: "SKY", count: 1 }, talent: "SKY" });
    await enqueue(r, { agentId: "CONTENT_STRATEGIST", kind: "strategist.concepts", title: "z", input: { talent: "ZOE", count: 1 }, talent: "ZOE" });
    expect((await handleMessage(r, "ORCHESTRATOR", "Pause Skye production")).reply).toMatch(/Held production for Skye/);
    const res = await processQueue(r);
    expect(res.ran).toHaveLength(1);
    const tasks = await r.list("agentTasks");
    expect(tasks.find((t) => t.talent === "SKY")!.status).toBe("QUEUED");
    expect(tasks.find((t) => t.talent === "ZOE")!.status).toBe("COMPLETE");
    await handleMessage(r, "ORCHESTRATOR", "Resume Skye production");
    await processQueue(r);
    expect((await r.list("agentTasks")).find((t) => t.talent === "SKY")!.status).toBe("COMPLETE");
  });
  it("delegates 'three concepts for Sienna' to the Creative Director", async () => {
    const r = await fresh();
    const a = await handleMessage(r, "ORCHESTRATOR", "Have the Creative Director create three concepts for Sienna");
    const t = (await r.list("agentTasks"))[0];
    expect(t.agentId).toBe("CREATIVE_DIRECTOR");
    expect((t.output!.directions as unknown[]).length).toBe(3);
    expect(a.taskIds).toEqual([t.id]);
  });
  it("multi-agent assignment consolidates contributions into one report", async () => {
    const r = await fresh();
    const a = await handleMessage(r, "ORCHESTRATOR", "Have Content Strategist, Creative Director and Growth Strategist develop a Sienna campaign");
    const tasks = await r.list("agentTasks");
    expect(tasks).toHaveLength(4);
    expect(tasks.every((t) => t.status === "COMPLETE")).toBe(true);
    const cons = tasks.find((t) => t.kind === "orchestrator.consolidate")!;
    expect(cons.dependsOn).toHaveLength(3);
    const dir = tasks.find((t) => t.kind === "director.concepts")!;
    expect(dir.dependsOn).toHaveLength(1); // built on the strategist's concepts
    expect(a.reportIds).toHaveLength(1);
    expect((await r.get("agentReports", a.reportIds[0]))!.body).toMatch(/3\/3/);
    expect(a.reply).toMatch(/No performance data exists/);
  });
  it("creators report is based on real data and admits missing analytics", async () => {
    const r = await fresh();
    await submitCreate(r, { talent: ["ZOE"], format: "POST", concept: "matcha" }, { deps });
    const a = await handleMessage(r, "ORCHESTRATOR", "Give me a report on all six creators");
    const rep = (await r.get("agentReports", a.reportIds[0]))!;
    for (const n of ["Sienna Veyra", "Alessia Varenne", "Mila Calloway", "Vesper Laurent", "Zoe Avell", "Skye Halston"]) expect(rep.body).toContain(n);
    expect(rep.body).toMatch(/Zoe Avell \(ZOE\).*\n\s+Productions: 1/);
    expect(rep.body).toMatch(/no real analytics data exists/);
    expect(rep.sources).toContain("productions");
  });
  it("explains an Identity QA rejection from stored prompt QA", async () => {
    const r = await fresh();
    const p = await r.insert("productions", { code: "ALE-2026-009", talent: ["ALE"], scope: "SOLO", contentType: "POST", platform: "instagram", concept: "x", status: "IDEA", campaignId: null, storylineId: null, brief: null, qaNotes: ["Shot 1: Forbidden for Alessia: hoops"], costUsd: 0, identityVersion: null, currentAttemptId: null });
    await r.insert("prompts", { productionId: p.id, provider: "mock", version: 1, shotN: 1, positive: "Alessia with hoops", negative: "", identityRefs: [], qa: { ok: false, issues: ["Forbidden for Alessia: hoops"] }, briefId: null, attemptId: null });
    const a = await handleMessage(r, "ORCHESTRATOR", "Why did Identity QA reject ALE-2026-009?");
    expect(a.reply).toMatch(/Forbidden for Alessia: hoops/);
    expect((await handleMessage(r, "ORCHESTRATOR", "Why was ALE-2026-777 rejected?")).reply).toMatch(/can't find/);
  });
  it("create instruction runs the existing production workflow", async () => {
    const r = await fresh();
    const a = await handleMessage(r, "ORCHESTRATOR", "Create a Pilates to coffee carousel for Zoe");
    expect(a.reply).toMatch(/ZOE-\d{4}-001/);
    expect((await r.list("productions"))).toHaveLength(1);
  });
  it("specialist agents stay in role", async () => {
    const r = await fresh();
    expect((await handleMessage(r, "CAPTION_WRITER", "Prioritize Vesper")).reply).toMatch(/outside my role/);
    expect((await handleMessage(r, "CREATIVE_DIRECTOR", "give me two concepts for Mila")).reply).toMatch(/finished/);
    expect((await handleMessage(r, "CREATIVE_DIRECTOR", "what are you doing?")).reply).toMatch(/Creative Director: IDLE/);
  });
});
