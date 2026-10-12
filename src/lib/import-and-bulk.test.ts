// Manual-first import, replacement, bulk review (DENY ALL / approve), drag-to-state. Hermetic: no network, no generation provider.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileRepo } from "@/lib/db/file-store";
import type { StorageProvider } from "@/lib/providers/types";
import { ProviderError } from "@/lib/providers/types";
import { mockVideo } from "@/lib/providers/mock";
import type { Deps } from "@/lib/pipeline/deps";
import { importAsset, ImportError, MANUAL_UPLOAD, validateImage } from "@/lib/pipeline/import";
import { BulkError, decideMany, moveCard, visibleQueue } from "@/lib/orchestrator/bulk";
import { pngBytes } from "@/test/png";

const memStore = (): StorageProvider & { files: Map<string, Uint8Array> } => { const files = new Map<string, Uint8Array>(); return { files, async save(p, b) { files.set(p, b); return p; }, async read(p) { const b = files.get(p); return b ? { bytes: b, mime: "image/png" } : null; } }; };
/** A generation provider that must never be called by imports. */
const noGen = { name: "openai", model: "x", async generate(): Promise<never> { throw new ProviderError("openai", "generation must not be called for imports", false, "provider_unavailable"); } };
const deps = (st = memStore()): Deps & { storage: ReturnType<typeof memStore> } => ({ image: noGen, video: mockVideo, storage: st, origin: "demo" }) as never;
const disclose = async (r: FileRepo, ...codes: string[]) => { for (const c of codes) await r.insert("launchStates", { talent: c as never, accountCreated: true, handle: null, bioDone: true, aiDisclosure: true, profilePicture: true, masterFace: true, referencesDone: true, initialContent: false, approved: true }); };

let fetchSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => { fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("network not allowed"); }); });
afterEach(() => { expect(fetchSpy).not.toHaveBeenCalled(); fetchSpy.mockRestore(); });

describe("manual import (no prompt, no generation provider)", () => {
  it("stores the image for the chosen creator, marks lineage MANUAL_UPLOAD and puts it in the approval queue", async () => {
    const repo = new FileRepo(null), d = deps();
    await disclose(repo, "ZOE");
    const r = await importAsset(repo, d, { talent: "ZOE", bytes: pngBytes(), filename: "../../etc/zoe pool.png", meta: { scene: "Poolside with a green iced drink", caption: "pool day" } });
    expect(r.production.talent).toEqual(["ZOE"]);
    expect(r.asset).toMatchObject({ provider: MANUAL_UPLOAD, isReference: false, promptId: null, status: "RAW", current: true, talent: ["ZOE"] });
    expect(r.asset.storagePath).toMatch(/^ZOE-\d{4}-\d{3}\/ZOE-\d{4}-\d{3}_IMG-01_RAW\.png$/); // server-chosen path, client filename ignored
    expect(d.storage.files.size).toBe(1);
    expect(await repo.list("prompts")).toHaveLength(0);
    expect(await repo.list("providerJobs")).toHaveLength(0); // no generation job at all
    expect(r.status).toBe("REVIEW");
    expect((await repo.list("approvals", { state: "PENDING" })).map((a) => a.productionId)).toEqual([r.production.id]);
    expect((await repo.list("captions", { productionId: r.production.id }))[0].text).toBe("pool day");
    expect(await repo.list("referenceAssets")).toHaveLength(0); // never a canonical reference
    // identity QA is honest: nothing prompted, nothing visually inspected
    const qa = await repo.list("qaResults", { productionId: r.production.id });
    expect(qa.some((q) => q.method === "prompt_rules")).toBe(false);
    expect(qa.find((q) => q.kind === "IDENTITY")?.status).toBe("MANUAL_REVIEW_REQUIRED");
  });
  it("rejects invalid files by content, not by name or declared type", async () => {
    expect(() => validateImage(new Uint8Array())).toThrow(ImportError);
    expect(() => validateImage(new TextEncoder().encode("<script>alert(1)</script>"))).toThrow(/Not a valid image/);
    expect(() => validateImage(pngBytes(), "application/pdf")).toThrow(/Only PNG, JPEG or WebP/);
    expect(() => validateImage(new Uint8Array(11 * 1024 * 1024))).toThrow(/10 MB/);
    const repo = new FileRepo(null);
    await expect(importAsset(repo, deps(), { talent: "ZOE", bytes: new TextEncoder().encode("GIF89a fake"), filename: "x.png" })).rejects.toThrow(ImportError);
    await expect(importAsset(repo, deps(), { talent: "NOPE", bytes: pngBytes(), filename: "x.png" })).rejects.toThrow(/Choose which creator/);
    expect(await repo.list("assets")).toHaveLength(0);
  });
  it("replacement is a new attempt: the old asset stays in history and no reference is touched", async () => {
    const repo = new FileRepo(null), d = deps();
    await disclose(repo, "SIE");
    const first = await importAsset(repo, d, { talent: "SIE", bytes: pngBytes(), filename: "a.png" });
    const second = await importAsset(repo, d, { talent: "SIE", bytes: pngBytes(), filename: "b.png", replaceProductionId: first.production.id });
    expect(second.replaced).toBe(first.asset.id);
    const assets = await repo.list("assets", { productionId: first.production.id });
    expect(assets).toHaveLength(2);
    expect(assets.find((a) => a.id === first.asset.id)).toMatchObject({ current: false });
    expect(assets.find((a) => a.id === second.asset.id)).toMatchObject({ current: true, attemptNo: 2 });
    expect(await repo.list("approvals", { state: "PENDING" })).toHaveLength(1); // same review item, now showing the new image
    await expect(importAsset(repo, d, { talent: "ZOE", bytes: pngBytes(), filename: "c.png", replaceProductionId: first.production.id })).rejects.toThrow(/belongs to SIE/);
    expect(await repo.list("referenceAssets")).toHaveLength(0);
  });
  it("read-only mode blocks uploads", async () => {
    process.env.NORTHLINE_READONLY = "true";
    try { await expect(importAsset(new FileRepo(null), deps(), { talent: "ZOE", bytes: pngBytes(), filename: "x.png" })).rejects.toThrow(/read-only/); }
    finally { delete process.env.NORTHLINE_READONLY; }
  });
});

describe("bulk review", () => {
  async function queue() {
    const repo = new FileRepo(null), d = deps();
    await disclose(repo, "ZOE", "SIE");
    const zoe = [await importAsset(repo, d, { talent: "ZOE", bytes: pngBytes(), filename: "1.png" }), await importAsset(repo, d, { talent: "ZOE", bytes: pngBytes(), filename: "2.png" })];
    const sie = await importAsset(repo, d, { talent: "SIE", bytes: pngBytes(), filename: "3.png" });
    const ap = async (pid: string) => (await repo.list("approvals", { productionId: pid }))[0].id;
    return { repo, zoe: await Promise.all(zoe.map((z) => ap(z.production.id))), sie: await ap(sie.production.id), zoeAssets: zoe.map((z) => z.asset.id) };
  }
  it("DENY ALL rejects exactly the visible queue, keeps every record, and records who and when", async () => {
    const q = await queue();
    const visible = (await visibleQueue(q.repo, { creator: "ZOE" })).map((a) => a.id);
    expect(visible.sort()).toEqual([...q.zoe].sort()); // select all = the filtered queue
    const r = await decideMany(q.repo, { ids: visible, decision: "REJECTED", notes: "[reasons: anatomy] [bulk deny]", by: "founder", filter: { creator: "ZOE" } });
    expect(r).toMatchObject({ done: expect.arrayContaining(q.zoe), failed: [] });
    for (const id of q.zoe) expect(await q.repo.get("approvals", id)).toMatchObject({ state: "REJECTED", decidedBy: "founder", decidedAt: expect.any(String) });
    expect((await q.repo.get("approvals", q.sie))!.state).toBe("PENDING"); // outside the filter: untouched
    for (const a of q.zoeAssets) expect(await q.repo.get("assets", a)).toMatchObject({ status: "REJECTED" }); // rejected, not deleted
    expect(await q.repo.list("assets")).toHaveLength(3);
  });
  it("refuses the whole bulk action if any id is outside the visible queue", async () => {
    const q = await queue();
    await expect(decideMany(q.repo, { ids: [...q.zoe, q.sie], decision: "REJECTED", by: "founder", filter: { creator: "ZOE" } })).rejects.toThrow(BulkError);
    expect((await q.repo.list("approvals", { state: "PENDING" }))).toHaveLength(3);
  });
  it("bulk approve uses the approval gate per item", async () => {
    const q = await queue();
    const r = await decideMany(q.repo, { ids: [...q.zoe, q.sie], decision: "APPROVED", by: "founder" });
    expect(r.done).toHaveLength(3);
    for (const a of q.zoeAssets) expect(await q.repo.get("assets", a)).toMatchObject({ status: "APPROVED", publication: "UNPUBLISHED" }); // approved-ready, not published
  });
});

describe("drag to state", () => {
  it("drag to Approved runs the approval gate; a QA blocker cannot be bypassed; there is no publish target", async () => {
    const repo = new FileRepo(null), d = deps();
    await disclose(repo, "SIE");
    const a = await importAsset(repo, d, { talent: "SIE", bytes: pngBytes(), filename: "a.png" });
    const b = await importAsset(repo, d, { talent: "SIE", bytes: pngBytes(), filename: "b.png" });
    const apA = (await repo.list("approvals", { productionId: a.production.id }))[0].id, apB = (await repo.list("approvals", { productionId: b.production.id }))[0].id;
    await repo.update("assets", b.asset.id, { qaStatus: "HARD_FAIL" });
    await expect(moveCard(repo, apB, "APPROVED", "founder")).rejects.toThrow(/HARD_FAILED QA/);
    expect((await repo.get("approvals", apB))!.state).toBe("PENDING");
    await expect(moveCard(repo, apA, "PUBLISHED", "founder")).rejects.toThrow(/Publishing is a separate/);
    await moveCard(repo, apA, "APPROVED", "founder");
    expect((await repo.get("assets", a.asset.id))!).toMatchObject({ status: "APPROVED", publication: "UNPUBLISHED" });
    expect(await repo.list("publications")).toHaveLength(0);
    await moveCard(repo, apB, "REJECTED", "founder", "[moved to Rejected]");
    expect(await repo.get("approvals", apB)).toMatchObject({ state: "REJECTED", decidedBy: "founder" });
  });
  it("approval still requires AI disclosure (blockers apply to drag and bulk alike)", async () => {
    const repo = new FileRepo(null), d = deps();
    const a = await importAsset(repo, d, { talent: "MIL", bytes: pngBytes(), filename: "a.png" });
    const ap = (await repo.list("approvals", { productionId: a.production.id }))[0].id;
    await expect(moveCard(repo, ap, "APPROVED", "founder")).rejects.toThrow(/disclosure/);
    const r = await decideMany(repo, { ids: [ap], decision: "APPROVED", by: "founder" });
    expect(r.failed[0].reason).toMatch(/disclosure/);
  });
});
