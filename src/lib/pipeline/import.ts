// Manual-first asset import: an image made OUTSIDE Northline (ChatGPT, a phone, an editor) becomes a normal Northline asset
// and goes through the same QA → approval pipeline. No prompt, no generation provider, no paid call.
// Lineage: asset.provider = "MANUAL_UPLOAD". Imported images NEVER become canonical references (that needs the explicit promotion flow).
import type { Repo } from "@/lib/db/repo";
import type { Asset, CreativeBrief, Production } from "@/lib/db/records";
import { TALENT_CODES, type TalentCode } from "@/lib/domain/types";
import type { StorageProvider } from "@/lib/providers/types";
import { inspectImage, MAX_IMAGE_BYTES } from "@/lib/media/inspect";
import { loadIdentity, ensureIdentities } from "@/lib/identity/service";
import { briefData, saveBrief } from "./brief";
import { contentHistory } from "./content";
import { filenameFor } from "./generate";
import { completeAttempt } from "@/lib/orchestrator/execute";
import type { Deps } from "./deps";
import { isReadOnly, ReadOnlyError } from "@/lib/runtime/mode";

export const MANUAL_UPLOAD = "MANUAL_UPLOAD";
export class ImportError extends Error {}

export interface ImportMeta { scene?: string; location?: string; outfit?: string; notes?: string; caption?: string; storyBeat?: string }
export interface ImportInput {
  talent: string; bytes: Uint8Array; filename: string; declaredMime?: string; meta?: ImportMeta; createdBy?: string;
  /** Replace the current image of an existing production (new attempt; the old asset stays in history). */
  replaceProductionId?: string;
}
export interface ImportResult { production: Production; asset: Asset; status: Production["status"]; replaced: string | null }

const clean = (s: string | undefined, max: number) => (s ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
/** Display-only, sanitized: the client filename is never used as a storage path. */
export const safeName = (name: string) => clean(name.split(/[\\/]/).pop() ?? "", 120).replace(/[^\w .()-]/g, "_") || "image";

/** Validate an upload. Content is checked by magic bytes, not by the client's MIME or extension. */
export function validateImage(bytes: Uint8Array, declaredMime?: string) {
  if (bytes.length === 0) throw new ImportError("The file is empty.");
  if (bytes.length > MAX_IMAGE_BYTES) throw new ImportError(`Images must be ${MAX_IMAGE_BYTES / 1024 / 1024} MB or smaller.`);
  if (declaredMime && !/^image\/(png|jpe?g|webp)$/i.test(declaredMime)) throw new ImportError("Only PNG, JPEG or WebP images can be imported.");
  const info = inspectImage(bytes);
  if (!info.ok || !info.mime) throw new ImportError(`Not a valid image: ${info.problems.join("; ") || "unknown format"}.`);
  return info;
}

export async function importAsset(repo: Repo, deps: Deps, i: ImportInput): Promise<ImportResult> {
  if (isReadOnly()) throw new ReadOnlyError("importing images");
  const info = validateImage(i.bytes, i.declaredMime);
  const meta = i.meta ?? {};
  const by = i.createdBy ?? "founder";
  await ensureIdentities(repo);

  let production: Production, attemptNo: number, replaced: string | null = null;
  if (i.replaceProductionId) {
    const p = await repo.get("productions", i.replaceProductionId);
    if (!p) throw new ImportError("Production not found.");
    if (["APPROVED", "SCHEDULED", "PUBLISHED", "ARCHIVED"].includes(p.status)) throw new ImportError(`${p.code} is ${p.status}; import a new image instead of replacing an approved one.`);
    if (i.talent && i.talent !== p.talent[0]) throw new ImportError(`This production belongs to ${p.talent[0]}, not ${i.talent}.`);
    production = p;
    attemptNo = (await repo.list("generationAttempts", { productionId: p.id })).reduce((m, a) => Math.max(m, a.attemptNo), 0) + 1;
    replaced = (await repo.list("assets", { productionId: p.id })).find((a) => a.current && a.kind === "IMG" && a.seq === 1)?.id ?? null;
  } else {
    if (!TALENT_CODES.includes(i.talent as TalentCode)) throw new ImportError("Choose which creator this image belongs to.");
    const code = i.talent as TalentCode, year = new Date().getFullYear();
    const { identity } = await loadIdentity(repo, code);
    const scene = clean(meta.scene, 300) || `Imported image (${safeName(i.filename)})`;
    const brief: CreativeBrief = {
      hook: scene, location: clean(meta.location, 300) || "not specified", outfit: clean(meta.outfit, 300) || "not specified", lighting: "as captured",
      storyBeat: clean(meta.storyBeat, 300) || scene, shots: [{ n: 1, kind: "IMG", description: [scene, clean(meta.notes, 300) && `Notes: ${clean(meta.notes, 300)}`].filter(Boolean).join(". ") }],
    };
    production = await repo.insert("productions", {
      code: `${code}-${year}-${String(await repo.nextProductionSeq(code, year)).padStart(3, "0")}`, talent: [code], scope: "SOLO", contentType: "POST", platform: "instagram",
      concept: scene, status: "RAW", campaignId: null, storylineId: null, brief, qaNotes: [], costUsd: 0, identityVersion: identity.id, currentAttemptId: null, origin: deps.origin,
    });
    attemptNo = 1;
    const caption = clean(meta.caption, 2200);
    if (caption) await repo.insert("captions", { productionId: production.id, talent: code, text: caption, kind: "FEED", approval: "PENDING", origin: deps.origin });
  }

  const { identity } = await loadIdentity(repo, production.talent[0]);
  const cd: CreativeBrief = production.brief ?? { hook: production.concept, location: "not specified", outfit: "not specified", lighting: "as captured", storyBeat: production.concept, shots: [{ n: 1, kind: "IMG", description: production.concept }] };
  const data = briefData({ production, identity, brief: cd, refs: [], history: await contentHistory(repo, production), deps: { ...deps, image: { name: MANUAL_UPLOAD, model: null, generate: async () => { throw new Error("manual upload"); } } }, revision: null });
  data.referencePolicy = "Imported image: no references were used to make it. Canonical references are used only to CHECK it.";
  const brief = await saveBrief(repo, production.id, data, [], deps.origin);
  const attempt = await repo.insert("generationAttempts", {
    productionId: production.id, attemptNo, briefId: brief.id, trigger: replaced ? "regenerate" : "initial", status: "GENERATING", shots: [1], parentAttemptId: production.currentAttemptId,
    reason: replaced ? `manual replacement by ${by}` : `manual upload by ${by}`, feedback: [], finishedAt: null, origin: deps.origin,
  });
  // Older images of this slot stay in history; only the new one is current.
  for (const old of (await repo.list("assets", { productionId: production.id })).filter((a) => a.current && a.kind === "IMG" && a.seq === 1)) await repo.update("assets", old.id, { current: false });
  const filename = filenameFor(production.code, "IMG", 1, "RAW", info.ext!, attemptNo);
  const storagePath = await deps.storage.save(`${production.code}/${filename}`, i.bytes, info.mime!);
  const asset = await repo.insert("assets", {
    productionId: production.id, talent: production.talent, kind: "IMG", seq: 1, status: "RAW", approval: "PENDING", provider: MANUAL_UPLOAD, promptId: null, storagePath, filename,
    isReference: false, publication: "UNPUBLISHED", attemptId: attempt.id, attemptNo, briefId: brief.id, generationJobId: null, identityVersion: identity.id, referenceIds: [], model: null,
    qaStatus: "QA_PENDING", current: true, width: info.width, height: info.height, bytes: info.bytes, sha256: info.sha256, origin: deps.origin,
  });
  await repo.update("productions", production.id, { currentAttemptId: attempt.id, status: "RAW" });
  await deps.trace?.("PRODUCTION_MANAGER", "MANUAL_UPLOAD", `${by} ${replaced ? "replaced the image of" : "imported an image for"} ${production.code} (${safeName(i.filename)}, ${info.width}x${info.height})`, { data: { assetId: asset.id } });
  // Same QA + routing as generated images (Identity / Technical / Content → approval queue). Vision QA runs only if configured.
  const out = await completeAttempt(repo, deps, production.id, attempt.id);
  return { production: (await repo.get("productions", production.id))!, asset: (await repo.get("assets", asset.id))!, status: out.productionStatus, replaced };
}
