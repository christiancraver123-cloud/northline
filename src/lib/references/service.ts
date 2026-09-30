// Canonical reference library. References are a SEPARATE authority from generated assets:
//   MASTER_FACE = highest authority · other canonical types = supporting · generated content = zero canonical authority.
// A generated asset can become a reference ONLY via promoteGeneratedAsset(), an explicit operator action. Nothing else writes references.
import type { Repo } from "@/lib/db/repo";
import type { ReferenceAsset } from "@/lib/db/records";
import { REFERENCE_TYPES, authorityFor, AUTHORITY_RANK, type ReferenceType, type TalentCode } from "@/lib/domain/types";
import { inspectImage } from "@/lib/media/inspect";
import type { StorageProvider } from "@/lib/providers/types";
import { loadIdentity } from "@/lib/identity/service";

export class ReferenceError extends Error {}

export interface UploadInput { talent: TalentCode; type: ReferenceType; bytes: Uint8Array; filename: string; notes?: string; createdBy?: string; replaceId?: string }

const activeMaster = (refs: ReferenceAsset[], talent: TalentCode) => refs.find((r) => r.talent === talent && r.status === "ACTIVE" && r.referenceType === "MASTER_FACE");

async function insertRef(repo: Repo, storage: StorageProvider, o: UploadInput & { source: ReferenceAsset["source"]; sourceAssetId: string | null }): Promise<ReferenceAsset> {
  if (!REFERENCE_TYPES.includes(o.type)) throw new ReferenceError("Unknown reference type.");
  const info = inspectImage(o.bytes);
  if (!info.ok) throw new ReferenceError(`Not a usable image: ${info.problems.join("; ")}`);
  const all = await repo.list("referenceAssets", { talent: o.talent });
  const master = activeMaster(all, o.talent);
  if (o.type === "MASTER_FACE" && master && o.replaceId !== master.id) throw new ReferenceError("A master face already exists. Use Replace on the current master (or Set as master on another reference).");
  if (o.replaceId && !all.some((r) => r.id === o.replaceId && r.status === "ACTIVE")) throw new ReferenceError("The reference to replace is not active.");
  const { identityId } = await loadIdentity(repo, o.talent);
  const id0 = `${o.talent}/${Date.now().toString(36)}-${info.sha256.slice(0, 8)}.${info.ext}`;
  const storagePath = await storage.save(`references/${id0}`, o.bytes, info.mime!);
  // Replace first (archive old master) so the one-active-master invariant holds at every step.
  if (o.replaceId) await repo.update("referenceAssets", o.replaceId, { status: "ARCHIVED" });
  const ref = await repo.insert("referenceAssets", {
    talent: o.talent, referenceType: o.type, authority: authorityFor(o.type), status: "ACTIVE", storagePath, filename: o.filename.slice(0, 120), mime: info.mime!, bytes: info.bytes,
    sha256: info.sha256, notes: (o.notes ?? "").slice(0, 500), identityVersion: identityId, createdBy: o.createdBy ?? "operator", source: o.source, sourceAssetId: o.sourceAssetId, replacedById: null,
  });
  if (o.replaceId) await repo.update("referenceAssets", o.replaceId, { replacedById: ref.id });
  return ref;
}

export const uploadReference = (repo: Repo, storage: StorageProvider, o: UploadInput) => insertRef(repo, storage, { ...o, source: "upload", sourceAssetId: null });

export async function archiveReference(repo: Repo, id: string) {
  const r = await repo.get("referenceAssets", id);
  if (!r || r.status !== "ACTIVE") throw new ReferenceError("Reference is not active.");
  await repo.update("referenceAssets", id, { status: "ARCHIVED" });
}

/** Make an existing active reference the master. The previous master is demoted to a supporting FACE_FRONT reference (kept, not deleted). */
export async function setMaster(repo: Repo, id: string) {
  const r = await repo.get("referenceAssets", id);
  if (!r || r.status !== "ACTIVE") throw new ReferenceError("Reference is not active.");
  if (r.referenceType === "MASTER_FACE") return r;
  if (!["FACE_FRONT", "FACE_3Q_LEFT", "FACE_3Q_RIGHT", "NATURAL_CANDID", "FACE_PROFILE"].includes(r.referenceType)) throw new ReferenceError("Only a face reference can be the master face.");
  const old = activeMaster(await repo.list("referenceAssets", { talent: r.talent }), r.talent);
  if (old) await repo.update("referenceAssets", old.id, { referenceType: "FACE_FRONT", authority: "SUPPORTING", notes: `${old.notes ? old.notes + " · " : ""}demoted from master` });
  return repo.update("referenceAssets", id, { referenceType: "MASTER_FACE", authority: "MASTER" });
}

/** The ONLY path from a generated asset to a canonical reference: an explicit, noted operator action on an APPROVED asset with a real image. */
export async function promoteGeneratedAsset(repo: Repo, storage: StorageProvider, assetId: string, type: ReferenceType, operator: string, notes: string, replaceId?: string) {
  if (!operator.trim()) throw new ReferenceError("An operator name is required to promote an asset.");
  if (!notes.trim()) throw new ReferenceError("A note explaining why this generated image is canonical is required.");
  const a = await repo.get("assets", assetId);
  if (!a) throw new ReferenceError("Asset not found.");
  if (a.approval !== "APPROVED") throw new ReferenceError("Only human-approved assets can be promoted.");
  if (!a.storagePath) throw new ReferenceError("This asset has no image file (mock/demo).");
  const file = await storage.read(a.storagePath);
  if (!file) throw new ReferenceError("Asset file is missing from storage.");
  return insertRef(repo, storage, { talent: a.talent[0], type, bytes: file.bytes, filename: a.filename, notes, createdBy: operator, replaceId, source: "promoted_from_generated", sourceAssetId: a.id });
}

export async function loadReferences(repo: Repo, talent: TalentCode): Promise<ReferenceAsset[]> {
  return (await repo.list("referenceAssets", { talent })).filter((r) => r.status === "ACTIVE").sort((a, b) => AUTHORITY_RANK[b.authority] - AUTHORITY_RANK[a.authority] || a.createdAt.localeCompare(b.createdAt));
}

/** Pick the references most relevant to a shot: master first, then supporting types that match the shot framing (max `limit`). */
export function selectReferences(refs: ReferenceAsset[], shot: { description: string }, limit = 4): ReferenceAsset[] {
  const d = shot.description.toLowerCase();
  const want: ReferenceType[] = /full[- ]body|walking|outfit/.test(d) ? ["FULL_BODY", "UPPER_BODY", "FACE_FRONT"] : /candid|blurry|moment/.test(d) ? ["NATURAL_CANDID", "FACE_3Q_LEFT", "FACE_3Q_RIGHT"] : ["FACE_FRONT", "FACE_3Q_LEFT", "FACE_3Q_RIGHT", "UPPER_BODY"];
  const master = refs.filter((r) => r.referenceType === "MASTER_FACE");
  const rest = refs.filter((r) => r.referenceType !== "MASTER_FACE").sort((a, b) => (want.indexOf(a.referenceType) + 1 || 99) - (want.indexOf(b.referenceType) + 1 || 99));
  return [...master, ...rest].slice(0, limit);
}
