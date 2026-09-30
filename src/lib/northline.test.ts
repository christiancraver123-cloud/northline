import { describe, expect, it } from "vitest";
import { ROSTER, ROSTER_BY_CODE } from "@/lib/talent/roster";
import { identityBlock, identityQa } from "@/lib/agents/identity";
import { parseIntent } from "@/lib/orchestrator/intent";
import { planRequest } from "@/lib/orchestrator/plan";
import { executeCreate, retryAsset, type Deps } from "@/lib/orchestrator/execute";
import { approvalBlockers, decide } from "@/lib/orchestrator/approvals";
import { suggestSlot } from "@/lib/orchestrator/schedule";
import { FileRepo } from "@/lib/db/file-store";
import { mockImage, mockVideo } from "@/lib/providers/mock";
import { localStorageProvider } from "@/lib/providers/storage";
import { CreateRequestSchema } from "@/lib/orchestrator/contracts";
import { ProviderError } from "@/lib/providers/types";

const deps: Deps = { image: mockImage, video: mockVideo, storage: localStorageProvider, origin: "demo" };
const fresh = () => new FileRepo(null);

describe("canonical roster", () => {
  it("has exactly six canonical creators", () => {
    expect(ROSTER.map((t) => `${t.code}:${t.name}`)).toEqual([
      "SIE:Sienna Veyra", "ALE:Alessia Varenne", "MIL:Mila Calloway", "VES:Vesper Laurent", "ZOE:Zoe Avell", "SKY:Skye Halston",
    ]);
  });
  it("Vesper's heterochromia orientation is correct and never reversed", () => {
    const v = ROSTER_BY_CODE.VES;
    expect(v.identity.eyes).toMatch(/LEFT side of image = emerald green/);
    expect(v.identity.eyes).toMatch(/RIGHT side of image = icy blue-gray/);
    expect(v.identity.eyes).toMatch(/her left eye is icy blue-gray/);
  });
  it("every creator's own identity block passes their own QA", () => {
    for (const t of ROSTER) expect(identityQa(t.code, identityBlock(t.code)), t.code).toEqual({ ok: true, issues: [] });
  });
  it("identity QA flags drift", () => {
    expect(identityQa("VES", "Vesper with gold hoops and blue eyes").ok).toBe(false);
    expect(identityQa("ALE", "Alessia, long flowing waves, hoops").ok).toBe(false);
    expect(identityQa("MIL", "Mila with red hair").issues.join()).toMatch(/red hair/);
  });
});

describe("intent + plan", () => {
  it("parses the flagship request", () => {
    const r = parseIntent("Create a Miami weekend campaign for Sienna and Zoe.").request!;
    expect(r.talent.sort()).toEqual(["SIE", "ZOE"]);
    expect(r.format).toBe("CAMPAIGN");
    expect(r.concept.toLowerCase()).toContain("miami weekend");
  });
  it("parses quantity and all-six", () => {
    expect(parseIntent("Give Sienna three Miami nightlife posts").request).toMatchObject({ talent: ["SIE"], format: "POST", quantity: 3 });
    expect(parseIntent("Build a six-creator summer campaign").request!.talent).toHaveLength(6);
  });
  it("refuses to guess with no creator", () => {
    expect(parseIntent("make something cool").request).toBeNull();
  });
  it("campaign plan produces per-creator productions plus a shared reel", () => {
    const plan = planRequest(CreateRequestSchema.parse({ talent: ["SIE", "ZOE"], format: "COLLAB", concept: "Miami wellness weekend" }));
    expect(plan.campaign?.scope).toBe("DUO");
    expect(plan.productions.map((p) => p.contentType)).toEqual(["CAROUSEL", "STORY", "CAROUSEL", "STORY", "REEL"]);
    expect(plan.tasks.at(-1)?.agent).toBe("HUMAN");
  });
  it("accepts the n8n payload shape (talent as string)", () => {
    const r = CreateRequestSchema.parse({ talent: "SIE", platform: "instagram", format: "CAROUSEL", concept: "Pilates to coffee run", asset_count: 6 });
    expect(r.talent).toEqual(["SIE"]);
  });
});

describe("production pipeline", () => {
  it("creates a carousel production through to the approval queue", async () => {
    const repo = fresh();
    const res = await executeCreate(repo, { talent: ["SIE"], format: "CAROUSEL", concept: "Pilates to coffee run", asset_count: 6 }, deps);
    expect(res.productions[0].code).toMatch(/^SIE-\d{4}-001$/);
    expect(res.productions[0].status).toBe("REVIEW");
    expect(await repo.list("assets")).toHaveLength(6);
    expect(await repo.list("prompts")).toHaveLength(6);
    const approvals = await repo.list("approvals");
    expect(approvals).toHaveLength(1);
    expect(approvals[0].state).toBe("PENDING");
    expect((await repo.list("assets"))[0].filename).toMatch(/^SIE-\d{4}-001_IMG-\d\d_RAW\.png$/);
  });
  it("sequences production IDs per creator", async () => {
    const repo = fresh();
    await executeCreate(repo, { talent: ["VES"], format: "POST", concept: "a" }, deps);
    const r = await executeCreate(repo, { talent: ["VES", "SKY"], format: "POST", concept: "b" }, deps);
    expect(r.productions.map((p) => p.code.slice(0, 3))).toEqual(["VES", "SKY"]);
    expect(r.productions[0].code.endsWith("002")).toBe(true);
    expect(r.productions[1].code.endsWith("001")).toBe(true);
  });
  it("Reel: still first, video stage pending", async () => {
    const repo = fresh();
    const r = await executeCreate(repo, { talent: ["VES"], format: "REEL", concept: "rooftop party" }, deps);
    expect(r.productions[0].status).toBe("RAW");
    const prod = (await repo.list("productions"))[0];
    expect(prod.brief?.reel?.higgsfieldPrompt).toMatch(/image-left eye emerald green/);
  });
  it("a failed asset is retried individually without recreating the production", async () => {
    const repo = fresh();
    let calls = 0;
    const flaky = { name: "flaky", async generate(r: Parameters<typeof mockImage.generate>[0]) { if (++calls === 2) throw new ProviderError("flaky", "boom"); return mockImage.generate(r); } };
    const res = await executeCreate(repo, { talent: ["ZOE"], format: "CAROUSEL", concept: "matcha", asset_count: 3 }, { ...deps, image: flaky });
    expect(res.failures).toHaveLength(1);
    expect(res.productions[0].status).toBe("RAW");
    const failed = (await repo.list("assets")).find((a) => a.status === "FAILED")!;
    await retryAsset(repo, failed.id, { ...deps, image: flaky });
    expect((await repo.list("productions"))[0].status).toBe("REVIEW");
    expect((await repo.list("productions"))).toHaveLength(1);
    expect((await repo.list("providerJobs")).filter((j) => j.state === "FAILED")).toHaveLength(1);
  });
});

describe("approvals", () => {
  async function setup() {
    const repo = fresh();
    await executeCreate(repo, { talent: ["SIE"], format: "POST", concept: "beach" }, deps);
    for (const c of ["SIE"] as const) await repo.insert("launchStates", { talent: c, accountCreated: false, handle: null, bioDone: false, aiDisclosure: false, profilePicture: false, masterFace: false, referencesDone: false, initialContent: false, approved: false });
    const [ap] = await repo.list("approvals");
    return { repo, ap, prodId: ap.productionId };
  }
  it("blocks approval until AI/virtual disclosure is confirmed", async () => {
    const { repo, ap, prodId } = await setup();
    expect((await approvalBlockers(repo, prodId)).join()).toMatch(/disclosure/);
    await expect(decide(repo, ap.id, "APPROVED")).rejects.toThrow(/disclosure/);
  });
  it("approves, renames assets, and suggests a calendar slot — without publishing", async () => {
    const { repo, ap, prodId } = await setup();
    const [ls] = await repo.list("launchStates");
    await repo.update("launchStates", ls.id, { aiDisclosure: true });
    await decide(repo, ap.id, "APPROVED", "looks good");
    expect((await repo.get("productions", prodId))!.status).toBe("APPROVED");
    const assets = await repo.list("assets");
    expect(assets.every((a) => a.filename.endsWith("_APPROVED.png") && a.publication === "UNPUBLISHED")).toBe(true);
    const cal = await repo.list("calendarEntries");
    expect(cal).toHaveLength(1);
    expect(cal[0].state).toBe("APPROVED");
  });
  it("requires a reason for revisions and supports reject", async () => {
    const { repo, ap, prodId } = await setup();
    await expect(decide(repo, ap.id, "REVISION_REQUESTED", "")).rejects.toThrow(/reason/);
    await decide(repo, ap.id, "REJECTED", "off-brand");
    expect((await repo.get("productions", prodId))!.status).toBe("REJECTED");
  });
});

describe("scheduling rules", () => {
  it("keeps creators 90+ minutes apart and one post per creator per day", () => {
    const first = suggestSlot([], "SIE");
    const second = suggestSlot([{ talent: "SIE", ...first }], "ZOE");
    expect(second.date).toBe(first.date);
    expect(second.time).not.toBe(first.time);
    const again = suggestSlot([{ talent: "SIE", ...first }], "SIE");
    expect(again.date).not.toBe(first.date);
  });
});
