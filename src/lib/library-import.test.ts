// Library import: stored and recorded, but archived, unreviewed, zero authority, never in Approvals, idempotent.
import { describe, expect, it, vi } from "vitest";
import { FileRepo } from "@/lib/db/file-store";
import { importLibrary, libraryConcept } from "@/lib/pipeline/library";
import { skipReason } from "../../scripts/import-library";
import { pngBytes } from "@/test/png";

const mem = () => { const files = new Map<string, Uint8Array>(); return { files, async save(p: string, b: Uint8Array) { files.set(p, b); return p; }, async read(p: string) { const b = files.get(p); return b ? { bytes: b, mime: "image/png" } : null; } }; };
const variant = (n: number) => { const b = pngBytes(); const c = new Uint8Array(b.length + 4); c.set(b); c.set([0, 0, 0, n], b.length); return c; }; // distinct sha, still a PNG

describe("library import", () => {
  it("stores images as archived, unreviewed library assets: no approvals, no prompts, no jobs, no references; re-run is a no-op", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("no network"); });
    const repo = new FileRepo(null), st = mem();
    const items = [
      { talent: "SIE" as const, bytes: variant(1), filename: "a.png", category: "Photos" },
      { talent: "SIE" as const, bytes: variant(1), filename: "a-dup.png", category: "Originals" },
      { talent: "ZOE" as const, bytes: variant(2), filename: "z.png", category: "References" },
      { talent: "ZOE" as const, bytes: new TextEncoder().encode("not an image"), filename: "bad.png", category: "Photos" },
    ];
    const r = await importLibrary(repo, st, items, { batch: "T", origin: "demo" });
    expect(r).toMatchObject({ imported: 2, skippedDuplicate: 1 });
    expect(r.invalid).toHaveLength(1);
    const prods = await repo.list("productions");
    expect(prods.map((p) => [p.talent[0], p.status, p.concept])).toEqual([["SIE", "ARCHIVED", libraryConcept("T")], ["ZOE", "ARCHIVED", libraryConcept("T")]]);
    const assets = await repo.list("assets");
    expect(assets.every((a) => a.provider === "MANUAL_UPLOAD" && a.isReference === false && a.publication === "UNPUBLISHED" && a.qaStatus === "MANUAL_REVIEW_REQUIRED")).toBe(true);
    for (const t of ["approvals", "prompts", "providerJobs", "referenceAssets", "qaResults"] as const) expect(await repo.list(t), t).toHaveLength(0);
    expect(st.files.size).toBe(2);
    const again = await importLibrary(repo, st, items, { batch: "T", origin: "demo" });
    expect(again).toMatchObject({ imported: 0, skippedDuplicate: 3 });
    expect(await repo.list("productions")).toHaveLength(2);
    expect(fetchSpy).not.toHaveBeenCalled(); fetchSpy.mockRestore();
  });
  it("skips NSFW-labelled files, test placeholders and anything without a single creator", () => {
    expect(skipReason("Mila/Source_Sheets_and_Collages/MILA_016_source_original_grid_01_do_not_upload_nsfw_filter.png")).toMatch(/NSFW/);
    expect(skipReason("Zoe/Test_Placeholders/x.png")).toMatch(/test/);
    expect(skipReason("Unassigned/Needs_Review/x.png")).toMatch(/single creator/);
    expect(skipReason("Collabs/Photos/x.png")).toMatch(/single creator/);
    expect(skipReason("Sienna/Photos/x.png")).toBeNull();
  });
});
