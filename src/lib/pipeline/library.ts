// Bulk "library" import: puts an operator's existing image collection INTO Northline storage + asset records,
// without flooding Approvals. Each creator gets one ARCHIVED library production per batch; images are stored as
// ordinary assets (provider MANUAL_UPLOAD, zero identity authority). No prompt, no provider job, no QA run, no
// approval record, never a canonical reference, never published. Idempotent by sha256 per creator.
import type { Repo } from "@/lib/db/repo";
import type { Production } from "@/lib/db/records";
import type { StorageProvider } from "@/lib/providers/types";
import { TALENT_CODES, type TalentCode } from "@/lib/domain/types";
import { loadIdentity } from "@/lib/identity/service";
import { isReadOnly, ReadOnlyError } from "@/lib/runtime/mode";
import { MANUAL_UPLOAD, safeName, validateImage } from "./import";

export interface LibraryItem { talent: TalentCode; bytes: Uint8Array; filename: string; category: string }
export interface LibraryResult { imported: number; skippedDuplicate: number; invalid: { filename: string; reason: string }[]; productions: Record<string, string> }

export const libraryConcept = (batch: string) => `Image library import (${batch})`;

export async function importLibrary(repo: Repo, storage: StorageProvider, items: LibraryItem[], opts: { batch: string; origin?: "live" | "demo"; dryRun?: boolean }): Promise<LibraryResult> {
  if (isReadOnly()) throw new ReadOnlyError("importing an image library");
  const out: LibraryResult = { imported: 0, skippedDuplicate: 0, invalid: [], productions: {} };
  const origin = opts.origin ?? "live";
  for (const code of TALENT_CODES) {
    const mine = items.filter((i) => i.talent === code);
    if (!mine.length) continue;
    const prods = await repo.list("productions");
    let prod: Production | undefined = prods.find((p) => p.talent[0] === code && p.concept === libraryConcept(opts.batch));
    const existing = new Set((await repo.list("assets")).filter((a) => a.talent[0] === code && a.sha256).map((a) => a.sha256!));
    let seq = prod ? (await repo.list("assets", { productionId: prod.id })).reduce((m, a) => Math.max(m, a.seq), 0) : 0;
    for (const it of mine) {
      let info;
      try { info = validateImage(it.bytes); } catch (e) { out.invalid.push({ filename: it.filename, reason: e instanceof Error ? e.message : String(e) }); continue; }
      if (existing.has(info.sha256)) { out.skippedDuplicate++; continue; }
      existing.add(info.sha256);
      if (opts.dryRun) { out.imported++; continue; }
      if (!prod) {
        const year = new Date().getFullYear();
        const { identity } = await loadIdentity(repo, code);
        prod = await repo.insert("productions", {
          code: `${code}-${year}-${String(await repo.nextProductionSeq(code, year)).padStart(3, "0")}`, talent: [code], scope: "SOLO", contentType: "POST", platform: "instagram",
          concept: libraryConcept(opts.batch), status: "ARCHIVED", campaignId: null, storylineId: null, brief: null, qaNotes: ["Library import: not reviewed, not QA'd, not approved. Zero identity authority."],
          costUsd: 0, identityVersion: identity.id, currentAttemptId: null, origin,
        });
      }
      seq++;
      const name = safeName(it.filename);
      const storagePath = await storage.save(`library/${code}/${info.sha256.slice(0, 12)}-${name.replace(/\s+/g, "_")}`, it.bytes, info.mime!);
      await repo.insert("assets", {
        productionId: prod.id, talent: [code], kind: "IMG", seq, status: "RAW", approval: "PENDING", provider: MANUAL_UPLOAD, promptId: null, storagePath,
        filename: `${it.category}/${name}`.slice(0, 200), isReference: false, publication: "UNPUBLISHED", attemptId: null, attemptNo: 1, briefId: null, generationJobId: null,
        identityVersion: prod.identityVersion, referenceIds: [], model: null, qaStatus: "MANUAL_REVIEW_REQUIRED", current: true,
        width: info.width, height: info.height, bytes: info.bytes, sha256: info.sha256, origin,
      });
      out.imported++;
    }
    if (prod) out.productions[code] = prod.code;
  }
  return out;
}
