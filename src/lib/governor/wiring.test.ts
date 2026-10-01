// Governor WIRING: the real pipeline (executeCreate / regenerateProduction / worker) against a counting provider.
// The key invariants: a refusal makes ZERO provider calls; release only for non-billable failures; every decision is audited; fail closed.
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileRepo } from "@/lib/db/file-store";
import type { Repo } from "@/lib/db/repo";
import { mockVideo } from "@/lib/providers/mock";
import { ProviderError, type ImageProvider, type StorageProvider } from "@/lib/providers/types";
import { executeCreate, type Deps } from "@/lib/orchestrator/execute";
import { regenerateProduction } from "@/lib/pipeline/revise";
import { generationHold, holdForTask, guardImage } from "./service";
import { RepoGovernorStore } from "./repo-store";
import { pngBytes } from "@/test/png";

afterEach(() => vi.unstubAllEnvs());
const mem = (): StorageProvider => { const f = new Map<string, Uint8Array>(); return { async save(p, b) { f.set(p, b); return p; }, async read(p) { const b = f.get(p); return b ? { bytes: b, mime: "image/png" } : null; } }; };
const counting = (fail?: ProviderError): ImageProvider & { calls: number } => {
  const p = { name: "openai", model: "t", calls: 0, async generate() { p.calls++; if (fail) throw fail; return { provider: "openai", model: "t", bytes: pngBytes(), mime: "image/png", costUsd: null, credits: null, externalId: null, metadata: {} }; } };
  return p as never;
};
const deps = (image: ImageProvider): Deps => ({ image, video: mockVideo, storage: mem(), origin: "demo" });
const SEED = (repo: Repo, o: { global?: number; sie?: number; openai?: number; paused?: boolean; perProduction?: number; perAsset?: number; skipFlag?: boolean } = {}) => (async () => {
  if (!o.skipFlag) await repo.insert("systemFlags", { key: "emergency_pause", enabled: !!o.paused, reason: o.paused ? "test" : null, setBy: null, setAt: null });
  const lim = (scope: "global" | "creator" | "provider", scopeKey: string, metric: "images_per_day" | "attempts_per_asset" | "attempts_per_production", limitValue: number) => repo.insert("budgetLimits", { scope, scopeKey, metric, limitValue, enabled: true, note: null });
  if (o.global !== undefined) await lim("global", "", "images_per_day", o.global);
  if (o.sie !== undefined) await lim("creator", "SIE", "images_per_day", o.sie);
  if (o.openai !== undefined) await lim("provider", "openai", "images_per_day", o.openai);
  if (o.perProduction !== undefined) await lim("global", "", "attempts_per_production", o.perProduction);
  if (o.perAsset !== undefined) await lim("global", "", "attempts_per_asset", o.perAsset);
})();
const used = async (repo: Repo) => Object.fromEntries((await repo.list("budgetCounters")).map((c) => [`${c.scope}:${c.scopeKey}`, c.used]));
const decisions = async (repo: Repo) => (await repo.list("budgetDecisions")).map((d) => d.decision);
const create = (repo: Repo, d: Deps) => executeCreate(repo, { talent: ["SIE"], format: "CAROUSEL", concept: "cafe" } as never, d);

describe("governor wiring", () => {
  it("flag OFF: generation is unchanged and no budget rows are written", async () => {
    const repo = new FileRepo(null), img = counting();
    await create(repo, deps(img));
    expect(img.calls).toBeGreaterThan(0);
    expect((await repo.list("budgetDecisions")).length).toBe(0);
    expect((await repo.list("budgetCounters")).length).toBe(0);
  });
  it("flag OFF still honours the NORTHLINE_PAUSE env override (zero provider calls)", async () => {
    vi.stubEnv("NORTHLINE_PAUSE", "true");
    const repo = new FileRepo(null), img = counting();
    await create(repo, deps(img));
    expect(img.calls).toBe(0);
    expect((await repo.list("providerJobs")).every((j) => j.failureCategory === "budget_blocked")).toBe(true);
  });
  it("flag ON: the global cap stops provider calls exactly at the limit and every decision is audited", async () => {
    vi.stubEnv("NORTHLINE_GOVERNOR", "on");
    const repo = new FileRepo(null), img = counting();
    await SEED(repo, { global: 2, sie: 6, openai: 10 });
    await create(repo, deps(img));
    expect(img.calls).toBe(2);
    expect(await used(repo)).toMatchObject({ "global:": 2, "creator:SIE": 2, "provider:openai": 2 });
    const jobs = await repo.list("providerJobs");
    expect(jobs.filter((j) => j.failureCategory === "budget_blocked").length).toBe(jobs.length - 2);
    const d = await repo.list("budgetDecisions");
    const blocked = d.find((x) => x.decision === "BLOCKED")!;
    expect(blocked).toMatchObject({ metric: "images_per_day", scope: "global", limitValue: 2, usedBefore: 2, requested: 1, creator: "SIE", provider: "openai" });
    expect(blocked.blockedReason).toMatch(/IMAGES_PER_DAY/);
    expect(blocked.productionId).toBeTruthy(); expect(blocked.jobId).toBeTruthy();
    expect(d.filter((x) => x.decision === "ALLOWED").length).toBe(2 * 3); // 3 scopes per allowed image
    expect(d.filter((x) => x.decision === "SETTLED_BILLABLE").length).toBe(2 * 3);
  });
  it("per-creator cap applies even when the global cap has room", async () => {
    vi.stubEnv("NORTHLINE_GOVERNOR", "on");
    const repo = new FileRepo(null), img = counting();
    await SEED(repo, { global: 10, sie: 1, openai: 10 });
    await create(repo, deps(img));
    expect(img.calls).toBe(1);
    expect(await used(repo)).toMatchObject({ "global:": 1, "creator:SIE": 1 });
  });
  it("non-billable failure RELEASES the reservation; unknown/timeout stays counted", async () => {
    vi.stubEnv("NORTHLINE_GOVERNOR", "on");
    const a = new FileRepo(null);
    await SEED(a, { global: 10, sie: 6, openai: 10 });
    await create(a, deps(counting(new ProviderError("openai", "quota", false, "quota_exceeded"))));
    expect(Object.values(await used(a)).every((n) => n === 0)).toBe(true);
    expect(await decisions(a)).toContain("RELEASED");
    const b = new FileRepo(null);
    await SEED(b, { global: 10, sie: 6, openai: 10 });
    const img = counting(new ProviderError("openai", "timed out", true, "timeout"));
    await create(b, deps(img));
    expect((await used(b))["global:"]).toBe(img.calls); // every timed-out call stays counted
    expect(img.calls).toBeGreaterThan(0);
    expect(await decisions(b)).toContain("SETTLED_UNKNOWN");
    expect(await decisions(b)).not.toContain("RELEASED");
  });
  it("DB emergency pause: zero provider calls, audited", async () => {
    vi.stubEnv("NORTHLINE_GOVERNOR", "on");
    const repo = new FileRepo(null), img = counting();
    await SEED(repo, { global: 10, sie: 6, openai: 10, paused: true });
    await create(repo, deps(img));
    expect(img.calls).toBe(0);
    expect((await repo.list("budgetDecisions")).every((d) => d.decision === "BLOCKED" && /EMERGENCY_PAUSE/.test(d.blockedReason ?? ""))).toBe(true);
  });
  it("NORTHLINE_PAUSE env wins over a DB flag that says not paused", async () => {
    vi.stubEnv("NORTHLINE_GOVERNOR", "on"); vi.stubEnv("NORTHLINE_PAUSE", "1");
    const repo = new FileRepo(null), img = counting();
    await SEED(repo, { global: 10, sie: 6, openai: 10, paused: false });
    await create(repo, deps(img));
    expect(img.calls).toBe(0);
  });
  it("fails CLOSED when governor state is missing (migration not applied / no limits)", async () => {
    vi.stubEnv("NORTHLINE_GOVERNOR", "on");
    const noFlag = new FileRepo(null), i1 = counting();
    await SEED(noFlag, { global: 10, skipFlag: true });
    await create(noFlag, deps(i1));
    expect(i1.calls).toBe(0);
    const noLimits = new FileRepo(null), i2 = counting();
    await SEED(noLimits, {});
    await create(noLimits, deps(i2));
    expect(i2.calls).toBe(0);
  });
  it("fails CLOSED when the audit row cannot be written, and gives the reservation back", async () => {
    vi.stubEnv("NORTHLINE_GOVERNOR", "on");
    const repo = new FileRepo(null);
    await SEED(repo, { global: 10, sie: 6, openai: 10 });
    const broken = new Proxy(repo, { get: (t, k, r) => (k === "insert" ? (tbl: string, ...a: unknown[]) => (tbl === "budgetDecisions" ? Promise.reject(new Error("db down")) : (t.insert as (...x: unknown[]) => unknown).call(t, tbl, ...a)) : Reflect.get(t, k, r)) }) as Repo;
    const g = await guardImage(broken, { creator: "SIE", provider: "openai" });
    expect(g.allowed).toBe(false);
    expect(Object.values(await used(repo)).every((n) => n === 0)).toBe(true);
  });
  it("concurrent reservations never exceed the cap", async () => {
    const repo = new FileRepo(null);
    await SEED(repo, { global: 5 });
    const s = new RepoGovernorStore(repo), ref = { metric: "images_per_day" as const, scope: "global" as const, scopeKey: "", windowKey: "2026-10-01" };
    const r = await Promise.all(Array.from({ length: 30 }, () => s.incrementIfBelow(ref, 5)));
    expect(r.filter((x) => x.ok).length).toBe(5);
    expect(await s.getUsed(ref)).toBe(5);
  });
  it("attempt cap blocks a regeneration BEFORE any attempt/brief/provider call is created", async () => {
    vi.stubEnv("NORTHLINE_GOVERNOR", "on");
    const repo = new FileRepo(null), img = counting();
    await SEED(repo, { global: 50, sie: 50, openai: 50, perProduction: 1 });
    const res = await create(repo, deps(img));
    const pid = (await repo.list("productions"))[0].id;
    const before = { attempts: (await repo.list("generationAttempts")).length, briefs: (await repo.list("generationBriefs")).length, calls: img.calls };
    void res;
    await expect(regenerateProduction(repo, deps(img), pid, {})).rejects.toThrow(/Budget limit.*ATTEMPTS|Budget limit.*attempt/i);
    expect({ attempts: (await repo.list("generationAttempts")).length, briefs: (await repo.list("generationBriefs")).length, calls: img.calls }).toEqual(before);
    expect((await repo.list("budgetDecisions")).some((d) => d.decision === "BLOCKED" && d.metric === "attempts_per_production")).toBe(true);
  });
  it("autonomous generation is disabled by default; operator-created work is not held; pause holds everything", async () => {
    const repo = new FileRepo(null);
    expect(await generationHold(repo)).toBeNull();
    const gen = { kind: "production.create" };
    expect(holdForTask({ ...gen, createdBy: "n8n" }, null)).toMatch(/Autonomous generation is DISABLED/);
    expect(holdForTask({ ...gen, createdBy: "schedule:abc" }, null)).toMatch(/DISABLED/);
    expect(holdForTask({ ...gen, createdBy: "operator" }, null)).toBeUndefined();
    expect(holdForTask({ kind: "identity_qa.attempt", createdBy: "n8n" }, null)).toBeUndefined();
    expect(holdForTask({ ...gen, createdBy: "operator" }, "paused")).toBe("paused");
    vi.stubEnv("NORTHLINE_AUTONOMOUS_GENERATION", "on");
    expect(holdForTask({ ...gen, createdBy: "n8n" }, null)).toBeUndefined();
    vi.stubEnv("NORTHLINE_PAUSE", "true");
    expect(await generationHold(repo)).toMatch(/NORTHLINE_PAUSE/);
  });
});
