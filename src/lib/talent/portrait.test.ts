// Portrait source rule: MASTER_FACE → best active canonical reference → fallback. Never generated content; never writes.
import { describe, expect, it } from "vitest";
import { pickPortrait, pickPortraits } from "./portrait";
import { loadPortraits } from "./portraits-server";
import { FileRepo } from "@/lib/db/file-store";
import type { ReferenceType, TalentCode } from "@/lib/domain/types";

const ref = (id: string, talent: TalentCode, referenceType: ReferenceType, status: "ACTIVE" | "ARCHIVED" = "ACTIVE", createdAt = "2026-10-01T00:00:00Z") =>
  ({ id, talent, referenceType, authority: referenceType === "MASTER_FACE" ? "MASTER" as const : "SUPPORTING" as const, status, createdAt });

describe("creator portrait source", () => {
  it("uses the active MASTER_FACE first", () => {
    const p = pickPortrait([ref("full", "SIE", "FULL_BODY"), ref("m", "SIE", "MASTER_FACE"), ref("front", "SIE", "FACE_FRONT")], "SIE");
    expect(p).toMatchObject({ refId: "m", source: "MASTER_FACE", url: "/api/references/m/file" });
  });
  it("falls back to the best active canonical reference, face-forward first; archived refs are ignored", () => {
    const p = pickPortrait([ref("m", "ZOE", "MASTER_FACE", "ARCHIVED"), ref("full", "ZOE", "FULL_BODY"), ref("prof", "ZOE", "FACE_PROFILE"), ref("q", "ZOE", "FACE_3Q_LEFT")], "ZOE");
    expect(p).toMatchObject({ refId: "q", source: "CANONICAL_REFERENCE", referenceType: "FACE_3Q_LEFT" });
  });
  it("never borrows another creator's reference, and falls back to colour/initial", () => {
    expect(pickPortrait([ref("m", "SIE", "MASTER_FACE")], "MIL")).toEqual({ talent: "MIL", refId: null, url: null, source: "FALLBACK", referenceType: null });
    expect(Object.keys(pickPortraits([]))).toEqual(["SIE", "ALE", "MIL", "VES", "ZOE", "SKY"]);
  });
  it("loadPortraits reads the reference library only: generated/imported assets are never portraits, and nothing is written", async () => {
    const repo = new FileRepo(null);
    await repo.insert("assets", { productionId: "p", talent: ["VES"], kind: "IMG", seq: 1, status: "APPROVED", approval: "APPROVED", provider: "MANUAL_UPLOAD", promptId: null, storagePath: "x/y.png", filename: "y.png", isReference: false, publication: "UNPUBLISHED", current: true } as never);
    const before = JSON.stringify([await repo.list("referenceAssets"), await repo.list("assets")]);
    const p = await loadPortraits(repo);
    expect(p.VES.source).toBe("FALLBACK");
    expect(JSON.stringify([await repo.list("referenceAssets"), await repo.list("assets")])).toBe(before);
  });
});
