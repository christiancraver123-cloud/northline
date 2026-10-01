import { describe, expect, it } from "vitest";
import { FileRepo } from "@/lib/db/file-store";
import { mockImageWithBytes, mockVideo } from "@/lib/providers/mock";
import { executeCreate, type Deps } from "@/lib/orchestrator/execute";
import { decide } from "@/lib/orchestrator/approvals";
import { encodePng } from "@/lib/media/png";
import { REJECTION_REASONS, cleanReasons, encodeDecisionNotes, parseDecisionNotes } from "./reasons";

const tiny = () => encodePng({ width: 64, height: 96, channels: 3, data: Uint8Array.from({ length: 64 * 96 * 3 }, (_, i) => (i * 7) & 255) });

describe("structured rejection reasons", () => {
  it("round-trips codes + free text and ignores unknown codes", () => {
    const n = encodeDecisionNotes(["face_drift", "wrong_eyes", "bogus", "face_drift"], "  too soft  ");
    expect(n).toBe("[reasons: face_drift, wrong_eyes] too soft");
    expect(parseDecisionNotes(n)).toEqual({ reasons: ["face_drift", "wrong_eyes"], text: "too soft" });
    expect(parseDecisionNotes("plain old note")).toEqual({ reasons: [], text: "plain old note" }); // legacy notes still parse
    expect(encodeDecisionNotes([], "just text")).toBe("just text");
    expect(encodeDecisionNotes(["bogus"], "")).toBe("");
    expect(cleanReasons(["other", "x"])).toEqual(["other"]);
  });
  it("offers every reason the operator asked for", () => {
    const codes = REJECTION_REASONS.map(([c]) => c);
    for (const c of ["face_drift", "wrong_eyes", "wrong_body", "looks_ai", "anatomy", "too_posed", "bad_lighting", "bad_environment", "weak_charisma", "wrong_outfit", "continuity", "unwanted_text", "personality_mismatch", "other"]) expect(codes).toContain(c);
  });
  it("a revision request with reasons only (no free text) is accepted and the reasons are recoverable", async () => {
    const r = new FileRepo(null);
    const files = new Map<string, Uint8Array>();
    const deps = { image: mockImageWithBytes(tiny()), video: mockVideo, storage: { async save(p: string, b: Uint8Array) { files.set(p, b); return p; }, async read(p: string) { const b = files.get(p); return b ? { bytes: b, mime: "image/png" } : null; } }, origin: "demo" } as unknown as Deps;
    await executeCreate(r, { talent: ["SIE"], format: "POST", concept: "coffee" }, deps);
    const ap = (await r.list("approvals")).find((a) => a.state === "PENDING")!;
    await decide(r, ap.id, "REVISION_REQUESTED", encodeDecisionNotes(["face_drift", "looks_ai"]), "operator");
    const after = (await r.get("approvals", ap.id))!;
    expect(after.state).toBe("REVISION_REQUESTED");
    expect(parseDecisionNotes(after.notes).reasons).toEqual(["face_drift", "looks_ai"]);
  });
  it("a revision with neither reasons nor notes is still refused", async () => {
    const r = new FileRepo(null);
    const deps = { image: mockImageWithBytes(tiny()), video: mockVideo, storage: { async save(p: string) { return p; }, async read() { return null; } }, origin: "demo" } as unknown as Deps;
    await executeCreate(r, { talent: ["SIE"], format: "POST", concept: "coffee" }, deps);
    const ap = (await r.list("approvals")).find((a) => a.state === "PENDING")!;
    await expect(decide(r, ap.id, "REVISION_REQUESTED", encodeDecisionNotes([], ""), "operator")).rejects.toThrow(/reason is required/i);
  });
});
